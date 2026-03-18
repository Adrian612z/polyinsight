import { config } from '../config.js'
import { supabase } from './supabase.js'
import type { AnalysisJobRecord } from './analysisJobs.js'

const DEFAULT_N8N_TIMEOUT_MS = 15 * 60 * 1000
const DEFAULT_N8N_POLL_MS = 2000

interface AnalysisRecordStatus {
  status: string
  analysis_result: string | null
}

export async function runN8nAnalysisPipeline(job: AnalysisJobRecord): Promise<string> {
  await triggerN8nWebhook(job)
  return waitForAnalysisRecordCompletion(job.analysis_record_id)
}

export async function triggerN8nWebhook(job: Pick<AnalysisJobRecord, 'lang' | 'payload'>): Promise<void> {
  const webhookUrl = job.lang === 'zh' ? config.n8nWebhookUrlZh : config.n8nWebhookUrl
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      url: job.payload.url,
      original_url: job.payload.originalUrl,
      slug: job.payload.slug,
      user_id: job.payload.userId,
      record_id: job.payload.recordId,
    }),
  })

  if (!response.ok) {
    throw new Error(`n8n webhook responded with status ${response.status}`)
  }
}

export async function waitForAnalysisRecordCompletion(
  recordId: string,
  options: {
    timeoutMs?: number
    pollMs?: number
    onProgress?: (partialResult: string) => Promise<void> | void
  } = {}
): Promise<string> {
  const timeoutMs = Math.max(options.timeoutMs || DEFAULT_N8N_TIMEOUT_MS, 5_000)
  const pollMs = Math.max(options.pollMs || DEFAULT_N8N_POLL_MS, 500)
  const startedAt = Date.now()
  let lastPartial: string | null = null

  while (Date.now() - startedAt < timeoutMs) {
    const record = await fetchAnalysisRecordStatus(recordId)
    if (record.analysis_result && record.analysis_result !== lastPartial) {
      lastPartial = record.analysis_result
      await options.onProgress?.(record.analysis_result)
    }

    if (record.status === 'completed') {
      if (!record.analysis_result) {
        throw new Error('n8n completed the analysis but did not write analysis_result')
      }
      return record.analysis_result
    }

    if (record.status === 'failed') {
      throw new Error('n8n marked the analysis record as failed')
    }

    if (record.status === 'cancelled') {
      throw new Error('n8n analysis was cancelled')
    }

    await sleep(pollMs)
  }

  throw new Error(`Timed out waiting for n8n analysis completion after ${Math.round(timeoutMs / 1000)}s`)
}

async function fetchAnalysisRecordStatus(recordId: string): Promise<AnalysisRecordStatus> {
  const { data, error } = await supabase
    .from('analysis_records')
    .select('status, analysis_result')
    .eq('id', recordId)
    .single()

  if (error || !data) {
    throw error || new Error(`Analysis record ${recordId} not found`)
  }

  return data as AnalysisRecordStatus
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
