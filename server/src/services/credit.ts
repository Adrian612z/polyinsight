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

async function reverseReferralCommissionIfNeeded(userId: string, recordId: string): Promise<void> {
  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('referred_by')
    .eq('id', userId)
    .single()

  if (userErr || !user?.referred_by) return

  const { data: commissionTx, error: commissionErr } = await supabase
    .from('credit_transactions')
    .select('amount')
    .eq('user_id', user.referred_by)
    .eq('type', 'referral_commission')
    .eq('reference_id', recordId)
    .gt('amount', 0)
    .maybeSingle()

  if (commissionErr || !commissionTx) return

  const { data: reversalTx, error: reversalErr } = await supabase
    .from('credit_transactions')
    .select('id')
    .eq('user_id', user.referred_by)
    .eq('type', 'referral_commission')
    .eq('reference_id', recordId)
    .eq('amount', -commissionTx.amount)
    .maybeSingle()

  if (reversalErr || reversalTx) return

  await grantCredits(
    user.referred_by,
    -commissionTx.amount,
    'referral_commission',
    recordId,
    `Referral commission reversed for refunded analysis ${recordId}`
  )
}

/**
 * Refund an analysis charge once. Safe to call repeatedly for the same record.
 */
export async function refundAnalysisCreditsIfNeeded(
  userId: string,
  recordId: string,
  description?: string
): Promise<{ refunded: boolean; balance: number | null }> {
  const { data: spentTx, error: spentErr } = await supabase
    .from('credit_transactions')
    .select('amount')
    .eq('user_id', userId)
    .eq('type', 'analysis_spend')
    .eq('reference_id', recordId)
    .maybeSingle()

  if (spentErr) throw new Error('Failed to load original analysis charge')
  if (!spentTx) return { refunded: false, balance: null }

  const { data: refundTx, error: refundErr } = await supabase
    .from('credit_transactions')
    .select('id, balance_after')
    .eq('user_id', userId)
    .eq('type', 'refund')
    .eq('reference_id', recordId)
    .maybeSingle()

  if (refundErr) throw new Error('Failed to check existing refund')

  let refunded = false
  let balance = refundTx?.balance_after ?? null

  if (!refundTx) {
    const refundAmount = Math.abs(spentTx.amount)
    balance = await grantCredits(
      userId,
      refundAmount,
      'refund',
      recordId,
      description || `Refund for failed analysis ${recordId}`
    )
    refunded = true
  }

  await reverseReferralCommissionIfNeeded(userId, recordId)

  return { refunded, balance }
}
