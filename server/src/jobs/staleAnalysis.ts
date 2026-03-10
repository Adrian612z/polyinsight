import { supabase } from '../services/supabase.js'

const STALE_MINUTES = 6
const CHECK_INTERVAL = 2 * 60 * 1000 // 2 minutes

export function startStaleAnalysisJob() {
  setInterval(async () => {
    try {
      const cutoff = new Date(Date.now() - STALE_MINUTES * 60 * 1000).toISOString()

      const { data: stale } = await supabase
        .from('analysis_records')
        .select('id')
        .eq('status', 'pending')
        .lt('created_at', cutoff)

      if (!stale || stale.length === 0) return

      for (const record of stale) {
        await supabase
          .from('analysis_records')
          .update({
            status: 'failed',
            updated_at: new Date().toISOString(),
          })
          .eq('id', record.id)
          .eq('status', 'pending') // avoid overwriting if just completed
      }

      console.log(`[StaleCheck] Marked ${stale.length} stale analyses as failed`)
    } catch (err) {
      console.error('[StaleCheck] Error:', err)
    }
  }, CHECK_INTERVAL)

  console.log(`[StaleCheck] Running every ${CHECK_INTERVAL / 1000}s, marking pending > ${STALE_MINUTES}min as failed`)
}
