import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { fetchJsonWithCurl as fetchJsonWithCurlProxy } from '../utils/network.js'
import { guessCategory } from './featured.js'

export type MarketTerminalCategory =
  | 'sports'
  | 'politics'
  | 'crypto'
  | 'finance'
  | 'iran'
  | 'geopolitics'
  | 'tech'
  | 'culture'
  | 'economy'
  | 'weather'
  | 'mentions'
  | 'elections'
  | 'other'
export type MarketTerminalSort = 'volume24hr' | 'volume' | 'liquidity' | 'expires'

export interface MarketTerminalRow {
  marketSlug: string
  eventSlug: string
  eventTitle: string
  question: string
  image: string
  category: MarketTerminalCategory
  createdAt: string
  endDate: string
  remainingLabel: string
  outcomes: string[]
  prices: number[]
  primaryProbability: number | null
  liquidity: number | null
  volume: number | null
  volume24hr: number | null
  description: string
  resolutionSource: string
  competitive: number | null
  polymarketUrl: string
  analysisUrl: string
}

export interface MarketTerminalDetail extends MarketTerminalRow {}

interface MarketsCachePayload {
  fetchedAt: string
  items: MarketTerminalRow[]
}

interface MarketsCacheState {
  items: MarketTerminalRow[]
  fetchedAt: number
  refreshing: boolean
}

interface RawPolymarketTag {
  label?: string
  slug?: string
  name?: string
}

interface RawPolymarketEventRef {
  slug?: string
  title?: string
  image?: string
  endDate?: string
  openInterest?: number | string
  competitive?: number | string
  tags?: RawPolymarketTag[]
}

