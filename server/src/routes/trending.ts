import { Router, Request, Response } from 'express'
import { getTrendingEvents } from '../services/polymarket.js'

const router = Router()

// GET /api/trending - Public endpoint, returns live Polymarket trending events
router.get('/', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 12, 50)
    const result = await getTrendingEvents(limit)

    const items = result.events.map((e) => {
      // Parse market outcomes for display
      const markets = (e.markets || []).map((m) => {
        let outcomes: string[] = []
        let prices: number[] = []
        try {
          outcomes = JSON.parse(m.outcomes || '[]')
          prices = JSON.parse(m.outcomePrices || '[]').map(Number)
        } catch {}
        return {
          question: m.question,
          outcomes,
          prices,
          volume: m.volume,
        }
      })

      return {
        slug: e.slug,
        title: e.title,
        image: e.image || '',
        url: `https://polymarket.com/event/${e.slug}`,
        volume: e.volume,
        volume24hr: e.volume24hr,
        endDate: e.endDate,
        markets,
      }
    })

    res.json({
      events: items,
      degraded: result.degraded,
      source: result.source,
      fetchedAt: result.fetchedAt,
    })
  } catch (err) {
    console.error('Trending error:', err)
    res.json({ events: [], degraded: true })
  }
})

export default router
