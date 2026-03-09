import cron from 'node-cron'
import { supabase } from '../services/supabase.js'
import { fetchTrendingEvents } from '../services/polymarket.js'
import { config } from '../config.js'

export function startTrendingJob() {
  // Run every 4 hours
  cron.schedule('0 */4 * * *', async () => {
    console.log('[Trending] Fetching trending events...')
    try {
      await discoverAndAnalyze()
    } catch (err) {
      console.error('[Trending] Job failed:', err)
    }
  })

  // Also run once on startup (after 30s delay)
  setTimeout(() => {
    discoverAndAnalyze().catch(err => console.error('[Trending] Initial run failed:', err))
  }, 30000)

  console.log('[Trending] Cron job scheduled: every 4 hours')
}

async function discoverAndAnalyze() {
  const events = await fetchTrendingEvents(10)
  console.log(`[Trending] Found ${events.length} trending events`)

  let analyzed = 0
  for (const event of events) {
    if (analyzed >= 5) break

    // Skip if already featured
    const { data: existing } = await supabase
      .from('featured_analyses')
      .select('id')
      .eq('event_slug', event.slug)
      .single()

    if (existing) continue

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

    const { data: existing } = await supabase
      .from('featured_analyses')
      .select('id')
      .eq('event_slug', slug)
      .single()

    if (existing) continue

    const event = { slug, title: '', volume: 0, volume24hr: 0, endDate: '', markets: [] }
    await createFeaturedEntry(event, record)
  }
}

async function createFeaturedEntry(
  event: { slug: string; title: string; endDate: string },
  record: { id: string; analysis_result: string }
) {
  // Parse decision data from analysis result
  const decisionData = parseDecisionJson(record.analysis_result)

  const category = guessCategory(event.title, decisionData)
  const mispricingScore = calculateMispricingScore(decisionData)

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

function parseDecisionJson(result: string): Record<string, unknown> | null {
  try {
    const match = result.match(/```json\s*([\s\S]*?)```/)
    if (match) return JSON.parse(match[1])
  } catch {}
  return null
}

function calculateMispricingScore(data: Record<string, unknown> | null): number {
  if (!data?.options || !Array.isArray(data.options)) return 0
  let maxDiff = 0
  for (const opt of data.options as Array<{ market?: number; ai?: number }>) {
    if (typeof opt.market === 'number' && typeof opt.ai === 'number') {
      maxDiff = Math.max(maxDiff, Math.abs(opt.ai - opt.market))
    }
  }
  return maxDiff
}

function guessCategory(title: string, data: Record<string, unknown> | null): string {
  const text = `${title} ${data?.event || ''}`.toLowerCase()
  if (/bitcoin|btc|eth|crypto|token|defi|solana/.test(text)) return 'crypto'
  if (/trump|biden|election|president|congress|senate|politi/.test(text)) return 'politics'
  if (/nba|nfl|soccer|football|tennis|sport|game|match|champion/.test(text)) return 'sports'
  if (/ai|gpt|openai|claude|model|artificial/.test(text)) return 'ai'
  if (/gdp|inflation|rate|fed|economic|market|stock/.test(text)) return 'economics'
  return 'other'
}

function extractSlug(url: string): string | null {
  const match = url.match(/polymarket\.com\/(?:[a-z]{2}\/)?event\/([^/\\?#]+)/)
  return match ? match[1] : null
}