interface RawPolymarketMarket {
  question?: string
  slug?: string
  image?: string
  createdAt?: string
  description?: string
  resolutionSource?: string
  outcomes?: string
  outcomePrices?: string
  liquidity?: number | string
  volume?: number | string
  volume24hr?: number | string
  endDate?: string
  active?: boolean
  closed?: boolean
  archived?: boolean
  acceptingOrders?: boolean
  enableOrderBook?: boolean
  competitive?: number | string
  events?: RawPolymarketEventRef[]
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const CACHE_DIR = resolve(__dirname, '..', '..', '.cache')
const CACHE_FILE = resolve(CACHE_DIR, 'markets-terminal.json')
const FRESH_CACHE_MS = 15 * 1000
const STALE_CACHE_MS = 15 * 60 * 1000
const REFRESH_INTERVAL_MS = 15 * 1000
const UPSTREAM_LIMIT = 300

const cache: MarketsCacheState = {
  items: [],
  fetchedAt: 0,
  refreshing: false,
}

function toNumber(value: number | string | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function parseList(input?: string): string[] {
  if (!input) return []
  try {
    const parsed = JSON.parse(input)
    return Array.isArray(parsed) ? parsed.map((value) => String(value)) : []
  } catch {
    return []
  }
}

function parsePrices(input?: string): number[] {
  return parseList(input)
    .map((value) => Number(value) * 100)
    .filter((value) => Number.isFinite(value))
    .map((value) => Math.round(value * 10) / 10)
}

function isTradableMarket(market: RawPolymarketMarket): boolean {
  return market.closed !== true
    && market.archived !== true
    && market.active !== false
    && market.acceptingOrders !== false
    && market.enableOrderBook !== false
}

function mapCategory(value: string): MarketTerminalCategory {
  if (value === 'economics') return 'economy'
  if (
    value === 'sports'
    || value === 'politics'
    || value === 'crypto'
    || value === 'finance'
    || value === 'iran'
    || value === 'geopolitics'
    || value === 'tech'
    || value === 'culture'
    || value === 'economy'
    || value === 'weather'
    || value === 'mentions'
    || value === 'elections'
  ) return value
  return 'other'
}

function deriveCategory(question: string, eventTitle: string, tags?: RawPolymarketTag[]): MarketTerminalCategory {
  const tagSlugs = Array.isArray(tags)
    ? tags.map((tag) => String(tag.slug || tag.label || tag.name || '').toLowerCase()).filter(Boolean)
    : []
  const text = `${eventTitle} ${question}`.toLowerCase()

  if (tagSlugs.some((tag) => /sports|soccer|football|basketball|baseball|tennis|golf|mma|esports|league-of-legends|ncaa|nba|nfl|mlb|nhl|pickleball|pga/.test(tag))) {
    return 'sports'
  }
  if (tagSlugs.some((tag) => /iran/.test(tag))) {
    return 'iran'
  }
  if (tagSlugs.some((tag) => /election|nominee|president|senate|house|congress|parliament/.test(tag))) {
    return 'elections'
  }
  if (tagSlugs.some((tag) => /war|geopolitics|foreign-policy|middle-east|israel|ukraine|china/.test(tag))) {
    return 'geopolitics'
  }
  if (tagSlugs.some((tag) => /politics|government|trump|biden/.test(tag))) {
    return 'politics'
  }
  if (tagSlugs.some((tag) => /crypto|defi|token|bitcoin|ethereum|solana|xrp/.test(tag))) {
    return 'crypto'
  }
  if (tagSlugs.some((tag) => /finance|stocks|stock-prices|commodities|oil|etf/.test(tag))) {
    return 'finance'
  }
  if (tagSlugs.some((tag) => /economy|economic|inflation|fed|rates|gdp|unemployment/.test(tag))) {
    return 'economy'
  }
  if (tagSlugs.some((tag) => /weather|hurricane|storm|rain|snow|temperature|climate/.test(tag))) {
    return 'weather'
  }
  if (tagSlugs.some((tag) => /mentions|tweets|posts|social/.test(tag))) {
    return 'mentions'
  }
  if (tagSlugs.some((tag) => /ai|technology|tech|artificial-intelligence|openai|llm/.test(tag))) {
    return 'tech'
  }
  if (tagSlugs.some((tag) => /culture|movies|music|celebrities|pop-culture/.test(tag))) {
    return 'culture'
  }

  if (/\bweather\b|\brain\b|\bsnow\b|\bhurricane\b|\bstorm\b|\btemperature\b|\bclimate\b/.test(text)) return 'weather'
  if (/\bmentions?\b|\btweets?\b|\bposts?\b|\bfollowers?\b|\bsocial\b|\bx posts\b/.test(text)) return 'mentions'
  if (/\btech\b|\bopenai\b|\bgpt\b|\bclaude\b|\bapple\b|\bgoogle\b|\bmeta\b|\bmicrosoft\b|\bnvidia\b|\bartificial intelligence\b/.test(text)) return 'tech'
  if (/\biran\b|\biranian\b|\bnetanyahu\b|\bkhamenei\b|\bregime\b|\bsupreme leader\b/.test(text)) return 'iran'
  if (/\belection\b|\bnominee\b|\bpresidential\b|\bsenate\b|\bhouse\b|\bparliamentary\b|\bgovernor\b/.test(text)) return 'elections'
  if (/\bgeopolitic|\bwar\b|\bstrike(s)?\b|\bsanction(s)?\b|\bisrael\b|\bukraine\b|\btaiwan\b|\bchina\b|\bforces enter\b/.test(text)) return 'geopolitics'
  if (/\b(vs\.?|at)\b|\bcbb\b|\bncaa\b|\bnba\b|\bnfl\b|\bmlb\b|\bnhl\b|\bchampions?\b|\bleague\b|\bmatch\b|\bgame\b|\besports\b|\bcounter-strike\b|\bleague of legends\b|\bpickleball\b|\bgolf\b|\bpga\b/.test(text)) {
    return 'sports'
  }
  if (/\bcrypto\b|\btoken\b|\bdefi\b|\bbitcoin\b|\bbtc\b|\bethereum\b|\beth\b|\bsolana\b|\bsol\b|\bxrp\b/.test(text)) {
    return 'crypto'
  }
  if (/\bfinance\b|\bstocks?\b|\bshares?\b|\bnasdaq\b|\bs&p\b|\bdow\b|\bmarket cap\b|\bclose above\b|\bclose below\b|\boil\b|\bgold\b|\bcommodity\b/.test(text)) {
    return 'finance'
  }
  if (/\bgdp\b|\binflation\b|\brate\b|\bfed\b|\beconomic\b|\byield\b|\bunemployment\b/.test(text)) {
    return 'economy'
  }
  if (/\btrump\b|\bbiden\b|\bpresident\b|\bcongress\b|\bgovernment\b/.test(text)) {
    return 'politics'
  }
  if (/\bgta\b|\bjesus\b|\bmovie\b|\bmusic\b|\bceleb\b|\bculture\b|\btv\b/.test(text)) return 'culture'

  return mapCategory(guessCategory(text, null))
}

function formatRemainingLabel(endDate: string): string {
  const expiry = Date.parse(endDate)
  if (!Number.isFinite(expiry)) return 'Unknown'

  const diffMs = expiry - Date.now()
  if (diffMs <= 0) return 'Expired'

  const totalMinutes = Math.floor(diffMs / 60_000)
  if (totalMinutes < 60) return `${Math.max(totalMinutes, 1)}m remaining`

  const totalHours = Math.floor(diffMs / 3_600_000)
  if (totalHours < 48) return `${totalHours}h remaining`

  const totalDays = Math.floor(diffMs / 86_400_000)
  return `${totalDays}d remaining`
}

function getPrimaryProbability(outcomes: string[], prices: number[]): number | null {
  if (outcomes.length === 0 || prices.length === 0) return null

  const yesIndex = outcomes.findIndex((outcome) => outcome.toLowerCase() === 'yes')
  if (yesIndex >= 0 && typeof prices[yesIndex] === 'number') {
    return prices[yesIndex]
  }

  const highest = prices.reduce<number | null>((current, next) => {
    if (!Number.isFinite(next)) return current
    if (current === null || next > current) return next
    return current
  }, null)

  return highest
}

function normalizeMarket(raw: RawPolymarketMarket): MarketTerminalRow | null {
  if (!isTradableMarket(raw)) return null

  const eventRef = Array.isArray(raw.events) ? raw.events[0] : undefined
  const marketSlug = String(raw.slug || '').trim()
  const eventSlug = String(eventRef?.slug || '').trim()
  const question = String(raw.question || '').trim()
  const eventTitle = String(eventRef?.title || question).trim()

  if (!marketSlug || !eventSlug || !question || !eventTitle) {
    return null
  }

  const outcomes = parseList(raw.outcomes)
  const prices = parsePrices(raw.outcomePrices)
  const endDate = String(raw.endDate || eventRef?.endDate || '').trim()
  const liquidity = toNumber(raw.liquidity)
  const volume = toNumber(raw.volume)
  const volume24hr = toNumber(raw.volume24hr)
  const image = String(raw.image || eventRef?.image || '').trim()
  const category = deriveCategory(question, eventTitle, eventRef?.tags)
  const eventUrl = `https://polymarket.com/event/${eventSlug}`

  return {
    marketSlug,
    eventSlug,
    eventTitle,
    question,
    image,
    category,
    createdAt: String(raw.createdAt || ''),
    endDate,
    remainingLabel: formatRemainingLabel(endDate),
    outcomes,
    prices,
    primaryProbability: getPrimaryProbability(outcomes, prices),
    liquidity,
    volume,
    volume24hr,
    description: String(raw.description || ''),
    resolutionSource: String(raw.resolutionSource || ''),
    competitive: toNumber(raw.competitive ?? eventRef?.competitive),
    polymarketUrl: eventUrl,
    analysisUrl: eventUrl,
  }
}

async function fetchJsonWithCurl<T>(url: string): Promise<T> {
  return fetchJsonWithCurlProxy<T>(url, [
    '-sS',
    '--fail',
    '--location',
    '--compressed',
    '--retry', '2',
    '--retry-all-errors',
    '--retry-delay', '0',
    '--retry-max-time', '8',
    '--connect-timeout', '2',
    '--max-time', '5',
  ], {
    maxBuffer: 16 * 1024 * 1024,
  })
}

async function fetchMarketsFromUpstream(limit = UPSTREAM_LIMIT): Promise<MarketTerminalRow[]> {
  const url = `https://gamma-api.polymarket.com/markets?closed=false&order=volume24hr&ascending=false&limit=${limit}`
  const raw = await fetchJsonWithCurl<RawPolymarketMarket[]>(url)

  return raw
    .map((market) => normalizeMarket(market))
    .filter((market): market is MarketTerminalRow => Boolean(market))
}

function loadCacheFromDisk() {
  try {
    if (!existsSync(CACHE_FILE)) return

    const payload = JSON.parse(readFileSync(CACHE_FILE, 'utf-8')) as MarketsCachePayload
    const fetchedAt = Date.parse(payload.fetchedAt)
    if (!Number.isFinite(fetchedAt) || !Array.isArray(payload.items) || payload.items.length === 0) return

    cache.items = payload.items
    cache.fetchedAt = fetchedAt
  } catch (error) {
    console.error('[Markets] Failed to load cache from disk:', error)
  }
}

function saveCacheToDisk(items: MarketTerminalRow[], fetchedAt: number) {
  try {
    mkdirSync(CACHE_DIR, { recursive: true })
    writeFileSync(
      CACHE_FILE,
      JSON.stringify({
        fetchedAt: new Date(fetchedAt).toISOString(),
        items,
      } satisfies MarketsCachePayload),
      'utf-8',
    )
  } catch (error) {
    console.error('[Markets] Failed to save cache to disk:', error)
  }
}

async function refreshMarketsCache(limit = UPSTREAM_LIMIT) {
  if (cache.refreshing) return

  cache.refreshing = true
  try {
    const items = await fetchMarketsFromUpstream(limit)
    if (items.length > 0) {
      cache.items = items
      cache.fetchedAt = Date.now()
      saveCacheToDisk(items, cache.fetchedAt)
    }
  } catch (error) {
    console.error('[Markets] Refresh failed:', error)
  } finally {
    cache.refreshing = false
  }
}

export function startMarketsCache() {
  loadCacheFromDisk()
  void refreshMarketsCache()
  setInterval(() => {
    void refreshMarketsCache()
  }, REFRESH_INTERVAL_MS)
}

function compareBySort(sort: MarketTerminalSort, left: MarketTerminalRow, right: MarketTerminalRow): number {
  if (sort === 'expires') {
    const leftTime = Date.parse(left.endDate)
    const rightTime = Date.parse(right.endDate)
    const normalizedLeft = Number.isFinite(leftTime) && leftTime > Date.now() ? leftTime : Number.POSITIVE_INFINITY
    const normalizedRight = Number.isFinite(rightTime) && rightTime > Date.now() ? rightTime : Number.POSITIVE_INFINITY
    return normalizedLeft - normalizedRight
  }

  const leftValue = left[sort] ?? -1
  const rightValue = right[sort] ?? -1
  return Number(rightValue) - Number(leftValue)
}

function filterByCategory(item: MarketTerminalRow, category: string) {
  if (!category || category === 'all' || category === 'trending') return true

  if (category === 'new') {
    const createdAt = Date.parse(item.createdAt)
    return Number.isFinite(createdAt) && Date.now() - createdAt <= 7 * 24 * 60 * 60 * 1000
  }

  if (category === 'breaking') {
    const endDate = Date.parse(item.endDate)
    const hoursToExpiry = Number.isFinite(endDate) ? (endDate - Date.now()) / (60 * 60 * 1000) : Number.POSITIVE_INFINITY
    return (
      item.volume24hr !== null
      && item.volume24hr >= 250_000
      && hoursToExpiry <= 72
    ) || item.category === 'iran' || item.category === 'geopolitics' || item.category === 'elections'
  }

  return item.category === category
}

function filterByQuery(item: MarketTerminalRow, query: string) {
  if (!query) return true
  const value = query.toLowerCase().trim()
  if (!value) return true

  return `${item.question} ${item.eventTitle}`.toLowerCase().includes(value)
}

export async function getMarketTerminalList(params: {
  category?: string
  q?: string
  sort?: string
  page?: number
  pageSize?: number
}) {
  const now = Date.now()
  const freshEnough = cache.items.length > 0 && now - cache.fetchedAt < FRESH_CACHE_MS

  if (!freshEnough) {
    if (cache.items.length > 0 && now - cache.fetchedAt < STALE_CACHE_MS) {
      void refreshMarketsCache()
    } else {
      try {
        await refreshMarketsCache()
      } catch {}
    }
  }

  const category = (params.category || 'all').toLowerCase()
  const q = params.q || ''
  const sort: MarketTerminalSort = ['volume24hr', 'volume', 'liquidity', 'expires'].includes(params.sort || '')
    ? params.sort as MarketTerminalSort
    : 'volume24hr'
  const page = Math.max(params.page || 1, 1)
  const pageSize = Math.min(Math.max(params.pageSize || 25, 1), 100)

  const filtered = cache.items
    .filter((item) => filterByCategory(item, category))
    .filter((item) => filterByQuery(item, q))
    .sort((left, right) => compareBySort(sort, left, right))

  const total = filtered.length
  const totalPages = Math.max(Math.ceil(total / pageSize), 1)
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * pageSize
  const items = filtered.slice(start, start + pageSize)

  return {
    items,
    page: safePage,
    pageSize,
    total,
    totalPages,
    category,
    q,
    sort,
    degraded: cache.items.length === 0,
    fetchedAt: cache.fetchedAt ? new Date(cache.fetchedAt).toISOString() : null,
  }
}

async function fetchEventTagsBySlug(eventSlug: string): Promise<RawPolymarketTag[] | undefined> {
  try {
    const event = await fetchJsonWithCurl<{ tags?: RawPolymarketTag[] }>(
      `https://gamma-api.polymarket.com/events/slug/${encodeURIComponent(eventSlug)}`
    )
    return event.tags
  } catch {
    return undefined
  }
}

export async function getMarketTerminalDetail(marketSlug: string): Promise<MarketTerminalDetail | null> {
  const fromCache = cache.items.find((item) => item.marketSlug === marketSlug)

  try {
    const raw = await fetchJsonWithCurl<RawPolymarketMarket>(
      `https://gamma-api.polymarket.com/markets/slug/${encodeURIComponent(marketSlug)}`
    )
    const eventRef = Array.isArray(raw.events) ? raw.events[0] : undefined
    const eventSlug = String(eventRef?.slug || fromCache?.eventSlug || '').trim()
    const tags = eventSlug ? await fetchEventTagsBySlug(eventSlug) : undefined
    const base = normalizeMarket({
      ...raw,
      events: eventRef ? [{ ...eventRef, tags }] : raw.events,
    })

    if (!base) return fromCache ? { ...fromCache } : null

    return { ...base }
  } catch (error) {
    console.error(`[Markets] Failed to fetch detail for ${marketSlug}:`, error)
    return fromCache ? { ...fromCache } : null
  }
}
