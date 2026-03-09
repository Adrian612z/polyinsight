import { Router, Request, Response } from 'express'
import { supabase } from '../services/supabase.js'
import { authMiddleware } from '../middleware/auth.js'

const router = Router()

// GET /api/referral/info - Get referral code and stats
router.get('/info', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!

    // Get user's referral code
    const { data: user } = await supabase
      .from('users')
      .select('referral_code')
      .eq('id', userId)
      .single()

    if (!user) {
      res.status(404).json({ error: 'User not found' })
      return
    }

    // Count invited users
    const { count: invitedCount } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('referred_by', userId)

    // Total commission earned
    const { data: commissions } = await supabase
      .from('credit_transactions')
      .select('amount')
      .eq('user_id', userId)
      .eq('type', 'referral_commission')

    const totalCommission = (commissions || []).reduce((sum, tx) => sum + tx.amount, 0)

    res.json({
      referralCode: user.referral_code,
      referralLink: `https://polyinsight.online/?ref=${user.referral_code}`,
      invitedCount: invitedCount || 0,
      totalCommission,
    })
  } catch (err) {
    console.error('Referral info error:', err)
    res.status(500).json({ error: 'Failed to fetch referral info' })
  }
})

export default router
