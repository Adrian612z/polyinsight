import { Router, Request, Response } from 'express'
import { supabase } from '../services/supabase.js'

const router = Router()

// GET /api/featured - Public endpoint for discovery page
router.get('/', async (req: Request, res: Response) => {
  try {
    const category = req.query.category as string
    const limit = parseInt(req.query.limit as string) || 20

    let query = supabase
      .from('featured_analyses')
      .select('*')
      .eq('is_active', true)
      .order('mispricing_score', { ascending: false })
      .limit(limit)

    if (category && category !== 'all') {
      query = query.eq('category', category)
    }

    const { data, error } = await query

    if (error) throw error

    res.json({ featured: data || [] })
  } catch (err) {
    console.error('Featured error:', err)
    res.status(500).json({ error: 'Failed to fetch featured analyses' })
  }
})

export default router
