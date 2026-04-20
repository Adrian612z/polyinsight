import { randomUUID } from 'crypto'
import { supabase } from './supabase.js'
import { config } from '../config.js'
import { refundAnalysisCreditsIfNeeded } from './credit.js'
import { ADMIN_MANUAL_FEATURED_USER_ID, upsertFeaturedFromAnalysisSource } from './featured.js'
import { markFirstCompletedAnalysis } from './tracking.js'

export type AnalysisEngine = 'n8n' | 'code'
export type AnalysisJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface AnalysisJobPayload {
  url: string
  originalUrl: string
  slug: string
  userId: string
  recordId: string
  lang: 'en' | 'zh'
}

export interface AnalysisJobRecord {
  id: string
  analysis_record_id: string
  user_id: string
  engine: AnalysisEngine
  lang: 'en' | 'zh'
  status: AnalysisJobStatus
  payload: AnalysisJobPayload
  attempts: number
  max_attempts: number
  last_error: string | null
  locked_by: string | null
  locked_at: string | null
  started_at: string | null
  finished_at: string | null
  created_at: string
  updated_at: string
}

const ANALYSIS_JOB_SELECT = `
  id,
  analysis_record_id,
  user_id,
  engine,
  lang,
  status,
  payload,
  attempts,
  max_attempts,
  last_error,
  locked_by,
  locked_at,
  started_at,
  finished_at,
  created_at,
  updated_at
`

let didWarnMissingClaimRpc = false

function isMissingAnalysisAttributionColumn(error: {
  code?: string
  message?: string
  details?: string | null
  hint?: string | null
}): boolean {
  const message = [error.code, error.message, error.details, error.hint].filter(Boolean).join(' ')
  return /analysis_records\.attribution_|attribution_session_id|attribution_campaign_code|attribution_referral_code|attribution_source_type|attribution_source_platform/i.test(message)
    && /column|schema cache|does not exist|not found|42703/i.test(message)
}

export async function enqueueAnalysisJob(input: {
  analysisRecordId: string
  userId: string
  payload: AnalysisJobPayload
  lang: 'en' | 'zh'
  engine?: AnalysisEngine
  maxAttempts?: number
}): Promise<AnalysisJobRecord> {
  const engine = input.engine || config.analysisEngine
  const { data, error } = await supabase
    .from('analysis_jobs')
    .insert({
      analysis_record_id: input.analysisRecordId,
      user_id: input.userId,
      payload: input.payload,
      lang: input.lang,
      engine,
      status: 'queued',
      max_attempts: input.maxAttempts || 3,
    })
    .select(ANALYSIS_JOB_SELECT)
    .single()

  if (error || !data) throw error || new Error('Failed to enqueue analysis job')
  return data as AnalysisJobRecord
}

export async function cancelAnalysisJobByRecord(recordId: string): Promise<void> {
  const now = new Date().toISOString()
  await supabase
    .from('analysis_jobs')
    .update({
      status: 'cancelled',
      locked_by: null,
      locked_at: null,
      updated_at: now,
      finished_at: now,
    })
    .eq('analysis_record_id', recordId)
    .in('status', ['queued', 'running'])
}

export async function claimQueuedAnalysisJobs(workerId: string, limit: number): Promise<AnalysisJobRecord[]> {
  if (limit <= 0) return []

  const { data, error } = await supabase.rpc('claim_analysis_jobs', {
    p_worker_id: workerId,
    p_limit: limit,
  })

  if (!error) {
    return (data || []) as AnalysisJobRecord[]
  }

  if (!isMissingClaimRpc(error)) {
    throw error
  }

  if (!didWarnMissingClaimRpc) {
    didWarnMissingClaimRpc = true
    console.warn('[AnalysisJob] claim_analysis_jobs RPC missing, using legacy claim path')
  }
  return claimQueuedAnalysisJobsLegacy(workerId, limit)
}

