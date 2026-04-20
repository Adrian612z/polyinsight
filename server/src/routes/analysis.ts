import { Router, Request, Response } from 'express'
import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
import { supabase } from '../services/supabase.js'
import { authMiddleware } from '../middleware/auth.js'
import { deductCredits, refundAnalysisCreditsIfNeeded } from '../services/credit.js'
import { config } from '../config.js'
import { extractPolymarketSlug, isValidPolymarketUrl } from '../utils/polymarket.js'
import { getActiveSubscription } from '../services/billing.js'
import { cancelAnalysisJobByRecord, enqueueAnalysisJob } from '../services/analysisJobs.js'
import { buildAnalysisFlowView } from '../services/analysisFlow.js'
import { getAttributionSnapshotBySessionId, recordGrowthEvent } from '../services/tracking.js'
import { resolveCanonicalPolymarketEventUrl } from '../analysis-runtime/polymarketFetch.js'

const router = Router()

function isMissingAnalysisAttributionColumn(error: { code?: string; message?: string; details?: string | null; hint?: string | null }): boolean {
  const message = [error.code, error.message, error.details, error.hint].filter(Boolean).join(' ')
  return /analysis_records\.attribution_|attribution_session_id|attribution_campaign_code|attribution_referral_code|attribution_source_type|attribution_source_platform/i.test(message)
    && /column|schema cache|does not exist|not found|42703/i.test(message)
}

// Limit analysis creation per authenticated user without affecting poll/history requests.
const createAnalysisLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.userId || ipKeyGenerator(req.ip || ''),
  message: { error: 'Analysis submission rate limit exceeded, please try again later' },
})

