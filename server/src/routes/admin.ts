import { Router, Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { PrivyClient } from '@privy-io/server-auth'
import { supabase } from '../services/supabase.js'
import { config } from '../config.js'
import { grantCredits } from '../services/credit.js'

const router = Router()
const privy = new PrivyClient(config.privyAppId, config.privyAppSecret)

// ─── Admin Login (no auth required) ────────────────────────────────
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password required' })
      return
    }

    if (password !== config.adminPassword) {
      res.status(401).json({ error: 'Invalid credentials' })
      return
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, display_name, role')
      .eq('email', email)
      .eq('role', 'admin')
      .single()

    if (error || !user) {
      res.status(401).json({ error: 'Invalid credentials' })
      return
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: 'admin' },
      config.adminJwtSecret,
      { expiresIn: '24h' }
    )

    res.json({ token, user })
  } catch (err) {
    console.error('Admin login error:', err)
    res.status(500).json({ error: 'Login failed' })
  }
})

// ─── Combined Admin Auth Middleware ────────────────────────────────
async function adminAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization || ''

  // Admin JWT
  if (authHeader.startsWith('Admin ')) {
    try {
      const decoded = jwt.verify(authHeader.slice(6), config.adminJwtSecret) as { userId: string; role: string }
      if (decoded.role !== 'admin') { res.status(403).json({ error: 'Forbidden' }); return }
      req.userId = decoded.userId
      next()
      return
    } catch {
      res.status(401).json({ error: 'Invalid or expired token' })
      return
    }
  }

  // Privy Bearer token (for main frontend admin pages)
  if (authHeader.startsWith('Bearer ')) {
    try {
      const claims = await privy.verifyAuthToken(authHeader.slice(7))
      req.userId = claims.userId
      const { data: user } = await supabase.from('users').select('role').eq('id', req.userId).single()
      if (user?.role !== 'admin') { res.status(403).json({ error: 'Forbidden' }); return }
      next()
      return
    } catch {
      res.status(401).json({ error: 'Session expired' })
      return
    }
  }

  res.status(401).json({ error: 'Unauthorized' })
}

router.use(adminAuth)

// ─── Dashboard Stats ───────────────────────────────────────────────
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

// ─── Dashboard Charts (30 days) ────────────────────────────────────
router.get('/dashboard/charts', async (_req: Request, res: Response) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    const [{ data: users }, { data: analyses }, { data: transactions }] = await Promise.all([
      supabase.from('users').select('created_at').gte('created_at', thirtyDaysAgo),
      supabase.from('analysis_records').select('created_at, status').gte('created_at', thirtyDaysAgo),
      supabase.from('credit_transactions').select('created_at, amount, type').gte('created_at', thirtyDaysAgo),
    ])

    // Aggregate by date
    const dateMap = (items: any[], fn: (map: Record<string, any>, item: any) => void) => {
      const map: Record<string, any> = {}
      for (const item of items || []) {
        const date = item.created_at?.slice(0, 10)
        if (!date) continue
        if (!map[date]) map[date] = {}
        fn(map[date], item)
      }
      return map
    }

    const userGrowth = dateMap(users || [], (entry) => {
      entry.count = (entry.count || 0) + 1
    })

    const analysisStats = dateMap(analyses || [], (entry, item) => {
      entry[item.status] = (entry[item.status] || 0) + 1
    })

    const creditFlow = dateMap(transactions || [], (entry, item) => {
      if (item.amount > 0) entry.income = (entry.income || 0) + item.amount
      else entry.spent = (entry.spent || 0) + Math.abs(item.amount)
    })

    // Fill in dates for last 30 days
    const dates: string[] = []
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
      dates.push(d.toISOString().slice(0, 10))
    }

    res.json({
      userGrowth: dates.map(d => ({ date: d, count: userGrowth[d]?.count || 0 })),
      analysisStats: dates.map(d => ({
        date: d,
        completed: analysisStats[d]?.completed || 0,
        failed: analysisStats[d]?.failed || 0,
        pending: analysisStats[d]?.pending || 0,
      })),
      creditFlow: dates.map(d => ({
        date: d,
        income: creditFlow[d]?.income || 0,
        spent: creditFlow[d]?.spent || 0,
      })),
    })
  } catch (err) {
    console.error('Charts error:', err)
    res.status(500).json({ error: 'Failed to fetch chart data' })
  }
})

// ─── Users List (with search & filter) ─────────────────────────────
router.get('/users', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1
    const limit = 50
    const from = (page - 1) * limit
    const to = from + limit - 1
    const search = (req.query.search as string) || ''
    const role = (req.query.role as string) || ''

    let query = supabase
      .from('users')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })

    if (search) {
      // Sanitize search input to prevent PostgREST filter injection
      const sanitized = search.replace(/[%_,()]/g, '')
      if (sanitized) {
        query = query.or(`email.ilike.%${sanitized}%,display_name.ilike.%${sanitized}%`)
      }
    }
    if (role && ['admin', 'user'].includes(role)) {
      query = query.eq('role', role)
    }

    const { data, error, count } = await query.range(from, to)
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

// ─── User Detail ───────────────────────────────────────────────────
router.get('/users/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const [{ data: user }, { data: analyses }, { data: transactions }] = await Promise.all([
      supabase.from('users').select('*').eq('id', id).single(),
      supabase.from('analysis_records')
        .select('id, event_url, status, credits_charged, created_at')
        .eq('user_id', id)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase.from('credit_transactions')
        .select('*')
        .eq('user_id', id)
        .order('created_at', { ascending: false })
        .limit(50),
    ])

    if (!user) {
      res.status(404).json({ error: 'User not found' })
      return
    }

    res.json({ user, analyses, transactions })
  } catch (err) {
    console.error('User detail error:', err)
    res.status(500).json({ error: 'Failed to fetch user detail' })
  }
})