async function claimQueuedAnalysisJobsLegacy(workerId: string, limit: number): Promise<AnalysisJobRecord[]> {
  const candidateLimit = Math.max(limit * 3, limit)
  const { data: candidates, error } = await supabase
    .from('analysis_jobs')
    .select(ANALYSIS_JOB_SELECT)
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(candidateLimit)

  if (error) throw error
  if (!candidates || candidates.length === 0) return []

  const claimed: AnalysisJobRecord[] = []
  const now = new Date().toISOString()

  for (const candidate of candidates as AnalysisJobRecord[]) {
    if (claimed.length >= limit) break

    const { data: updated, error: claimErr } = await supabase
      .from('analysis_jobs')
      .update({
        status: 'running',
        locked_by: workerId,
        locked_at: now,
        started_at: candidate.started_at || now,
        attempts: (candidate.attempts || 0) + 1,
        updated_at: now,
      })
      .eq('id', candidate.id)
      .eq('status', 'queued')
      .select(ANALYSIS_JOB_SELECT)
      .maybeSingle()

    if (claimErr) throw claimErr
    if (updated) {
      claimed.push(updated as AnalysisJobRecord)
    }
  }

  return claimed
}

export async function heartbeatAnalysisJob(jobId: string, workerId: string): Promise<boolean> {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('analysis_jobs')
    .update({
      locked_at: now,
      updated_at: now,
    })
    .eq('id', jobId)
    .eq('status', 'running')
    .eq('locked_by', workerId)
    .select('id')
    .maybeSingle()

  if (error) throw error
  return Boolean(data)
}

export async function markAnalysisJobCompleted(jobId: string, workerId?: string): Promise<boolean> {
  const now = new Date().toISOString()
  let query = supabase
    .from('analysis_jobs')
    .update({
      status: 'completed',
      finished_at: now,
      updated_at: now,
      locked_by: null,
      locked_at: null,
    })
    .eq('id', jobId)

  if (workerId) {
    query = query.eq('status', 'running').eq('locked_by', workerId)
  }

  const { data, error } = await query.select('id').maybeSingle()
  if (error) throw error
  return Boolean(data)
}

export async function markAnalysisJobFailed(
  jobId: string,
  errorMessage: string,
  workerId?: string
): Promise<boolean> {
  const now = new Date().toISOString()
  let query = supabase
    .from('analysis_jobs')
    .update({
      status: 'failed',
      finished_at: now,
      updated_at: now,
      locked_by: null,
      locked_at: null,
      last_error: errorMessage,
    })
    .eq('id', jobId)

  if (workerId) {
    query = query.eq('status', 'running').eq('locked_by', workerId)
  }

  const { data, error } = await query.select('id').maybeSingle()
  if (error) throw error
  return Boolean(data)
}

export async function requeueAnalysisJob(
  jobId: string,
  errorMessage: string,
  workerId?: string
): Promise<boolean> {
  const now = new Date().toISOString()
  let query = supabase
    .from('analysis_jobs')
    .update({
      status: 'queued',
      updated_at: now,
      locked_by: null,
      locked_at: null,
      last_error: errorMessage,
    })
    .eq('id', jobId)

  if (workerId) {
    query = query.eq('status', 'running').eq('locked_by', workerId)
  }

  const { data, error } = await query.select('id').maybeSingle()
  if (error) throw error
  return Boolean(data)
}

export async function requeueStaleRunningJobs(): Promise<number> {
  const staleBefore = new Date(Date.now() - config.analysisJobLockMs).toISOString()
  const { data: stale, error } = await supabase
    .from('analysis_jobs')
    .select(ANALYSIS_JOB_SELECT)
    .eq('status', 'running')
    .lt('locked_at', staleBefore)

  if (error) throw error
  if (!stale || stale.length === 0) return 0

  let count = 0
  for (const job of stale as AnalysisJobRecord[]) {
    const recordStatus = await getAnalysisRecordStatus(job.analysis_record_id)

    if (recordStatus && recordStatus !== 'pending') {
      await markAnalysisJobFailed(job.id, `Analysis record is already ${recordStatus}; stale job will not be re-queued`)
      count += 1
      continue
    }

    const maxAttemptsReached = job.attempts >= job.max_attempts
    if (maxAttemptsReached) {
      await markAnalysisJobFailed(job.id, 'Worker lock expired and max attempts reached')
      await failAnalysisRecordAndRefund(job, 'Analysis worker stalled and exceeded retry limit')
    } else {
      await requeueAnalysisJob(job.id, 'Worker lock expired, re-queued')
    }
    count += 1
  }

  return count
}