// POST /api/analysis - Create analysis with credit deduction
router.post('/', authMiddleware, createAnalysisLimiter, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!
    const { url, lang, trackingSessionId } = req.body

    if (!url || typeof url !== 'string') {
      res.status(400).json({ error: 'Please provide a Polymarket URL' })
      return
    }

    if (!isValidPolymarketUrl(url)) {
      res.status(400).json({ error: 'Invalid URL. Please provide a valid Polymarket market URL.' })
      return
    }

    const slug = extractPolymarketSlug(url)
    if (!slug) {
      res.status(400).json({ error: 'Invalid URL. Please provide a valid Polymarket market URL.' })
      return
    }

    const canonicalUrl = await resolveCanonicalPolymarketEventUrl(url)
    if (!canonicalUrl) {
      res.status(400).json({ error: 'Invalid URL. Please provide a valid Polymarket market URL.' })
      return
    }

    // Validate lang parameter
    const validLang = lang === 'zh' ? 'zh' : 'en'
    const trackingSnapshot = await getAttributionSnapshotBySessionId(
      typeof trackingSessionId === 'string' ? trackingSessionId : null,
    )
    const activeSubscription = await getActiveSubscription(userId)
    const hasUnlimitedAccess = Boolean(activeSubscription?.unlimited)
    const { count: activeJobsCount, error: activeJobsError } = await supabase
      .from('analysis_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('status', ['queued', 'running'])

    if (activeJobsError) throw activeJobsError

    if ((activeJobsCount || 0) >= config.analysisMaxActiveJobsPerUser) {
      res.status(429).json({
        error: `Too many active analyses. You can have at most ${config.analysisMaxActiveJobsPerUser} queued or running analyses at once.`,
        code: 'TOO_MANY_ACTIVE_ANALYSES',
        active_count: activeJobsCount || 0,
        limit: config.analysisMaxActiveJobsPerUser,
      })
      return
    }

    // 1. Create analysis record
    let record: {
      id: string
      event_url: string
      status: string
      user_id: string
      credits_charged: number
    } | null = null

    const insertPayload: Record<string, unknown> = {
      event_url: canonicalUrl,
      status: 'pending',
      user_id: userId,
      credits_charged: hasUnlimitedAccess ? 0 : config.analysisCost,
      attribution_session_id: trackingSnapshot?.sessionId || null,
      attribution_campaign_code: trackingSnapshot?.campaignCode || null,
      attribution_referral_code: trackingSnapshot?.referralCode || null,
      attribution_source_type: trackingSnapshot?.sourceType || null,
      attribution_source_platform: trackingSnapshot?.sourcePlatform || null,
    }

    let insertResult = await supabase
      .from('analysis_records')
      .insert(insertPayload)
      .select()
      .single()

    if (insertResult.error && isMissingAnalysisAttributionColumn(insertResult.error)) {
      insertResult = await supabase
        .from('analysis_records')
        .insert({
          event_url: canonicalUrl,
          status: 'pending',
          user_id: userId,
          credits_charged: hasUnlimitedAccess ? 0 : config.analysisCost,
        })
        .select()
        .single()
    }

    if (insertResult.error || !insertResult.data) throw insertResult.error || new Error('Failed to create analysis record')
    record = insertResult.data as typeof record

    // 2. Deduct credits (includes referral commission)
    let newBalance: number
    if (hasUnlimitedAccess) {
      const { data: userBalance } = await supabase
        .from('users')
        .select('credit_balance')
        .eq('id', userId)
        .single()

      newBalance = userBalance?.credit_balance ?? 0
    } else {
      try {
        newBalance = await deductCredits(
          userId,
          config.analysisCost,
          'analysis_spend',
          record.id,
          `Analysis: ${canonicalUrl.slice(0, 60)}...`
        )
      } catch (err: unknown) {
        // Rollback: delete the record
        await supabase.from('analysis_records').delete().eq('id', record.id)
        if (err instanceof Error && err.message === 'INSUFFICIENT_CREDITS') {
          res.status(402).json({ error: 'Insufficient credits', code: 'INSUFFICIENT_CREDITS' })
          return
        }
        throw err
      }
    }

    try {
      await enqueueAnalysisJob({
        analysisRecordId: record.id,
        userId,
        lang: validLang,
        payload: {
          url: canonicalUrl,
          originalUrl: url,
          slug,
          userId,
          recordId: record.id,
          lang: validLang,
        },
      })
    } catch (queueErr) {
      console.error('Failed to enqueue analysis job:', queueErr)
      await supabase.from('analysis_records').delete().eq('id', record.id)
      if (!hasUnlimitedAccess) {
        await refundAnalysisCreditsIfNeeded(
          userId,
          record.id,
          `Refund for analysis that failed to queue: ${canonicalUrl.slice(0, 60)}...`
        )
      }
      throw queueErr
    }

    if (trackingSnapshot) {
      await recordGrowthEvent({
        eventName: 'analysis_created',
        sessionId: trackingSnapshot.sessionId,
        visitorId: trackingSnapshot.visitorId,
        userId,
        pagePath: '/analyze',
        metadata: {
          analysisRecordId: record.id,
          eventUrl: canonicalUrl,
          creditsCharged: hasUnlimitedAccess ? 0 : config.analysisCost,
        },
      })
    }

    res.json({
      record_id: record.id,
      remaining_balance: newBalance,
    })
  } catch (err) {
    console.error('Analysis error:', err)
    res.status(500).json({ error: 'Failed to create analysis' })
  }
})

// GET /api/analysis/history - List user's analysis records
router.get('/history', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!
    const page = parseInt(req.query.page as string) || 1
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50)
    const from = (page - 1) * limit
    const to = from + limit - 1

    const { count } = await supabase
      .from('analysis_records')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)

    const { data, error } = await supabase
      .from('analysis_records')
      .select('id, event_url, analysis_result, status, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) throw error

    res.json({ records: data || [], total: count || 0, page })
  } catch (err) {
    console.error('History error:', err)
    res.status(500).json({ error: 'Failed to fetch history' })
  }
})

