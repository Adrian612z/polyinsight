import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

export interface PolymarketEvent {
  slug: string
  title: string
  image: string
  volume: number
  volume24hr: number
  endDate: string
  markets: Array<{
    question: string
    outcomePrices: string
    outcomes: string
    volume: number
  }>
}

interface TrendingCachePayload {
  fetchedAt: string
  events: PolymarketEvent[]
}

interface TrendingCacheState {
  events: PolymarketEvent[]
  fetchedAt: number
  refreshing: boolean
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const CACHE_DIR = resolve(__dirname, '..', '..', '.cache')
const CACHE_FILE = resolve(CACHE_DIR, 'trending-events.json')
const UPSTREAM_TIMEOUT_MS = 15000
const FRESH_CACHE_MS = 60 * 1000
const STALE_CACHE_MS = 15 * 60 * 1000
const REFRESH_INTERVAL_MS = 30 * 60 * 1000

const cache: TrendingCacheState = {
  events: [],
  fetchedAt: 0,
  refreshing: false,
}

function normalizeEvents(raw: unknown): PolymarketEvent[] {
  if (!Array.isArray(raw)) return []

  return raw.map((event) => {
    const e = (event || {}) as Record<string, unknown>
    return {
      slug: String(e.slug || ''),
      title: String(e.title || ''),
      image: typeof e.image === 'string' ? e.image : '',
      volume: typeof e.volume === 'number' ? e.volume : Number(e.volume || 0),
      volume24hr: typeof e.volume24hr === 'number' ? e.volume24hr : Number(e.volume24hr || 0),
      endDate: typeof e.endDate === 'string' ? e.endDate : '',
      markets: Array.isArray(e.markets) ? (e.markets as PolymarketEvent['markets']) : [],
    }
  }).filter((event) => event.slug && event.title)
}

function loadCacheFromDisk() {
  try {
    if (!existsSync(CACHE_FILE)) return

    const parsed = JSON.parse(readFileSync(CACHE_FILE, 'utf-8')) as TrendingCachePayload
    const events = normalizeEvents(parsed.events)
    const fetchedAt = Date.parse(parsed.fetchedAt)

    if (!Number.isFinite(fetchedAt) || events.length === 0) return

    cache.events = events
    cache.fetchedAt = fetchedAt
  } catch (error) {
    console.error('[Trending] Failed to load cache from disk:', error)
  }
}

function saveCacheToDisk(events: PolymarketEvent[], fetchedAt: number) {
  try {
    mkdirSync(CACHE_DIR, { recursive: true })
    writeFileSync(
      CACHE_FILE,
      JSON.stringify(
        {
          fetchedAt: new Date(fetchedAt).toISOString(),
          events,
        } satisfies TrendingCachePayload,
      ),
      'utf-8',
    )
  } catch (error) {
    console.error('[Trending] Failed to save cache to disk:', error)
  }
}

async function fetchTrendingEventsFromUpstream(limit = 10): Promise<PolymarketEvent[]> {
  const url = `https://gamma-api.polymarket.com/events?closed=false&order=volume24hr&ascending=false&limit=${limit}`

  const res = await fetch(url, {
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  })

  if (!res.ok) {
    throw new Error(`Polymarket API error: ${res.status}`)
  }

  return normalizeEvents(await res.json())
}

async function refreshTrendingCache(limit = 12) {
  if (cache.refreshing) return

  cache.refreshing = true
  try {
    const events = await fetchTrendingEventsFromUpstream(limit)
    if (events.length > 0) {
      cache.events = events
      cache.fetchedAt = Date.now()
      saveCacheToDisk(events, cache.fetchedAt)
    }
  } catch (error) {
    console.error('[Trending] Refresh failed:', error)
  } finally {
    cache.refreshing = false
  }
}

export async function getTrendingEvents(limit = 10) {
  const now = Date.now()
  const freshEnough = cache.events.length > 0 && now - cache.fetchedAt < FRESH_CACHE_MS
  if (freshEnough) {
    return {
      events: cache.events.slice(0, limit),
      degraded: false,
      source: 'memory-cache' as const,
      fetchedAt: new Date(cache.fetchedAt).toISOString(),
    }
  }

  const staleButUsable = cache.events.length > 0 && now - cache.fetchedAt < STALE_CACHE_MS
  if (staleButUsable) {
    void refreshTrendingCache(Math.max(limit, 12))
    return {
      events: cache.events.slice(0, limit),
      degraded: false,
      source: 'stale-cache' as const,
      fetchedAt: new Date(cache.fetchedAt).toISOString(),
    }
  }

  try {
    const events = await fetchTrendingEventsFromUpstream(Math.max(limit, 12))
    if (events.length > 0) {
      cache.events = events
      cache.fetchedAt = Date.now()
      saveCacheToDisk(events, cache.fetchedAt)
    }

    return {
      events: events.slice(0, limit),
      degraded: false,
      source: 'live' as const,
      fetchedAt: new Date(cache.fetchedAt).toISOString(),
    }
  } catch (error) {
    console.error('[Trending] Live fetch failed:', error)

    if (cache.events.length > 0) {
      return {
        events: cache.events.slice(0, limit),
        degraded: false,
        source: 'stale-cache' as const,
        fetchedAt: new Date(cache.fetchedAt).toISOString(),
      }
    }

    return {
      events: [],
      degraded: true,
      source: 'empty' as const,
      fetchedAt: null,
    }
  }
}

export function startTrendingCache() {
  loadCacheFromDisk()
  void refreshTrendingCache(12)
  setInterval(() => {
    void refreshTrendingCache(12)
  }, REFRESH_INTERVAL_MS)
}

// Compatibility for existing jobs.
export async function fetchTrendingEvents(limit = 10): Promise<PolymarketEvent[]> {
  const result = await getTrendingEvents(limit)
  return result.events
}
