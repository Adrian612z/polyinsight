import type { PolymarketEvent, PolymarketMarket, PolymarketTag } from './parity.js'
import { extractPolymarketSlug } from '../utils/polymarket.js'
import { fetchResponseWithCurl, getOutboundProxyUrl } from '../utils/network.js'

interface PolymarketParentEvent {
  id: string
  slug: string
  title: string
  description?: string
  resolutionSource?: string
  startDate?: string
  endDate?: string
  tags?: PolymarketTag[]
  eventMetadata?: {
    context_description?: string
  }
}

interface PolymarketMarketLookup extends PolymarketMarket {
  description?: string
  startDate?: string
  events?: PolymarketParentEvent[]
}

export async function fetchPolymarketEventForSlug(slug: string, signal?: AbortSignal): Promise<PolymarketEvent> {
  const eventUrl = `https://gamma-api.polymarket.com/events/slug/${encodeURIComponent(slug)}`
  const eventResponse = getOutboundProxyUrl()
    ? await fetchResponseWithCurl(eventUrl, ['-sS', '--location'])
    : await fetch(eventUrl, { signal })

  if (eventResponse.ok) {
    return (await eventResponse.json()) as PolymarketEvent
  }

  if (eventResponse.status !== 404) {
    throw new Error(`Failed to fetch Polymarket event (${eventResponse.status})`)
  }

  const marketUrl = `https://gamma-api.polymarket.com/markets/slug/${encodeURIComponent(slug)}`
  const marketResponse = getOutboundProxyUrl()
    ? await fetchResponseWithCurl(marketUrl, ['-sS', '--location'])
    : await fetch(marketUrl, { signal })

  if (!marketResponse.ok) {
    throw new Error(`Failed to resolve Polymarket slug (${slug}) as event or market`)
  }

  const market = (await marketResponse.json()) as PolymarketMarketLookup
  return buildSingleMarketEvent(market)
}

export async function resolveCanonicalPolymarketEventUrl(
  slugOrUrl: string,
  signal?: AbortSignal
): Promise<string | null> {
  const slug = extractPolymarketSlug(slugOrUrl) || slugOrUrl.trim()
  if (!slug) return null

  const event = await fetchPolymarketEventForSlug(slug, signal)
  const canonicalSlug = String(event.slug || '').trim()
  if (!canonicalSlug) return null
  return `https://polymarket.com/event/${encodeURIComponent(canonicalSlug)}`
}

function buildSingleMarketEvent(market: PolymarketMarketLookup): PolymarketEvent {
  const parentEvent = Array.isArray(market.events) && market.events.length > 0 ? market.events[0] : null

  return {
    id: parentEvent?.id || market.id,
    slug: String(parentEvent?.slug || market.slug || '').trim() || market.slug,
    title: String(market.question || parentEvent?.title || market.slug || '').trim() || market.slug,
    description: String(market.description || parentEvent?.description || '').trim(),
    resolutionSource: String(parentEvent?.resolutionSource || '').trim(),
    startDate: market.startDate || parentEvent?.startDate,
    endDate: market.endDate || parentEvent?.endDate,
    tags: Array.isArray(parentEvent?.tags) ? parentEvent.tags : [],
    markets: [pickMarketFields(market)],
    eventMetadata: parentEvent?.eventMetadata,
  }
}

function pickMarketFields(market: PolymarketMarketLookup): PolymarketMarket {
  return {
    id: market.id,
    question: market.question,
    slug: market.slug,
    outcomes: market.outcomes,
    outcomePrices: market.outcomePrices,
    active: market.active,
    closed: market.closed,
    archived: market.archived,
    acceptingOrders: market.acceptingOrders,
    enableOrderBook: market.enableOrderBook,
    groupItemTitle: market.groupItemTitle,
    endDate: market.endDate,
    endDateIso: market.endDateIso,
    liquidity: market.liquidity,
    liquidityNum: market.liquidityNum,
    volume: market.volume,
    volumeNum: market.volumeNum,
  }
}