// GET /api/analysis/:id/poll - Poll analysis status (for progressive rendering)
router.get('/:id/poll', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!
    const { data, error } = await supabase
      .from('analysis_records')
      .select('status, analysis_result')
      .eq('id', req.params.id)
      .eq('user_id', userId)
      .single()

    if (error || !data) {
      res.status(404).json({ error: 'Record not found' })
      return
    }

    const { data: jobs, error: jobsError } = await supabase
      .from('analysis_jobs')
      .select('id, status, attempts, max_attempts, last_error, locked_by, locked_at, started_at, finished_at, created_at, updated_at')
      .eq('analysis_record_id', req.params.id)
      .order('created_at', { ascending: false })
      .limit(1)

    if (jobsError) throw jobsError

    const latestJob = Array.isArray(jobs) && jobs.length > 0 ? jobs[0] : null
    const flow = buildAnalysisFlowView({
      recordStatus: data.status as 'pending' | 'completed' | 'failed' | 'cancelled',
      analysisResult: data.analysis_result,
      jobStatus: latestJob?.status || null,
      jobError: latestJob?.last_error || null,
    })

    res.json({
      ...data,
      error: latestJob?.last_error || null,
      latest_job: latestJob,
      flow,
    })
  } catch (err) {
    console.error('Poll error:', err)
    res.status(500).json({ error: 'Failed to poll analysis' })
  }
})

router.get('/:id/detail', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!
    const { data, error } = await supabase
      .from('analysis_records')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', userId)
      .maybeSingle()

    if (error) throw error
    if (!data) {
      res.status(404).json({ error: 'Record not found' })
      return
    }

    const { data: jobs, error: jobsError } = await supabase
      .from('analysis_jobs')
      .select('id, status, attempts, max_attempts, last_error, locked_by, locked_at, started_at, finished_at, created_at, updated_at')
      .eq('analysis_record_id', req.params.id)
      .order('created_at', { ascending: false })

    if (jobsError) throw jobsError

    const latestJob = Array.isArray(jobs) && jobs.length > 0 ? jobs[0] : null
    const flow = buildAnalysisFlowView({
      recordStatus: data.status as 'pending' | 'completed' | 'failed' | 'cancelled',
      analysisResult: data.analysis_result,
      jobStatus: latestJob?.status || null,
      jobError: latestJob?.last_error || null,
    })

    res.json({
      analysis: data,
      latest_job: latestJob,
      jobs: jobs || [],
      flow,
      error: latestJob?.last_error || null,
    })
  } catch (err) {
    console.error('Detail error:', err)
    res.status(500).json({ error: 'Failed to fetch analysis detail' })
  }
})

// POST /api/analysis/:id/cancel - Cancel an analysis
router.post('/:id/cancel', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!
    const { data: record, error: recordErr } = await supabase
      .from('analysis_records')
      .select('id, status, event_url')
      .eq('id', req.params.id)
      .eq('user_id', userId)
      .maybeSingle()

    if (recordErr) throw recordErr
    if (!record) {
      res.status(404).json({ error: 'Record not found' })
      return
    }

    if (record.status === 'completed' || record.status === 'failed') {
      res.status(409).json({ error: 'Only pending analyses can be cancelled' })
      return
    }

    if (record.status === 'cancelled') {
      res.json({ success: true, refunded: false })
      return
    }

    const { data, error } = await supabase
      .from('analysis_records')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .eq('user_id', userId)
      .eq('status', 'pending')
      .select('id')

    if (error) throw error
    if (!data || data.length === 0) {
      res.status(404).json({ error: 'Record not found' })
      return
    }

    const refund = await refundAnalysisCreditsIfNeeded(
      userId,
      req.params.id,
      `Refund for cancelled analysis: ${record.event_url.slice(0, 60)}...`
    )

    await cancelAnalysisJobByRecord(req.params.id)

    res.json({ success: true, refunded: refund.refunded, balance: refund.balance })
  } catch (err) {
    console.error('Cancel error:', err)
    res.status(500).json({ error: 'Failed to cancel analysis' })
  }
})

// DELETE /api/analysis/:id - Delete an analysis record
router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!
    const { data, error } = await supabase
      .from('analysis_records')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', userId)
      .select('id')

    if (error) throw error
    if (!data || data.length === 0) {
      res.status(404).json({ error: 'Record not found' })
      return
    }

    res.json({ success: true })
  } catch (err) {
    console.error('Delete error:', err)
    res.status(500).json({ error: 'Failed to delete analysis' })
  }
})

export default router
