import { Router, Request, Response } from 'express'
import { supabase } from '../services/supabase.js'
import { authMiddleware } from '../middleware/auth.js'

const router = Router()

// GET /api/credits/history - Get credit transaction history
router.get('/history', authMiddleware, async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1
    const limit = 20
    const from = (page - 1) * limit
    const to = from + limit - 1

    const { data, error, count } = await supabase
      .from('credit_transactions')
      .select('*', { count: 'exact' })
      .eq('user_id', req.userId!)
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) throw error

    res.json({
      transactions: data,
      total: count,
      page,
      pages: Math.ceil((count || 0) / limit),
    })
  } catch (err) {
    console.error('Credit history error:', err)
    res.status(500).json({ error: 'Failed to fetch transaction history' })
  }
})

export default router
