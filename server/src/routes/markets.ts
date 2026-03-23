import { Router, Request, Response } from 'express'
import { getMarketTerminalDetail, getMarketTerminalList } from '../services/markets.js'

const router = Router()

router.get('/', async (req: Request, res: Response) => {
  try {
    const payload = await getMarketTerminalList({
      category: req.query.category as string | undefined,
      q: req.query.q as string | undefined,
      sort: req.query.sort as string | undefined,
      page: parseInt(req.query.page as string, 10) || 1,
      pageSize: parseInt(req.query.pageSize as string, 10) || 25,
    })

    res.json(payload)
  } catch (error) {
    console.error('Markets list error:', error)
    res.status(500).json({
      items: [],
      page: 1,
      pageSize: 25,
      total: 0,
      totalPages: 1,
      category: 'all',
      q: '',
      sort: 'volume24hr',
      degraded: true,
      fetchedAt: null,
    })
  }
})

router.get('/:marketSlug', async (req: Request, res: Response) => {
  try {
    const market = await getMarketTerminalDetail(req.params.marketSlug)
    if (!market) {
      res.status(404).json({ error: 'Market not found' })
      return
    }

    res.json({ market })
  } catch (error) {
    console.error('Market detail error:', error)
    res.status(500).json({ error: 'Failed to fetch market detail' })
  }
})

export default router
