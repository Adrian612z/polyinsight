import { Router, Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { supabase } from '../services/supabase.js'
import { config } from '../config.js'
import { grantCredits } from '../services/credit.js'
import { approveBillingOrder, rejectBillingOrder } from '../services/billing.js'
import { buildAnalysisFlowView } from '../services/analysisFlow.js'

const router = Router()

// ─── Admin Login (no auth required) ────────────────────────────────
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body
    if (!password) {
      res.status(400).json({ error: 'Password required' })
      return
    }

    if (password !== config.adminPassword) {
      res.status(401).json({ error: 'Invalid credentials' })
      return
    }

    const normalizedEmail = typeof email === 'string' ? email.trim() : ''
    let user: { id: string; email: string | null; display_name: string | null; role: string } | null = null

    if (normalizedEmail) {
      const { data: matchedUser, error } = await supabase
        .from('users')
        .select('id, email, display_name, role')
        .eq('email', normalizedEmail)
        .eq('role', 'admin')
        .maybeSingle()

      if (error) throw error
      user = matchedUser
    }

    if (!user) {
      const { data: adminUsers, error } = await supabase
        .from('users')
        .select('id, email, display_name, role')
        .eq('role', 'admin')

      if (error) throw error

      if ((adminUsers || []).length === 1) {
        user = adminUsers![0]
      }
    }

    if (!user) {
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

// ─── Admin JWT Auth Middleware ─────────────────────────────────────
async function adminAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization || ''

  if (authHeader.startsWith('Admin ')) {
    try {
      const decoded = jwt.verify(authHeader.slice(6), config.adminJwtSecret) as { userId: string; role: string }
      if (decoded.role !== 'admin') { res.status(403).json({ error: 'Forbidden' }); return }
      const { data: user, error } = await supabase
        .from('users')
        .select('role')
        .eq('id', decoded.userId)
        .maybeSingle()

      if (error) throw error
      if (user?.role !== 'admin') {
        res.status(403).json({ error: 'Forbidden' })
        return
      }

      req.userId = decoded.userId
      next()
      return
    } catch {
      res.status(401).json({ error: 'Invalid or expired token' })
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
      { count: referralCount },
      { data: allUsers },
    ] = await Promise.all([
      supabase.from('users').select('id', { count: 'exact', head: true }),
      supabase.from('users').select('id', { count: 'exact', head: true }).gte('created_at', todayStart),
      supabase.from('analysis_records').select('id', { count: 'exact', head: true }),
      supabase.from('analysis_records').select('id', { count: 'exact', head: true }).gte('created_at', todayStart),
      supabase.from('credit_transactions').select('amount, type'),
      supabase.from('users').select('id', { count: 'exact', head: true }).not('referred_by', 'is', null),
      supabase.from('users').select('id, referred_by'),
    ])

    const sumByType = (types: string[], absolute = true) =>
      (creditStats || [])
        .filter(t => types.includes(t.type))
        .reduce((s, t) => s + (absolute ? Math.abs(t.amount) : t.amount), 0)

    // Count unique referrers (users who have invited at least one person)
    const referrerSet = new Set((allUsers || []).filter(u => u.referred_by).map(u => u.referred_by))

    res.json({
      totalUsers: totalUsers || 0,
      todayUsers: todayUsers || 0,
      totalAnalyses: totalAnalyses || 0,
      todayAnalyses: todayAnalyses || 0,
      // Granular credit stats
      userTopup: sumByType(['topup']),
      adminGrant: sumByType(['admin_grant']),
      signupBonus: sumByType(['signup_bonus']),
      analysisSpent: sumByType(['analysis_spend']),
      referralCommission: sumByType(['referral_commission'], false),
      // Referral stats
      referralCount: referralCount || 0,
      activeReferrers: referrerSet.size,
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

    const [{ data: user }, { data: analyses }, { data: transactions }, { data: invitedUsers }] = await Promise.all([
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
      // Users this person invited
      supabase.from('users')
        .select('id, email, display_name, credit_balance, created_at')
        .eq('referred_by', id)
        .order('created_at', { ascending: false }),
    ])

    if (!user) {
      res.status(404).json({ error: 'User not found' })
      return
    }

    // Resolve referrer info
    let referrerInfo = null
    if (user.referred_by) {
      const { data } = await supabase
        .from('users')
        .select('id, email, display_name, referral_code')
        .eq('id', user.referred_by)
        .single()
      referrerInfo = data
    }

    res.json({ user, analyses, transactions, invitedUsers: invitedUsers || [], referrer: referrerInfo })
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

    const { data: jobs, error: jobsError } = await supabase
      .from('analysis_jobs')
      .select('id, status, attempts, max_attempts, last_error, locked_by, locked_at, started_at, finished_at, created_at, updated_at')
      .eq('analysis_record_id', data.id)
      .order('created_at', { ascending: false })

    if (jobsError) throw jobsError

    const latestJob = Array.isArray(jobs) && jobs.length > 0 ? jobs[0] : null
    const flow = buildAnalysisFlowView({
      recordStatus: data.status,
      analysisResult: data.analysis_result,
      jobStatus: latestJob?.status || null,
      jobError: latestJob?.last_error || null,
    })

    res.json({ analysis: data, user, latestJob, jobs: jobs || [], flow })
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

// ─── Billing Orders Review ────────────────────────────────────────
router.get('/billing/orders', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100)
    const from = (page - 1) * limit
    const to = from + limit - 1
    const status = (req.query.status as string) || ''
    const planId = (req.query.planId as string) || ''

    let query = supabase
      .from('billing_orders')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })

    if (status) query = query.eq('status', status)
    if (planId) query = query.eq('plan_id', planId)

    const { data, error, count } = await query.range(from, to)

    if (error) throw error

    res.json({
      orders: data,
      total: count,
      page,
      pages: Math.ceil((count || 0) / limit),
    })
  } catch (err) {
    console.error('Billing orders error:', err)
    res.status(500).json({ error: 'Failed to fetch billing orders' })
  }
})

