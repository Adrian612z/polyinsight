import { Router, Request, Response } from 'express'
import { randomInt } from 'crypto'
import { supabase } from '../services/supabase.js'
import { authMiddleware } from '../middleware/auth.js'
import { config } from '../config.js'
import { getActiveSubscription } from '../services/billing.js'

const router = Router()

function generateReferralCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[randomInt(0, chars.length)]
  }
  return code
}

function normalizeReferralCode(input: string): string {
  return input.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6)
}

// POST /api/users/register - Upsert user on first login
router.post('/register', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!
    const { email, displayName, referralCode } = req.body
    const normalizedReferralCode = typeof referralCode === 'string' ? normalizeReferralCode(referralCode) : ''

    // Check if user already exists
    const { data: existing } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single()

    if (existing) {
      // Update display info if changed
      const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      }
      let shouldUpdate = false

      if (email && email !== existing.email) {
        updates.email = email
        shouldUpdate = true
      }

      // Preserve user-customized nicknames once the user exists.
      if (!existing.display_name && displayName) {
        updates.display_name = displayName
        shouldUpdate = true
      }

      if (shouldUpdate) {
        await supabase
          .from('users')
          .update(updates)
          .eq('id', userId)
      }
      res.json({
        user: {
          ...existing,
          email: email || existing.email,
          display_name: existing.display_name || displayName || null,
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
    if (normalizedReferralCode) {
      const { data: referrer } = await supabase
        .from('users')
        .select('id')
        .eq('referral_code', normalizedReferralCode)
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

router.post('/referral-code', authMiddleware, async (req: Request, res: Response) => {
  try {
    const rawReferralCode = req.body?.referralCode
    if (typeof rawReferralCode !== 'string') {
      res.status(400).json({ error: 'Referral code is required', code: 'REFERRAL_CODE_REQUIRED' })
      return
    }

    const referralCode = normalizeReferralCode(rawReferralCode)
    if (referralCode.length !== 6) {
      res.status(400).json({ error: 'Referral code must be 6 letters or numbers', code: 'INVALID_REFERRAL_CODE' })
      return
    }

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, referred_by')
      .eq('id', req.userId!)
      .single()

    if (userError || !user) {
      res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' })
      return
    }

    if (user.referred_by) {
      res.status(409).json({ error: 'Referral code has already been applied', code: 'REFERRAL_ALREADY_SET' })
      return
    }

    const { data: referrer, error: referrerError } = await supabase
      .from('users')
      .select('id')
      .eq('referral_code', referralCode)
      .single()

    if (referrerError || !referrer) {
      res.status(404).json({ error: 'Referral code not found', code: 'REFERRAL_NOT_FOUND' })
      return
    }

    if (referrer.id === req.userId) {
      res.status(400).json({ error: 'You cannot use your own referral code', code: 'SELF_REFERRAL_NOT_ALLOWED' })
      return
    }

    const { data: updatedUser, error: updateError } = await supabase
      .from('users')
      .update({
        referred_by: referrer.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.userId!)
      .select('*')
      .single()

    if (updateError || !updatedUser) {
      res.status(500).json({ error: 'Failed to apply referral code', code: 'REFERRAL_APPLY_FAILED' })
      return
    }

    res.json({ user: updatedUser })
  } catch (err) {
    console.error('Apply referral code error:', err)
    res.status(500).json({ error: 'Failed to apply referral code', code: 'REFERRAL_APPLY_FAILED' })
  }
})

router.patch('/me', authMiddleware, async (req: Request, res: Response) => {
  try {
    const rawDisplayName = req.body?.displayName

    if (typeof rawDisplayName !== 'string') {
      res.status(400).json({ error: 'displayName is required' })
      return
    }

    const displayName = rawDisplayName.trim()
    if (!displayName) {
      res.status(400).json({ error: 'Display name cannot be empty' })
      return
    }

    if (displayName.length > 40) {
      res.status(400).json({ error: 'Display name must be 40 characters or fewer' })
      return
    }

    const { data: user, error } = await supabase
      .from('users')
      .update({
        display_name: displayName,
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.userId!)
      .select('*')
      .single()

    if (error || !user) {
      res.status(404).json({ error: 'User not found' })
      return
    }

    res.json({ user })
  } catch (err) {
    console.error('Update user profile error:', err)
    res.status(500).json({ error: 'Failed to update user profile' })
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

    const activeSubscription = await getActiveSubscription(req.userId!)

    res.json({ user, activeSubscription })
  } catch (err) {
    console.error('Get user error:', err)
    res.status(500).json({ error: 'Failed to fetch user info' })
  }
})

export default router
