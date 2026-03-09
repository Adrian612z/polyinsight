import { Router, Request, Response } from 'express'
import { supabase } from '../services/supabase.js'
import { authMiddleware } from '../middleware/auth.js'
import { adminMiddleware } from '../middleware/admin.js'
import { grantCredits } from '../services/credit.js'

const router = Router()

// All admin routes require auth + admin role
router.use(authMiddleware, adminMiddleware)

// GET /api/admin/dashboard - Overview stats
router.get('/dashboard', async (_req: Request, res: Response) => {
  try {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()

    const [
      { count: totalUsers },
      { count: todayUsers },
      { count: totalAnalyses },
      { count: todayAnalyses },
      { data: creditStats },
    ] = await Promise.all([
      supabase.from('users').select('id', { count: 'exact', head: true }),
      supabase.from('users').select('id', { count: 'exact', head: true }).gte('created_at', todayStart),
      supabase.from('analysis_records').select('id', { count: 'exact', head: true }),
      supabase.from('analysis_records').select('id', { count: 'exact', head: true }).gte('created_at', todayStart),
      supabase.from('credit_transactions').select('amount, type'),
    ])

    const totalTopup = (creditStats || [])
      .filter(t => t.type === 'topup' || t.type === 'admin_grant' || t.type === 'signup_bonus')
      .reduce((sum, t) => sum + t.amount, 0)

    const totalSpent = (creditStats || [])
      .filter(t => t.type === 'analysis_spend')
      .reduce((sum, t) => sum + Math.abs(t.amount), 0)

    res.json({
      totalUsers: totalUsers || 0,
      todayUsers: todayUsers || 0,
      totalAnalyses: totalAnalyses || 0,
      todayAnalyses: todayAnalyses || 0,
      totalTopup,
      totalSpent,
    })
  } catch (err) {
    console.error('Dashboard error:', err)
    res.status(500).json({ error: 'Failed to fetch dashboard stats' })
  }
})

// GET /api/admin/users - List all users
router.get('/users', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1
    const limit = 50
    const from = (page - 1) * limit
    const to = from + limit - 1

    const { data, error, count } = await supabase
      .from('users')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) throw error

    res.json({
      users: data,
      total: count,
      page,
      pages: Math.ceil((count || 0) / limit),
    })
  } catch (err) {
    console.error('Admin users error:', err)
    res.status(500).json({ error: 'Failed to fetch users' })
  }
})

// POST /api/admin/credits/grant - Grant credits to a user
router.post('/credits/grant', async (req: Request, res: Response) => {
  try {
    const { userId, amount, description } = req.body

    if (!userId || !amount || amount <= 0) {
      res.status(400).json({ error: 'Invalid parameters' })
      return
    }

    const newBalance = await grantCredits(
      userId,
      amount,
      'admin_grant',
      undefined,
      description || `Admin grant ${(amount / 100).toFixed(2)} credits`
    )

    res.json({ success: true, newBalance })
  } catch (err) {
    console.error('Grant credits error:', err)
    res.status(500).json({ error: 'Failed to grant credits' })
  }
})

// GET /api/admin/analyses - List all analyses
router.get('/analyses', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1
    const limit = 50
    const from = (page - 1) * limit
    const to = from + limit - 1

    const { data, error, count } = await supabase
      .from('analysis_records')
      .select('id, user_id, event_url, status, credits_charged, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) throw error

    res.json({
      analyses: data,
      total: count,
      page,
      pages: Math.ceil((count || 0) / limit),
    })
  } catch (err) {
    console.error('Admin analyses error:', err)
    res.status(500).json({ error: 'Failed to fetch analyses' })
  }
})

export default router
