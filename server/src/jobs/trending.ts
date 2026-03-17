import cron from 'node-cron'
import { supabase } from '../services/supabase.js'
import { fetchTrendingEvents } from '../services/polymarket.js'
import { config } from '../config.js'
import { extractPolymarketSlug } from '../utils/polymarket.js'
import {
  calculateMispricingScore,
  getFeaturedSignalStrength,
  guessCategory,
  isExpiredFeature,
  isRenderableFeatured,
  parseDecisionJson,
  type FeaturedRecord,
} from '../services/featured.js'

export function startTrendingJob() {
  // Run every 2 hours
  cron.schedule('0 */2 * * *', async () => {
    console.log('[Trending] Fetching trending events...')
    try {
      await discoverAndAnalyze()
    } catch (err) {
      console.error('[Trending] Job failed:', err)
    }
  })

  // Run once on startup shortly after boot so discovery page has fresh data.
  setTimeout(() => {
    discoverAndAnalyze().catch(err => console.error('[Trending] Initial run failed:', err))
  }, 5000)

  console.log('[Trending] Cron job scheduled: every 2 hours')
}

async function discoverAndAnalyze() {
  await cleanupFeaturedPool()

  const events = await fetchTrendingEvents(10)
  console.log(`[Trending] Found ${events.length} trending events`)

  let analyzed = 0
  for (const event of events) {
    if (analyzed >= 5) break

    // Skip if already featured
    const { data: existing } = await supabase
      .from('featured_analyses')
      .select('*')
      .eq('event_slug', event.slug)
      .single()

    if (existing && isRenderableFeatured(existing as FeaturedRecord)) continue

    // Skip if already analyzed recently
    const polymarketUrl = `https://polymarket.com/event/${event.slug}`
    const { data: recentAnalysis } = await supabase
      .from('analysis_records')
      .select('id, status, analysis_result')
      .eq('event_url', polymarketUrl)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (recentAnalysis?.analysis_result) {
      // Already analyzed, just create featured entry
      await createFeaturedEntry(event, recentAnalysis)
      analyzed++
      continue
    }

    // Create analysis record and trigger n8n
    const { data: record, error } = await supabase
      .from('analysis_records')
      .insert({
        event_url: polymarketUrl,
        status: 'pending',
        user_id: 'system:auto-discovery',
        credits_charged: 0,
      })
      .select()
      .single()

    if (error) {
      console.error(`[Trending] Failed to create record for ${event.slug}:`, error)
      continue
    }

    // Trigger n8n webhook
    try {
      await fetch(config.n8nWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: polymarketUrl,
          slug: event.slug,
          user_id: 'system:auto-discovery',
          record_id: record.id,
        }),
      })
      console.log(`[Trending] Triggered analysis for: ${event.slug}`)
    } catch (err) {
      console.error(`[Trending] Webhook failed for ${event.slug}:`, err)
    }

    analyzed++
  }

  // Check for completed auto-discovery analyses and populate featured
  await populateCompletedFeatured()
}

async function populateCompletedFeatured() {
  const { data: records } = await supabase
    .from('analysis_records')
    .select('*')
    .eq('user_id', 'system:auto-discovery')
    .eq('status', 'completed')
    .not('analysis_result', 'is', null)

  if (!records) return

  for (const record of records) {
    const slug = extractSlug(record.event_url)
    if (!slug) continue

    const event = { slug, title: '', volume: 0, volume24hr: 0, endDate: '', markets: [] }
    await createFeaturedEntry(event, record)
  }
}

async function createFeaturedEntry(
  event: { slug: string; title: string; endDate: string },
  record: { id: string; analysis_result: string }
) {
  const decisionData = parseDecisionJson(record.analysis_result)
  const mispricingScore = calculateMispricingScore(decisionData)

  if (!decisionData || mispricingScore < 1) {
    return
  }

  const category = guessCategory(event.title, decisionData)

  await supabase.from('featured_analyses').upsert({
    event_slug: event.slug,
    event_title: decisionData?.event || event.title || event.slug,
    category,
    polymarket_url: `https://polymarket.com/event/${event.slug}`,
    analysis_record_id: record.id,
    decision_data: decisionData,
    mispricing_score: mispricingScore,
    is_active: true,
    expires_at: event.endDate || null,
  }, { onConflict: 'event_slug' })

  console.log(`[Trending] Featured: ${event.slug} (mispricing: ${mispricingScore})`)
}

function extractSlug(url: string): string | null {
  return extractPolymarketSlug(url)
}

async function cleanupFeaturedPool() {
  const { data: featured, error } = await supabase
    .from('featured_analyses')
    .select('*')
    .eq('is_active', true)

  if (error || !featured) {
    if (error) {
      console.error('[Trending] Failed to load featured cleanup pool:', error)
    }
    return
  }

  const now = Date.now()

  for (const item of featured as FeaturedRecord[]) {
    const expired = isExpiredFeature(item, now)
    const renderable = isRenderableFeatured(item, now)
    const latestScore = getFeaturedSignalStrength(item)

    if (!renderable || expired || latestScore < 1) {
      await supabase
        .from('featured_analyses')
        .update({ is_active: false })
        .eq('id', item.id)
    }
  }
}
