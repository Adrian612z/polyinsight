import cron from 'node-cron'
import { config } from '../config.js'
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
import { sendFeaturedToLark } from '../services/lark.js'
import type { PolymarketEvent } from '../services/polymarket.js'

const AUTO_DISCOVERY_CRON = '0 */6 * * *'
const AUTO_DISCOVERY_MAX_ANALYSES = 5
const AUTO_DISCOVERY_SCAN_LIMIT = 30
const AUTO_PUSH_DAILY_LIMIT_REACHED = 'AUTO_PUSH_DAILY_LIMIT_REACHED'

export function rankAutoDiscoveryEvents(events: PolymarketEvent[]): PolymarketEvent[] {
  return events
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
  if (!config.featuredAutoDiscoveryEnabled) {
    console.log('[Trending] Auto discovery paused by config')
    return
  }

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
    `[Trending] Found ${events.length} trending events, ${candidates.length} ranked candidates`
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
  const remainingAutoPushes = await getRemainingLarkAutoPushQuota()
  await populateCompletedFeatured({ remainingAutoPushes })
}

async function populateCompletedFeatured(context: { remainingAutoPushes: number }) {
  const { data: records } = await supabase
    .from('analysis_records')
    .select('*')
    .eq('user_id', 'system:auto-discovery')
    .eq('status', 'completed')
    .not('analysis_result', 'is', null)
    .order('created_at', { ascending: false })

  if (!records) return

  const latestBySlug = new Map<string, typeof records[number]>()

  for (const record of records) {
    const slug = extractSlug(record.event_url)
    if (!slug) continue
    if (latestBySlug.has(slug)) continue
    latestBySlug.set(slug, record)
  }

  for (const record of latestBySlug.values()) {
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

    await createFeaturedEntry(event, record, context)
  }
}

async function createFeaturedEntry(
  event: { slug: string; title: string; endDate: string },
  record: { id: string; analysis_result: string },
  context?: { remainingAutoPushes: number }
) {
  const decisionData = parseDecisionJson(record.analysis_result)
  const mispricingScore = calculateMispricingScore(decisionData)

  if (!decisionData || mispricingScore < 1) {
    return
  }

  const category = guessCategory(event.title, decisionData)
  let larkColumnsAvailable = true
  let existing: {
    id?: string
    analysis_record_id?: string | null
    lark_push_status?: 'pending' | 'sent' | 'failed' | null
    lark_push_sent_at?: string | null
    lark_push_last_error?: string | null
  } | null = null

  const { data: existingWithPushState, error: existingError } = await supabase
    .from('featured_analyses')
    .select('id, analysis_record_id, lark_push_status, lark_push_sent_at, lark_push_last_error')
    .eq('event_slug', event.slug)
    .maybeSingle()

  if (existingError) {
    const message = [existingError.message, existingError.details, existingError.hint]
      .filter(Boolean)
      .join(' ')

    if (/lark_push_/i.test(message) && /column|schema cache|not found|does not exist/i.test(message)) {
      larkColumnsAvailable = false

      const { data: fallbackExisting, error: fallbackError } = await supabase
        .from('featured_analyses')
        .select('id, analysis_record_id')
        .eq('event_slug', event.slug)
        .maybeSingle()

      if (fallbackError) {
        console.error(`[Trending] Failed to read fallback featured record for ${event.slug}:`, fallbackError)
        return
      }

      existing = fallbackExisting || null
    } else {
      console.error(`[Trending] Failed to read existing featured record for ${event.slug}:`, existingError)
      return
    }
  } else {
    existing = existingWithPushState || null
  }

  const shouldSendToLark = larkColumnsAvailable && (
    !existing
    || existing.analysis_record_id !== record.id
    || existing.lark_push_status === 'failed'
    || (
      existing.lark_push_status === 'pending'
      && !existing.lark_push_sent_at
    )
  )

  const upsertPayload: Record<string, unknown> = {
    event_slug: event.slug,
    event_title: decisionData?.event || event.title || event.slug,
    category,
    polymarket_url: `https://polymarket.com/event/${event.slug}`,
    analysis_record_id: record.id,
    decision_data: decisionData,
    mispricing_score: mispricingScore,
    is_active: true,
    expires_at: getFeatureExpiryIso(event.endDate || null, String(decisionData?.deadline || '')),
  }

  if (larkColumnsAvailable) {
    const canAutoPush = shouldSendToLark && (context?.remainingAutoPushes ?? 0) > 0
    upsertPayload.lark_push_status = shouldSendToLark ? 'pending' : existing?.lark_push_status || null
    upsertPayload.lark_push_sent_at = shouldSendToLark ? null : existing?.lark_push_sent_at || null
    if (shouldSendToLark) {
      upsertPayload.lark_push_last_attempt_at = null
      upsertPayload.lark_push_last_error = canAutoPush ? null : AUTO_PUSH_DAILY_LIMIT_REACHED
    }
  }

  const { data: featured, error: upsertError } = await supabase
    .from('featured_analyses')
    .upsert(upsertPayload, { onConflict: 'event_slug' })
    .select('*')
    .single()

  if (upsertError || !featured) {
    console.error(`[Trending] Failed to upsert featured record for ${event.slug}:`, upsertError)
    return
  }

  console.log(`[Trending] Featured: ${event.slug} (mispricing: ${mispricingScore})`)

  if (shouldSendToLark) {
    if (context && context.remainingAutoPushes <= 0) {
      console.log(`[Trending] Lark auto-push skipped by daily limit: ${event.slug}`)
      return
    }

    try {
      await sendFeaturedToLark(featured as FeaturedRecord)
      if (context) {
        context.remainingAutoPushes = Math.max(context.remainingAutoPushes - 1, 0)
      }
      console.log(`[Trending] Lark pushed: ${event.slug}`)
    } catch (error) {
      console.error(`[Trending] Lark push failed for ${event.slug}:`, error)
    }
  }
}

async function getRemainingLarkAutoPushQuota(): Promise<number> {
  const dailyLimit = Math.max(config.larkAutoPushDailyLimit, 0)
  if (!config.larkBotWebhookUrl || dailyLimit === 0) return 0

  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)

  const { count, error } = await supabase
    .from('featured_analyses')
    .select('id', { count: 'exact', head: true })
    .eq('lark_push_status', 'sent')
    .gte('lark_push_sent_at', startOfDay.toISOString())

  if (error) {
    const message = [error.message, error.details, error.hint].filter(Boolean).join(' ')
    if (/lark_push_/i.test(message) && /column|schema cache|not found|does not exist/i.test(message)) {
      return dailyLimit
    }
    throw error
  }

  return Math.max(dailyLimit - (count || 0), 0)
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