export async function failAnalysisRecordAndRefund(
  job: Pick<AnalysisJobRecord, 'analysis_record_id' | 'user_id' | 'payload'>,
  reason: string
): Promise<void> {
  await supabase
    .from('analysis_records')
    .update({
      status: 'failed',
      updated_at: new Date().toISOString(),
    })
    .eq('id', job.analysis_record_id)
    .eq('status', 'pending')

  await refundAnalysisCreditsIfNeeded(
    job.user_id,
    job.analysis_record_id,
    `Refund for analysis failure: ${job.payload.url.slice(0, 60)}...`
  )

  console.error('[AnalysisJob] Failed:', job.analysis_record_id, reason)
}

export async function markAnalysisRecordCompleted(recordId: string, result: string): Promise<void> {
  let updateResult = await supabase
    .from('analysis_records')
    .update({
      status: 'completed',
      analysis_result: result,
      updated_at: new Date().toISOString(),
    })
    .eq('id', recordId)
    .eq('status', 'pending')
    .select(`
      id,
      user_id,
      event_url,
      attribution_session_id,
      attribution_campaign_code,
      attribution_referral_code,
      attribution_source_type,
      attribution_source_platform
    `)
    .maybeSingle()

  if (updateResult.error && isMissingAnalysisAttributionColumn(updateResult.error)) {
    updateResult = await supabase
      .from('analysis_records')
      .update({
        status: 'completed',
        analysis_result: result,
        updated_at: new Date().toISOString(),
      })
      .eq('id', recordId)
      .eq('status', 'pending')
      .select('id, user_id, event_url')
      .maybeSingle()
  }

  if (updateResult.error) throw updateResult.error
  const data = updateResult.data as {
    id: string
    user_id: string
    event_url: string
    attribution_session_id?: string | null
    attribution_campaign_code?: string | null
    attribution_referral_code?: string | null
    attribution_source_type?: string | null
    attribution_source_platform?: string | null
  } | null

  if (data?.user_id && !data.user_id.startsWith('system:')) {
    await markFirstCompletedAnalysis({
      userId: data.user_id,
      analysisRecordId: data.id,
      sessionId: data.attribution_session_id || null,
      campaignCode: data.attribution_campaign_code || null,
      referralCode: data.attribution_referral_code || null,
      sourceType: data.attribution_source_type || null,
      sourcePlatform: data.attribution_source_platform || null,
      eventUrl: data.event_url || null,
    })
  }

  if (data?.user_id === ADMIN_MANUAL_FEATURED_USER_ID) {
    try {
      await upsertFeaturedFromAnalysisSource({
        analysisRecordId: data.id,
        eventUrl: data.event_url,
        analysisResult: result,
      })
    } catch (featuredErr) {
      console.error('[Featured] Failed to upsert manual featured analysis:', featuredErr)
    }
  }
}

export async function updateAnalysisPartialResult(recordId: string, partialResult: string): Promise<void> {
  const { error } = await supabase
    .from('analysis_records')
    .update({
      analysis_result: partialResult,
      updated_at: new Date().toISOString(),
    })
    .eq('id', recordId)
    .eq('status', 'pending')

  if (error) throw error
}

export function createAnalysisWorkerId(): string {
  return `worker:${process.pid}:${randomUUID()}`
}

async function getAnalysisRecordStatus(recordId: string): Promise<AnalysisJobStatus | 'pending' | null> {
  const { data, error } = await supabase
    .from('analysis_records')
    .select('status')
    .eq('id', recordId)
    .maybeSingle()

  if (error) throw error
  return (data?.status as AnalysisJobStatus | 'pending' | null) || null
}

function isMissingClaimRpc(error: {
  code?: string
  message?: string
  details?: string | null
  hint?: string | null
}): boolean {
  const message = [error.message, error.details, error.hint].filter(Boolean).join(' ')
  return /claim_analysis_jobs/i.test(message) && /find the function|does not exist|schema cache|not found/i.test(message)
}