// ─── Update User ───────────────────────────────────────────────────
router.put('/users/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { role, display_name, credit_balance } = req.body

    const updates: Record<string, any> = { updated_at: new Date().toISOString() }
    if (role !== undefined) {
      if (!['admin', 'user'].includes(role)) {
        res.status(400).json({ error: 'Invalid role. Must be "admin" or "user"' })
        return
      }
      updates.role = role
    }
    if (display_name !== undefined && typeof display_name === 'string') updates.display_name = display_name
    if (credit_balance !== undefined && typeof credit_balance === 'number' && credit_balance >= 0) updates.credit_balance = credit_balance

    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    res.json({ user: data })
  } catch (err) {
    console.error('Update user error:', err)
    res.status(500).json({ error: 'Failed to update user' })
  }
})

// ─── Grant Credits ─────────────────────────────────────────────────
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

// ─── Analyses List (with search & filter) ──────────────────────────
router.get('/analyses', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1
    const limit = 50
    const from = (page - 1) * limit
    const to = from + limit - 1
    const search = (req.query.search as string) || ''
    const status = (req.query.status as string) || ''

    let query = supabase
      .from('analysis_records')
      .select('id, user_id, event_url, status, credits_charged, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })

    if (search) {
      const sanitized = search.replace(/[%_,()]/g, '')
      if (sanitized) {
        query = query.or(`event_url.ilike.%${sanitized}%,user_id.ilike.%${sanitized}%`)
      }
    }
    if (status) {
      query = query.eq('status', status)
    }

    const { data, error, count } = await query.range(from, to)
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

// ─── Analysis Detail ───────────────────────────────────────────────
router.get('/analyses/:id', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('analysis_records')
      .select('*')
      .eq('id', req.params.id)
      .single()

    if (error || !data) {
      res.status(404).json({ error: 'Analysis not found' })
      return
    }

    // Also get user info
    const { data: user } = await supabase
      .from('users')
      .select('id, email, display_name')
      .eq('id', data.user_id)
      .single()

    res.json({ analysis: data, user })
  } catch (err) {
    console.error('Analysis detail error:', err)
    res.status(500).json({ error: 'Failed to fetch analysis detail' })
  }
})

// ─── Transactions List ─────────────────────────────────────────────
router.get('/transactions', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1
    const limit = 50
    const from = (page - 1) * limit
    const to = from + limit - 1
    const type = (req.query.type as string) || ''
    const userId = (req.query.userId as string) || ''

    let query = supabase
      .from('credit_transactions')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })

    if (type) query = query.eq('type', type)
    if (userId) query = query.eq('user_id', userId)

    const { data, error, count } = await query.range(from, to)
    if (error) throw error

    res.json({
      transactions: data,
      total: count,
      page,
      pages: Math.ceil((count || 0) / limit),
    })
  } catch (err) {
    console.error('Transactions error:', err)
    res.status(500).json({ error: 'Failed to fetch transactions' })
  }
})

// ─── Featured Analyses ─────────────────────────────────────────────
router.get('/featured', async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('featured_analyses')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    res.json({ featured: data })
  } catch (err) {
    console.error('Featured error:', err)
    res.status(500).json({ error: 'Failed to fetch featured' })
  }
})

router.post('/featured', async (req: Request, res: Response) => {
  try {
    const { event_slug, event_title, category, polymarket_url, analysis_record_id, decision_data, mispricing_score } = req.body

    const { data, error } = await supabase
      .from('featured_analyses')
      .insert({
        event_slug,
        event_title,
        category,
        polymarket_url,
        analysis_record_id: analysis_record_id || null,
        decision_data: decision_data || null,
        mispricing_score: mispricing_score || null,
        is_active: true,
      })
      .select()
      .single()

    if (error) throw error
    res.json({ featured: data })
  } catch (err) {
    console.error('Add featured error:', err)
    res.status(500).json({ error: 'Failed to add featured' })
  }
})

router.put('/featured/:id', async (req: Request, res: Response) => {
  try {
    // Whitelist allowed fields to prevent mass assignment
    const { event_slug, event_title, category, polymarket_url, analysis_record_id, decision_data, mispricing_score, is_active } = req.body
    const allowed: Record<string, any> = {}
    if (event_slug !== undefined) allowed.event_slug = event_slug
    if (event_title !== undefined) allowed.event_title = event_title
    if (category !== undefined) allowed.category = category
    if (polymarket_url !== undefined) allowed.polymarket_url = polymarket_url
    if (analysis_record_id !== undefined) allowed.analysis_record_id = analysis_record_id
    if (decision_data !== undefined) allowed.decision_data = decision_data
    if (mispricing_score !== undefined) allowed.mispricing_score = mispricing_score
    if (is_active !== undefined) allowed.is_active = is_active

    const { data, error } = await supabase
      .from('featured_analyses')
      .update(allowed)
      .eq('id', req.params.id)
      .select()
      .single()

    if (error) throw error
    res.json({ featured: data })
  } catch (err) {
    console.error('Update featured error:', err)
    res.status(500).json({ error: 'Failed to update featured' })
  }
})

router.delete('/featured/:id', async (req: Request, res: Response) => {
  try {
    const { error } = await supabase
      .from('featured_analyses')
      .delete()
      .eq('id', req.params.id)

    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    console.error('Delete featured error:', err)
    res.status(500).json({ error: 'Failed to delete featured' })
  }
})

// ─── Settings ──────────────────────────────────────────────────────
router.get('/settings', async (_req: Request, res: Response) => {
  res.json({
    analysisCost: config.analysisCost,
    signupBonus: config.signupBonus,
    referralCommissionRate: config.referralCommissionRate,
  })
})

export default router
