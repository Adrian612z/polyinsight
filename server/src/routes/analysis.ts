import { Router, Request, Response } from 'express'
import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
import { supabase } from '../services/supabase.js'
import { authMiddleware } from '../middleware/auth.js'
import { deductCredits, refundAnalysisCreditsIfNeeded } from '../services/credit.js'
import { config } from '../config.js'
import { extractPolymarketSlug, isValidPolymarketUrl, toCanonicalPolymarketEventUrl } from '../utils/polymarket.js'
import { getActiveSubscription } from '../services/billing.js'

const router = Router()

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
    const { url, lang } = req.body

    if (!url || typeof url !== 'string') {
      res.status(400).json({ error: 'Please provide a Polymarket URL' })
      return
    }

    if (!isValidPolymarketUrl(url)) {
      res.status(400).json({ error: 'Invalid URL. Please provide a valid Polymarket market URL.' })
      return
    }

    const slug = extractPolymarketSlug(url)
    const canonicalUrl = toCanonicalPolymarketEventUrl(url)
    if (!slug || !canonicalUrl) {
      res.status(400).json({ error: 'Invalid URL. Please provide a valid Polymarket market URL.' })
      return
    }

    // Validate lang parameter
    const validLang = lang === 'zh' ? 'zh' : 'en'
    const activeSubscription = await getActiveSubscription(userId)
    const hasUnlimitedAccess = Boolean(activeSubscription?.unlimited)

    // 1. Create analysis record
    const { data: record, error: dbError } = await supabase
      .from('analysis_records')
      .insert({
        event_url: canonicalUrl,
        status: 'pending',
        user_id: userId,
        credits_charged: hasUnlimitedAccess ? 0 : config.analysisCost,
      })
      .select()
      .single()

    if (dbError) throw dbError

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

    // 3. Trigger n8n webhook asynchronously; stale/failed records are refunded later.
    const webhookUrl = validLang === 'zh' ? config.n8nWebhookUrlZh : config.n8nWebhookUrl
    const failAnalysisAndRefund = async (reason: string) => {
      try {
        await supabase
          .from('analysis_records')
          .update({
            status: 'failed',
            updated_at: new Date().toISOString(),
          })
          .eq('id', record.id)
          .eq('user_id', userId)
          .eq('status', 'pending')

        await refundAnalysisCreditsIfNeeded(
          userId,
          record.id,
          `Refund for analysis that failed to start: ${canonicalUrl.slice(0, 60)}...`
        )
      } catch (refundErr) {
        console.error('Failed to mark analysis as failed/refunded:', refundErr)
      }

      console.error('n8n webhook error:', reason)
    }

    void fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: canonicalUrl,
          original_url: url,
          slug,
          user_id: userId,
          record_id: record.id,
        }),
      })
      .then(async (response) => {
        if (!response.ok) {
          await failAnalysisAndRefund(`Webhook responded with status ${response.status}`)
        }
      })
      .catch(async (err) => {
        await failAnalysisAndRefund(err instanceof Error ? err.message : 'Unknown webhook error')
      })

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

    res.json(data)
  } catch (err) {
    console.error('Poll error:', err)
    res.status(500).json({ error: 'Failed to poll analysis' })
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
