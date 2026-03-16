import { supabase } from './supabase.js'

export interface MarketEvent {
  slug: string
  title: string
  image: string
  category: string
  volume: number
  volume24hr: number
  liquidity: number
  endDate: string
  featured: boolean
  markets: Array<{
    question: string
    outcomes: string[]
    prices: number[]
    volume: number
    spread: number
  }>
}

const UPSTREAM_TIMEOUT_MS = 15000
const REFRESH_INTERVAL_MS = 30 * 60 * 1000
let refreshing = false

function parseMarkets(raw: unknown[]): MarketEvent['markets'] {
  return raw.map((m: Record<string, unknown>) => {
    let outcomes: string[] = []
    let prices: number[] = []
    try {
      outcomes = JSON.parse(String(m.outcomes || '[]'))
      prices = JSON.parse(String(m.outcomePrices || '[]')).map(Number)
    } catch {}
    const spread = prices.length >= 2
      ? Math.round(Math.abs(1 - prices.reduce((a, b) => a + b, 0)) * 10000) / 100
      : 0
    return {
      question: String(m.question || ''),
      outcomes,
      prices,
      volume: Number(m.volume || 0),
      spread,
    }
  })
}

function normalizeEvents(raw: unknown): MarketEvent[] {
  if (!Array.isArray(raw)) return []
  return raw.map((event) => {
    const e = (event || {}) as Record<string, unknown>
    return {
      slug: String(e.slug || ''),
      title: String(e.title || ''),
      image: typeof e.image === 'string' ? e.image : '',
      category: String(e.category || ''),
      volume: Number(e.volume || 0),
      volume24hr: Number(e.volume24hr || 0),
      liquidity: Number(e.liquidity || 0),
      endDate: typeof e.endDate === 'string' ? e.endDate : '',
      featured: Boolean(e.featured),
      markets: Array.isArray(e.markets) ? parseMarkets(e.markets as unknown[]) : [],
    }
  }).filter((e) => e.slug && e.title)
}

async function fetchMarketsFromUpstream(limit = 20): Promise<MarketEvent[]> {
  const url = `https://gamma-api.polymarket.com/events?closed=false&order=volume24hr&ascending=false&limit=${limit}`
  const res = await fetch(url, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) })
  if (!res.ok) throw new Error(`Polymarket API error: ${res.status}`)
  return normalizeEvents(await res.json())
}

async function saveEventsToDb(events: MarketEvent[]) {
  for (const e of events) {
    const row = {
      slug: e.slug,
      title: e.title,
      image: e.image || null,
      category: e.category || null,
      volume: e.volume,
      volume_24h: e.volume24hr,
      liquidity: e.liquidity,
      end_date: e.endDate || null,
      featured: e.featured,
      markets: JSON.stringify(e.markets),
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase
      .from('market_events')
      .upsert(row, { onConflict: 'slug' })

    if (error) {
      console.error(`[Markets] Failed to upsert ${e.slug}:`, error.message)
    }
  }
}

async function refreshMarkets(limit = 20) {
  if (refreshing) return
  refreshing = true
  try {
    const events = await fetchMarketsFromUpstream(limit)
    if (events.length > 0) {
      await saveEventsToDb(events)
      console.log(`[Markets] Synced ${events.length} events to database`)
    }
  } catch (error) {
    console.error('[Markets] Refresh failed:', error)
  } finally {
    refreshing = false
  }
}

export async function getMarketEvents(limit = 20) {
  const { data, error } = await supabase
    .from('market_events')
    .select('*')
    .order('volume_24h', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[Markets] DB read failed:', error.message)
    return { events: [], source: 'error' as const, fetchedAt: null }
  }

  const events: MarketEvent[] = (data || []).map((row: Record<string, unknown>) => ({
    slug: String(row.slug),
    title: String(row.title),
    image: String(row.image || ''),
    category: String(row.category || ''),
    volume: Number(row.volume || 0),
    volume24hr: Number(row.volume_24h || 0),
    liquidity: Number(row.liquidity || 0),
    endDate: row.end_date ? String(row.end_date) : '',
    featured: Boolean(row.featured),
    markets: typeof row.markets === 'string' ? JSON.parse(row.markets) : (row.markets || []),
  }))

  const latestUpdate = data?.[0]?.updated_at || null

  return {
    events,
    source: 'database' as const,
    fetchedAt: latestUpdate ? String(latestUpdate) : null,
  }
}

export function startMarketsCache() {
  // Initial fetch + save to DB
  void refreshMarkets(20)
  // Periodic refresh
  setInterval(() => {
    void refreshMarkets(20)
  }, REFRESH_INTERVAL_MS)
}
