import { supabase } from './supabase.js'
import { config } from '../config.js'

/**
 * Deduct credits atomically. Returns updated balance or throws.
 */
export async function deductCredits(
  userId: string,
  amount: number,
  type: string,
  referenceId?: string,
  description?: string
): Promise<number> {
  // 1. Get current balance
  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('credit_balance, referred_by')
    .eq('id', userId)
    .single()

  if (userErr || !user) throw new Error('User not found')

  const currentBalance = user.credit_balance
  if (currentBalance < amount) {
    throw new Error('INSUFFICIENT_CREDITS')
  }

  const newBalance = currentBalance - amount

  // 2. Update balance with optimistic lock — check affected rows
  const { data: updated, error: updateErr } = await supabase
    .from('users')
    .update({ credit_balance: newBalance, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .eq('credit_balance', currentBalance) // Optimistic lock
    .select('id')

  if (updateErr) throw new Error('Deduction failed, please retry')

  // If no rows matched, another concurrent request changed the balance
  if (!updated || updated.length === 0) {
    throw new Error('Concurrent credit update detected, please retry')
  }

  // 3. Record transaction
  await supabase.from('credit_transactions').insert({
    user_id: userId,
    amount: -amount,
    type,
    reference_id: referenceId,
    description: description || `Analysis charge ${(amount / 100).toFixed(2)} credits`,
    balance_after: newBalance,
  })

  // 4. Referral commission
  if (user.referred_by && type === 'analysis_spend') {
    const commission = Math.floor(amount * config.referralCommissionRate)
    if (commission > 0) {
      await grantCredits(
        user.referred_by,
        commission,
        'referral_commission',
        referenceId,
        `Referral commission ${(commission / 100).toFixed(2)} credits`
      )
    }
  }

  return newBalance
}

/**
 * Grant credits to a user with optimistic lock to prevent lost updates.
 */
export async function grantCredits(
  userId: string,
  amount: number,
  type: string,
  referenceId?: string,
  description?: string
): Promise<number> {
  const { data: user, error } = await supabase
    .from('users')
    .select('credit_balance')
    .eq('id', userId)
    .single()

  if (error || !user) throw new Error('User not found')

  const currentBalance = user.credit_balance
  const newBalance = currentBalance + amount

  // Optimistic lock — check affected rows
  const { data: updated, error: updateErr } = await supabase
    .from('users')
    .update({ credit_balance: newBalance, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .eq('credit_balance', currentBalance) // Optimistic lock
    .select('id')

  if (updateErr) throw new Error('Grant failed, please retry')

  if (!updated || updated.length === 0) {
    throw new Error('Concurrent credit update detected, please retry')
  }

  await supabase.from('credit_transactions').insert({
    user_id: userId,
    amount,
    type,
    reference_id: referenceId,
    description: description || `Top-up ${(amount / 100).toFixed(2)} credits`,
    balance_after: newBalance,
  })

  return newBalance
}
