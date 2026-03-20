import { supabase } from './supabase.js'
import { config } from '../config.js'

interface CreditMutationResult {
  applied: boolean
  balance: number
}

interface ApplyCreditMutationOptions {
  amount: number
  userId: string
  type: string
  referenceId?: string
  description?: string
  requireNonNegative?: boolean
  dedupe?: boolean
}

interface CreditRpcRow {
  applied?: boolean
  balance?: number
  transaction_id?: string
}

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
  const result = await applyCreditMutation({
    userId,
    amount: -amount,
    type,
    referenceId,
    description: description || `Analysis charge ${(amount / 100).toFixed(2)} credits`,
    requireNonNegative: true,
    dedupe: Boolean(referenceId),
  })

  // Referral commission only runs on a newly applied spend, not on deduped retries.
  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('referred_by')
    .eq('id', userId)
    .single()

  if (userErr || !user) throw new Error('User not found')

  if (result.applied && user.referred_by && type === 'analysis_spend') {
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

  return result.balance
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
  const result = await applyCreditMutation({
    userId,
    amount,
    type,
    referenceId,
    description: description || `Top-up ${(amount / 100).toFixed(2)} credits`,
    dedupe: Boolean(referenceId),
  })

  return result.balance
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

async function applyCreditMutation(options: ApplyCreditMutationOptions): Promise<CreditMutationResult> {
  const rpcResult = await applyCreditMutationViaRpc(options)
  if (rpcResult) return rpcResult

  return applyCreditMutationLegacy(options)
}

async function applyCreditMutationViaRpc(
  options: ApplyCreditMutationOptions
): Promise<CreditMutationResult | null> {
  const { data, error } = await supabase.rpc('apply_credit_transaction', {
    p_user_id: options.userId,
    p_amount: options.amount,
    p_type: options.type,
    p_reference_id: options.referenceId || null,
    p_description: options.description || null,
    p_require_non_negative: options.requireNonNegative === true,
    p_dedupe: options.dedupe === true,
  })

  if (error) {
    if (isMissingApplyCreditRpc(error)) {
      return null
    }

    const message = [error.message, error.details, error.hint].filter(Boolean).join(' ')
    if (/INSUFFICIENT_CREDITS/i.test(message)) {
      throw new Error('INSUFFICIENT_CREDITS')
    }
    if (/USER_NOT_FOUND/i.test(message)) {
      throw new Error('User not found')
    }
    throw new Error(`Credit mutation failed: ${message || 'unknown error'}`)
  }

  const row = Array.isArray(data) ? data[0] : data
  const parsed = normalizeCreditRpcRow(row)
  if (!parsed) {
    throw new Error('Credit mutation failed: empty RPC response')
  }

  return parsed
}

function normalizeCreditRpcRow(row: unknown): CreditMutationResult | null {
  const value = row as CreditRpcRow | null
  if (!value || typeof value.balance !== 'number') return null

  return {
    applied: value.applied !== false,
    balance: value.balance,
  }
}

async function applyCreditMutationLegacy(
  options: ApplyCreditMutationOptions
): Promise<CreditMutationResult> {
  const { data: user, error } = await supabase
    .from('users')
    .select('credit_balance')
    .eq('id', options.userId)
    .single()

  if (error || !user) throw new Error('User not found')

  const currentBalance = user.credit_balance
  const newBalance = currentBalance + options.amount

  if (options.requireNonNegative && newBalance < 0) {
    throw new Error('INSUFFICIENT_CREDITS')
  }

  const { data: updated, error: updateErr } = await supabase
    .from('users')
    .update({ credit_balance: newBalance, updated_at: new Date().toISOString() })
    .eq('id', options.userId)
    .eq('credit_balance', currentBalance)
    .select('id')

  if (updateErr) throw new Error('Credit mutation failed, please retry')
  if (!updated || updated.length === 0) {
    throw new Error('Concurrent credit update detected, please retry')
  }

  const { error: txErr } = await supabase.from('credit_transactions').insert({
    user_id: options.userId,
    amount: options.amount,
    type: options.type,
    reference_id: options.referenceId,
    description: options.description || null,
    balance_after: newBalance,
  })

  if (txErr) throw new Error('Credit ledger write failed, please retry')

  return {
    applied: true,
    balance: newBalance,
  }
}

function isMissingApplyCreditRpc(error: {
  code?: string
  message?: string
  details?: string | null
  hint?: string | null
}): boolean {
  const message = [error.message, error.details, error.hint].filter(Boolean).join(' ')
  return /apply_credit_transaction/i.test(message) && /find the function|does not exist|schema cache|not found/i.test(message)
}
