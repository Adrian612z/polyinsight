import { Router, Request, Response } from 'express'
import { randomInt } from 'crypto'
import { supabase } from '../services/supabase.js'
import { authMiddleware } from '../middleware/auth.js'
import { config } from '../config.js'

const router = Router()

function generateReferralCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[randomInt(0, chars.length)]
  }
  return code
}

// POST /api/users/register - Upsert user on first login
router.post('/register', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!
    const { email, displayName, referralCode } = req.body

    // Check if user already exists
    const { data: existing } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single()

    if (existing) {
      // Update display info if changed
      if (email || displayName) {
        await supabase
          .from('users')
          .update({
            email: email || existing.email,
            display_name: displayName || existing.display_name,
            updated_at: new Date().toISOString(),
          })
          .eq('id', userId)
      }
      res.json({
        user: {
          ...existing,
          email: email || existing.email,
          display_name: displayName || existing.display_name,
        },
        isNew: false,
      })
      return
    }

    // Generate unique referral code
    let code = generateReferralCode()
    let attempts = 0
    while (attempts < 10) {
      const { data: dup } = await supabase
        .from('users')
        .select('id')
        .eq('referral_code', code)
        .single()
      if (!dup) break
      code = generateReferralCode()
      attempts++
    }

    // Resolve referrer
    let referredBy: string | null = null
    if (referralCode) {
      const { data: referrer } = await supabase
        .from('users')
        .select('id')
        .eq('referral_code', referralCode.toUpperCase())
        .single()
      if (referrer) referredBy = referrer.id
    }

    // Create user
    const { data: newUser, error } = await supabase
      .from('users')
      .insert({
        id: userId,
        email: email || null,
        display_name: displayName || null,
        credit_balance: config.signupBonus,
        referral_code: code,
        referred_by: referredBy,
      })
      .select()
      .single()

    if (error) throw error

    // Record signup bonus transaction
    await supabase.from('credit_transactions').insert({
      user_id: userId,
      amount: config.signupBonus,
      type: 'signup_bonus',
      description: 'Signup bonus 3.00 credits',
      balance_after: config.signupBonus,
    })

    res.json({
      user: newUser,
      isNew: true,
    })
  } catch (err: unknown) {
    console.error('Register error:', err)
    res.status(500).json({ error: 'Registration failed' })
  }
})

// GET /api/users/me - Get current user profile
router.get('/me', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', req.userId!)
      .single()

    if (error || !user) {
      res.status(404).json({ error: 'User not found' })
      return
    }

    res.json({ user })
  } catch (err) {
    console.error('Get user error:', err)
    res.status(500).json({ error: 'Failed to fetch user info' })
  }
})

export default router
