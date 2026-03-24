import cron from 'node-cron'
import { fetchPolymarketEventForSlug } from '../analysis-runtime/polymarketFetch.js'
import { supabase } from '../services/supabase.js'
import { fetchTrendingEvents } from '../services/polymarket.js'
import { extractPolymarketSlug } from '../utils/polymarket.js'
import { enqueueAnalysisJob } from '../services/analysisJobs.js'
import {
  calculateMispricingScore,
  getFeatureExpiryIso,
  getFeaturedSignalStrength,
  guessCategory,
  isExpiredFeature,
  isRenderableFeatured,
  parseDecisionJson,
  type FeaturedRecord,
} from '../services/featured.js'
import type { PolymarketEvent } from '../services/polymarket.js'

const AUTO_DISCOVERY_CRON = '0 */6 * * *'
const AUTO_DISCOVERY_MAX_ANALYSES = 5
const AUTO_DISCOVERY_SCAN_LIMIT = 30
const AUTO_DISCOVERY_MIN_RUNWAY_MS = 72 * 60 * 60 * 1000

export function hasAutoDiscoveryRunway(event: Pick<PolymarketEvent, 'endDate'>, now = Date.now()): boolean {
  const expiry = Date.parse(event.endDate || '')
  return Number.isFinite(expiry) && expiry - now >= AUTO_DISCOVERY_MIN_RUNWAY_MS
}

export function rankAutoDiscoveryEvents(events: PolymarketEvent[], now = Date.now()): PolymarketEvent[] {
  return events
    .filter((event) => hasAutoDiscoveryRunway(event, now))
    .sort((left, right) => {
      const volumeDiff = right.volume24hr - left.volume24hr
      if (volumeDiff !== 0) return volumeDiff

      const leftExpiry = Date.parse(left.endDate || '')
      const rightExpiry = Date.parse(right.endDate || '')
      if (Number.isFinite(leftExpiry) && Number.isFinite(rightExpiry)) {
        return rightExpiry - leftExpiry
      }

      return right.volume - left.volume
    })
}

export function startTrendingJob() {
  // Run every 6 hours.
  cron.schedule(AUTO_DISCOVERY_CRON, async () => {
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

  console.log('[Trending] Cron job scheduled: every 6 hours')
}

async function discoverAndAnalyze() {
  await cleanupFeaturedPool()

  const events = await fetchTrendingEvents(AUTO_DISCOVERY_SCAN_LIMIT)
  const candidates = rankAutoDiscoveryEvents(events)
  console.log(
    `[Trending] Found ${events.length} trending events, ${candidates.length} eligible long-term candidates (>=72h runway)`
  )

  let analyzed = 0
  for (const event of candidates) {
    if (analyzed >= AUTO_DISCOVERY_MAX_ANALYSES) break

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

    try {
      await enqueueAnalysisJob({
        analysisRecordId: record.id,
        userId: 'system:auto-discovery',
        lang: 'en',
        payload: {
          url: polymarketUrl,
          originalUrl: polymarketUrl,
          slug: event.slug,
          userId: 'system:auto-discovery',
          recordId: record.id,
          lang: 'en',
        },
      })
      console.log(`[Trending] Enqueued analysis for: ${event.slug}`)
    } catch (err) {
      console.error(`[Trending] Queue failed for ${event.slug}:`, err)
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

    let event = { slug, title: '', endDate: '' }
    try {
      const polymarketEvent = await fetchPolymarketEventForSlug(slug)
      event = {
        slug,
        title: polymarketEvent.title || '',
        endDate: polymarketEvent.endDate || '',
      }
    } catch (error) {
      console.warn(`[Trending] Failed to backfill event metadata for ${slug}:`, error)
    }

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
    expires_at: getFeatureExpiryIso(event.endDate || null, String(decisionData?.deadline || '')),
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