router.get('/billing/subscriptions', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100)
    const from = (page - 1) * limit
    const to = from + limit - 1
    const status = (req.query.status as string) || ''
    const planId = (req.query.planId as string) || ''

    let query = supabase
      .from('user_subscriptions')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })

    if (status) query = query.eq('status', status)
    if (planId) query = query.eq('plan_id', planId)

    const { data, error, count } = await query.range(from, to)

    if (error) throw error

    res.json({
      subscriptions: data,
      total: count,
      page,
      pages: Math.ceil((count || 0) / limit),
    })
  } catch (err) {
    console.error('Billing subscriptions error:', err)
    res.status(500).json({ error: 'Failed to fetch billing subscriptions' })
  }
})

router.post('/billing/orders/:id/approve', async (req: Request, res: Response) => {
  try {
    const reviewNote = typeof req.body?.reviewNote === 'string' ? req.body.reviewNote : undefined
    const result = await approveBillingOrder(req.params.id, req.userId!, reviewNote)
    res.json(result)
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === 'ORDER_NOT_FOUND') {
        res.status(404).json({ error: 'Billing order not found' })
        return
      }
      if (err.message === 'ORDER_ALREADY_APPROVED') {
        res.status(409).json({ error: 'Billing order already approved' })
        return
      }
      if (err.message === 'ORDER_NOT_APPROVABLE') {
        res.status(409).json({ error: 'Billing order cannot be approved' })
        return
      }
      if (err.message === 'ORDER_MISSING_TX') {
        res.status(409).json({ error: 'Billing order has no submitted transaction yet' })
        return
      }
    }

    console.error('Approve billing order error:', err)
    res.status(500).json({ error: 'Failed to approve billing order' })
  }
})

router.post('/billing/orders/:id/reject', async (req: Request, res: Response) => {
  try {
    const reviewNote = typeof req.body?.reviewNote === 'string' ? req.body.reviewNote : undefined
    const order = await rejectBillingOrder(req.params.id, req.userId!, reviewNote)
    res.json({ order })
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === 'ORDER_NOT_FOUND') {
        res.status(404).json({ error: 'Billing order not found' })
        return
      }
      if (err.message === 'ORDER_ALREADY_APPROVED') {
        res.status(409).json({ error: 'Billing order already approved' })
        return
      }
      if (err.message === 'ORDER_ALREADY_REJECTED') {
        res.status(409).json({ error: 'Billing order already rejected' })
        return
      }
      if (err.message === 'ORDER_NOT_REJECTABLE') {
        res.status(409).json({ error: 'Billing order cannot be rejected' })
        return
      }
    }

    console.error('Reject billing order error:', err)
    res.status(500).json({ error: 'Failed to reject billing order' })
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
