import { supabase } from '../services/supabase.js'
import { refundAnalysisCreditsIfNeeded } from '../services/credit.js'

const STALE_MINUTES = 6
const CHECK_INTERVAL = 2 * 60 * 1000 // 2 minutes

export function startStaleAnalysisJob() {
  setInterval(async () => {
    try {
      const cutoff = new Date(Date.now() - STALE_MINUTES * 60 * 1000).toISOString()

      const { data: stale } = await supabase
        .from('analysis_records')
        .select('id, user_id, event_url')
        .eq('status', 'pending')
        .lt('created_at', cutoff)

      if (!stale || stale.length === 0) return

      for (const record of stale) {
        const { data: updated } = await supabase
          .from('analysis_records')
          .update({
            status: 'failed',
            updated_at: new Date().toISOString(),
          })
          .eq('id', record.id)
          .eq('status', 'pending') // avoid overwriting if just completed
          .select('id')

        if (updated && updated.length > 0 && !record.user_id.startsWith('system:')) {
          await refundAnalysisCreditsIfNeeded(
            record.user_id,
            record.id,
            `Refund for stale failed analysis: ${record.event_url.slice(0, 60)}...`
          )
        }
      }

      console.log(`[StaleCheck] Marked ${stale.length} stale analyses as failed`)
    } catch (err) {
      console.error('[StaleCheck] Error:', err)
    }
  }, CHECK_INTERVAL)

  console.log(`[StaleCheck] Running every ${CHECK_INTERVAL / 1000}s, marking pending > ${STALE_MINUTES}min as failed`)
}
