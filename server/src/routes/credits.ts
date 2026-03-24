import { Router, Request, Response } from 'express'
import { supabase } from '../services/supabase.js'
import { authMiddleware } from '../middleware/auth.js'
import { getDailyCheckInStatus, performDailyCheckIn } from '../services/checkin.js'

const router = Router()

// GET /api/credits/check-in - Get daily check-in status
router.get('/check-in', authMiddleware, async (req: Request, res: Response) => {
  try {
    const status = await getDailyCheckInStatus(req.userId!)
    res.json(status)
  } catch (err: unknown) {
    if (isCodedError(err, 'USER_NOT_FOUND')) {
      res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' })
      return
    }

    console.error('Check-in status error:', err)
    res.status(500).json({ error: 'Failed to fetch check-in status' })
  }
})

// POST /api/credits/check-in - Daily check-in
router.post('/check-in', authMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await performDailyCheckIn(req.userId!)
    res.json(result)
  } catch (err: unknown) {
    if (isCodedError(err, 'ALREADY_CHECKED_IN')) {
      const status = await getDailyCheckInStatus(req.userId!)
      res.status(409).json({
        error: 'Already checked in today',
        code: 'ALREADY_CHECKED_IN',
        status,
      })
      return
    }

    if (isCodedError(err, 'USER_NOT_FOUND')) {
      res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' })
      return
    }

    if (isCodedError(err, 'DAILY_CHECKIN_RPC_MISSING')) {
      res.status(500).json({
        error: 'Daily check-in database migration is missing',
        code: 'DAILY_CHECKIN_RPC_MISSING',
      })
      return
    }

    console.error('Daily check-in error:', err)
    res.status(500).json({ error: 'Failed to complete daily check-in' })
  }
})

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

function isCodedError(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === code)
}

export default router
