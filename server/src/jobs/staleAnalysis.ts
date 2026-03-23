import { supabase } from '../services/supabase.js'
import { refundAnalysisCreditsIfNeeded } from '../services/credit.js'

const STALE_MINUTES = 6
const CHECK_INTERVAL = 2 * 60 * 1000 // 2 minutes

export function startStaleAnalysisJob() {
  setInterval(async () => {
    try {
      const cutoff = new Date(Date.now() - STALE_MINUTES * 60 * 1000).toISOString()

      const { data: stale, error: staleError } = await supabase
        .from('analysis_records')
        .select('id, user_id, event_url')
        .eq('status', 'pending')
        .lt('created_at', cutoff)

      if (staleError) throw staleError
      if (!stale || stale.length === 0) return

      const recordIds = stale.map((record) => record.id)
      const { data: jobs, error: jobsError } = await supabase
        .from('analysis_jobs')
        .select('analysis_record_id, status, last_error')
        .in('analysis_record_id', recordIds)

      if (jobsError) throw jobsError

      const jobsByRecordId = new Map(
        (jobs || []).map((job) => [
          job.analysis_record_id,
          {
            status: job.status as 'queued' | 'running' | 'completed' | 'failed' | 'cancelled',
            last_error: job.last_error as string | null,
          },
        ])
      )

      let synced = 0

      for (const record of stale) {
        const job = jobsByRecordId.get(record.id)

        if (job?.status === 'queued' || job?.status === 'running' || job?.status === 'completed') {
          continue
        }

        const nextStatus = job?.status === 'cancelled' ? 'cancelled' : 'failed'
        const { data: updated, error: updateError } = await supabase
          .from('analysis_records')
          .update({
            status: nextStatus,
            updated_at: new Date().toISOString(),
          })
          .eq('id', record.id)
          .eq('status', 'pending')
          .select('id')

        if (updateError) throw updateError
        if (!updated || updated.length === 0) continue

        synced += 1

        if (!record.user_id.startsWith('system:')) {
          const reason = job?.last_error || `No active analysis job after ${STALE_MINUTES} minutes`
          await refundAnalysisCreditsIfNeeded(
            record.user_id,
            record.id,
            `Refund for stale ${nextStatus} analysis: ${record.event_url.slice(0, 60)}... (${reason.slice(0, 120)})`
          )
        }
      }

      if (synced > 0) {
        console.log(`[StaleCheck] Synced ${synced} stale analysis records without active jobs`)
      }
    } catch (err) {
      console.error('[StaleCheck] Error:', err)
    }
  }, CHECK_INTERVAL)

  console.log(
    `[StaleCheck] Running every ${CHECK_INTERVAL / 1000}s, syncing pending records older than ${STALE_MINUTES}min when no active job exists`
  )
}
