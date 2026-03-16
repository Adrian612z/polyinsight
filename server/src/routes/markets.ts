import { Router, Request, Response } from 'express'
import { getMarketEvents } from '../services/markets.js'

const router = Router()

// GET /api/markets - Public endpoint, returns Polymarket events with detailed data
router.get('/', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50)
    const result = await getMarketEvents(limit)

    const events = result.events.map((e) => ({
      ...e,
      url: `https://polymarket.com/event/${e.slug}`,
    }))

    res.json({
      events,
      source: result.source,
      fetchedAt: result.fetchedAt,
    })
  } catch (err) {
    console.error('Markets error:', err)
    res.json({ events: [], source: 'error' })
  }
})

export default router
