export interface PolymarketEvent {
  slug: string
  title: string
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

export async function fetchTrendingEvents(limit = 10): Promise<PolymarketEvent[]> {
  const url = `https://gamma-api.polymarket.com/events?closed=false&order=volume24hr&ascending=false&limit=${limit}`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Polymarket API error: ${res.status}`)

  const events = await res.json()
  return events.map((e: Record<string, unknown>) => ({
    slug: e.slug,
    title: e.title,
    volume: e.volume,
    volume24hr: e.volume24hr,
    endDate: e.endDate,
    markets: e.markets || [],
  }))
}
