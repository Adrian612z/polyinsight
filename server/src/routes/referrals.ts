import { Router, Request, Response } from 'express'
import { supabase } from '../services/supabase.js'
import { authMiddleware } from '../middleware/auth.js'

const router = Router()

interface InvitedUserRow {
  id: string
  email: string | null
  display_name: string | null
  created_at: string
}

interface CommissionRow {
  id: string
  amount: number
  description: string | null
  balance_after: number
  created_at: string
  reference_id: string | null
}

// GET /api/referral/info - Get referral code and stats
router.get('/info', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!

    const [{ data: user }, { data: invitedUsers, count: invitedCount }, { data: commissions }] = await Promise.all([
      supabase
        .from('users')
        .select('referral_code')
        .eq('id', userId)
        .single(),
      supabase
        .from('users')
        .select('id, email, display_name, created_at', { count: 'exact' })
        .eq('referred_by', userId)
        .order('created_at', { ascending: false }),
      supabase
        .from('credit_transactions')
        .select('id, amount, description, balance_after, created_at, reference_id')
        .eq('user_id', userId)
        .eq('type', 'referral_commission')
        .order('created_at', { ascending: false }),
    ])

    if (!user) {
      res.status(404).json({ error: 'User not found' })
      return
    }

    const totalCommission = (commissions || []).reduce((sum, tx) => sum + tx.amount, 0)

    res.json({
      referralCode: user.referral_code,
      referralLink: `https://polyinsight.online/?ref=${user.referral_code}`,
      invitedCount: invitedCount || 0,
      totalCommission,
      invitedUsers: (invitedUsers || []) as InvitedUserRow[],
      commissionRecords: (commissions || []) as CommissionRow[],
    })
  } catch (err) {
    console.error('Referral info error:', err)
    res.status(500).json({ error: 'Failed to fetch referral info' })
  }
})

export default router
