import { grantCredits } from './credit.js'
import { supabase } from './supabase.js'
import { markApprovedBillingOrder } from './tracking.js'

export type BillingPlanId = 'topup' | 'monthly' | 'unlimited'

export interface BillingPlanDefinition {
  id: BillingPlanId
  expectedAmountTokens: number | null
  minimumAmountTokens: number
  creditedCenticredits: number
  unlimited: boolean
  durationDays: number | null
}

const BILLING_PLANS: Record<BillingPlanId, BillingPlanDefinition> = {
  topup: {
    id: 'topup',
    expectedAmountTokens: null,
    minimumAmountTokens: 0.01,
    creditedCenticredits: 0,
    unlimited: false,
    durationDays: null,
  },
  monthly: {
    id: 'monthly',
    expectedAmountTokens: 20,
    minimumAmountTokens: 20,
    creditedCenticredits: 6000,
    unlimited: false,
    durationDays: 30,
  },
  unlimited: {
    id: 'unlimited',
    expectedAmountTokens: 99.9,
    minimumAmountTokens: 99.9,
    creditedCenticredits: 0,
    unlimited: true,
    durationDays: 30,
  },
}

interface BillingOrderRow {
  id: string
  user_id: string
  plan_id: BillingPlanId
  status: 'created' | 'submitted' | 'approved' | 'rejected' | 'cancelled' | 'expired'
  expected_amount_tokens: number | string
  expected_credits: number
  attribution_session_id?: string | null
  attribution_campaign_code?: string | null
  attribution_referral_code?: string | null
  attribution_source_type?: string | null
  attribution_source_platform?: string | null
  tx_hash?: string | null
  token_symbol?: string | null
  submitted_at?: string | null
  approved_at?: string | null
  reviewed_by?: string | null
  expires_at?: string | null
}

interface UserSubscriptionRow {
  id: string
  user_id: string
  plan_id: 'monthly' | 'unlimited'
  status: 'active' | 'expired' | 'cancelled'
  included_credits: number
  unlimited: boolean
  starts_at: string
  ends_at: string
}

interface AtomicBillingReviewResult {
  order: BillingOrderRow
  subscription?: UserSubscriptionRow | null
}

export interface BillingTransactionRow {
  id?: string
  tx_hash?: string | null
  token_symbol?: string | null
  created_at?: string | null
}

function roundTokenAmount(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000
}

function toNumeric(value: number | string | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function addDays(base: Date, days: number): Date {
  const next = new Date(base)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function isOrderReusable(order: BillingOrderRow, expectedAmountTokens: number): boolean {
  return ['created', 'submitted'].includes(order.status)
    && Number(order.expected_amount_tokens) === expectedAmountTokens
    && (!order.expires_at || new Date(order.expires_at).getTime() > Date.now())
}

function isMissingBillingAttributionColumn(error: {
  code?: string
  message?: string
  details?: string | null
  hint?: string | null
}): boolean {
  const message = [error.code, error.message, error.details, error.hint].filter(Boolean).join(' ')
  return /billing_orders\.attribution_|attribution_session_id|attribution_campaign_code|attribution_referral_code|attribution_source_type|attribution_source_platform/i.test(message)
    && /column|schema cache|does not exist|not found|42703/i.test(message)
}

export function listBillingPlans(): BillingPlanDefinition[] {
  return Object.values(BILLING_PLANS)
}

export function getBillingPlan(planId: string): BillingPlanDefinition | null {
  if (planId === 'topup' || planId === 'monthly' || planId === 'unlimited') {
    return BILLING_PLANS[planId]
  }
  return null
}

export function calculateBillingOrder(planId: BillingPlanId, rawAmount?: number): {
  expectedAmountTokens: number
  expectedCredits: number
} {
  const plan = BILLING_PLANS[planId]

  if (planId === 'topup') {
    if (!rawAmount || !Number.isFinite(rawAmount) || rawAmount < BILLING_PLANS.topup.minimumAmountTokens) {
      throw new Error('INVALID_TOPUP_AMOUNT')
    }

    const expectedAmountTokens = roundTokenAmount(rawAmount)
    return {
      expectedAmountTokens,
      expectedCredits: Math.round(expectedAmountTokens * 100),
    }
  }

  return {
    expectedAmountTokens: plan.expectedAmountTokens || 0,
    expectedCredits: plan.creditedCenticredits,
  }
}

async function assertPlanPurchaseAllowed(userId: string, planId: BillingPlanId): Promise<void> {
  if (planId === 'topup' || planId === 'unlimited') {
    return
  }

  const activeSubscription = await getActiveSubscription(userId)
  if (activeSubscription?.unlimited) {
    throw new Error('PLAN_NOT_COMPATIBLE_WITH_ACTIVE_SUBSCRIPTION')
  }
}

export async function createBillingOrder(
  userId: string,
  planId: BillingPlanId,
  rawAmount?: number,
  attribution?: {
    sessionId?: string | null
    campaignCode?: string | null
    referralCode?: string | null
    sourceType?: string | null
    sourcePlatform?: string | null
  },
) {
  const plan = BILLING_PLANS[planId]
  const { expectedAmountTokens, expectedCredits } = calculateBillingOrder(planId, rawAmount)
  const expiresAt = addDays(new Date(), 1).toISOString()

  await assertPlanPurchaseAllowed(userId, planId)
  await expireStaleBillingOrders(userId)

  const { data: existing, error: existingErr } = await supabase
    .from('billing_orders')
    .select('*')
    .eq('user_id', userId)
    .eq('plan_id', plan.id)
    .in('status', ['created', 'submitted'])
    .order('created_at', { ascending: false })
    .limit(5)

  if (existingErr) throw existingErr

  const reusableOrder = ((existing || []) as BillingOrderRow[]).find((order) =>
    isOrderReusable(order, expectedAmountTokens)
  )

  if (reusableOrder) {
    if (
      attribution?.sessionId &&
      (!reusableOrder.attribution_session_id ||
        reusableOrder.attribution_session_id !== attribution.sessionId)
    ) {
      const { data: updatedReusable, error: reusableUpdateErr } = await supabase
        .from('billing_orders')
        .update({
          attribution_session_id: attribution.sessionId,
          attribution_campaign_code: attribution.campaignCode || reusableOrder.attribution_campaign_code || null,
          attribution_referral_code: attribution.referralCode || reusableOrder.attribution_referral_code || null,
          attribution_source_type: attribution.sourceType || reusableOrder.attribution_source_type || null,
          attribution_source_platform:
            attribution.sourcePlatform || reusableOrder.attribution_source_platform || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', reusableOrder.id)
        .select()
        .single()

      if (reusableUpdateErr) {
        if (isMissingBillingAttributionColumn(reusableUpdateErr)) {
          return reusableOrder
        }
        throw reusableUpdateErr
      }
      return updatedReusable as BillingOrderRow
    }

    return reusableOrder
  }

  let insertResult = await supabase
    .from('billing_orders')
    .insert({
      user_id: userId,
      plan_id: plan.id,
      status: 'created',
      expected_amount_tokens: expectedAmountTokens,
      expected_credits: expectedCredits,
      expires_at: expiresAt,
      attribution_session_id: attribution?.sessionId || null,
      attribution_campaign_code: attribution?.campaignCode || null,
      attribution_referral_code: attribution?.referralCode || null,
      attribution_source_type: attribution?.sourceType || null,
      attribution_source_platform: attribution?.sourcePlatform || null,
    })
    .select()
    .single()

  if (insertResult.error && isMissingBillingAttributionColumn(insertResult.error)) {
    insertResult = await supabase
      .from('billing_orders')
      .insert({
        user_id: userId,
        plan_id: plan.id,
        status: 'created',
        expected_amount_tokens: expectedAmountTokens,
        expected_credits: expectedCredits,
        expires_at: expiresAt,
      })
      .select()
      .single()
  }

  if (insertResult.error) throw insertResult.error
  return insertResult.data
}

export async function getBillingOverview(userId: string) {
  await expireStaleBillingOrders(userId)
  await expireFinishedSubscriptions()
  const nowIso = new Date().toISOString()

  const [{ data: activeSubscriptions, error: subscriptionErr }, { data: orders, error: ordersErr }] = await Promise.all([
    supabase
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .gt('ends_at', nowIso)
      .order('ends_at', { ascending: false }),
    supabase
      .from('billing_orders')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  if (subscriptionErr) throw subscriptionErr
  if (ordersErr) throw ordersErr

  const activeSubscription = (activeSubscriptions || [])
    .sort((a, b) => {
      if (a.unlimited !== b.unlimited) return a.unlimited ? -1 : 1
      return new Date(b.ends_at).getTime() - new Date(a.ends_at).getTime()
    })[0] || null

  return {
    activeSubscription,
    orders: orders || [],
  }
}

export async function getBillingOrderForUser(userId: string, orderId: string) {
  await expireStaleBillingOrders(userId)

  const { data: order, error } = await supabase
    .from('billing_orders')
    .select('*')
    .eq('id', orderId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  if (!order) throw new Error('ORDER_NOT_FOUND')

  const { data: transactions, error: txErr } = await supabase
    .from('transactions')
    .select('*')
    .eq('billing_order_id', orderId)
    .order('created_at', { ascending: false })

  if (txErr) throw txErr

  const hydratedOrder = hydrateBillingOrderSnapshot(order as BillingOrderRow, (transactions || []) as BillingTransactionRow[])

  return {
    order: hydratedOrder,
    transactions: transactions || [],
    latestTransaction: selectLatestBillingOrderTransaction((transactions || []) as BillingTransactionRow[]),
  }
}

export async function getActiveSubscription(userId: string) {
  await expireFinishedSubscriptions()

  const nowIso = new Date().toISOString()
  const { data, error } = await supabase
    .from('user_subscriptions')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .gt('ends_at', nowIso)
    .order('ends_at', { ascending: false })

  if (error) throw error
  const activeSubscriptions = (data as UserSubscriptionRow[] | null) || []

  return activeSubscriptions
    .sort((a, b) => {
      if (a.unlimited !== b.unlimited) return a.unlimited ? -1 : 1
      return new Date(b.ends_at).getTime() - new Date(a.ends_at).getTime()
    })[0] || null
}

export async function cancelBillingOrder(userId: string, orderId: string) {
  await expireStaleBillingOrders(userId)

  const { data: order, error } = await supabase
    .from('billing_orders')
    .select('*')
    .eq('id', orderId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  if (!order) throw new Error('ORDER_NOT_FOUND')
  if (!['created', 'submitted'].includes(order.status)) throw new Error('ORDER_NOT_CANCELLABLE')

  const { data: updated, error: updateErr } = await supabase
    .from('billing_orders')
    .update({
      status: 'cancelled',
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId)
    .eq('user_id', userId)
    .select()
    .single()

  if (updateErr) throw updateErr

  await supabase
    .from('transactions')
    .update({
      status: 'rejected',
      review_note: 'Order cancelled by user',
      reviewed_at: new Date().toISOString(),
    })
    .eq('billing_order_id', orderId)

  return updated
}

export async function releaseBillingOrderTransaction(
  userId: string,
  orderId: string,
  txHash: string,
) {
  const { data: order, error } = await supabase
    .from('billing_orders')
    .select('*')
    .eq('id', orderId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  if (!order) return null

  if (order.tx_hash && order.tx_hash !== txHash) {
    return order
  }

  const { data: updatedOrder, error: updateErr } = await supabase
    .from('billing_orders')
    .update({
      status: 'created',
      tx_hash: null,
      token_symbol: null,
      submitted_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId)
    .eq('user_id', userId)
    .select()
    .single()

  if (updateErr) throw updateErr
  return updatedOrder
}

export function selectLatestBillingOrderTransaction<T extends BillingTransactionRow>(transactions: T[]): T | null {
  if (transactions.length === 0) return null

  return [...transactions].sort((a, b) => {
    const aTime = Date.parse(a.created_at || '')
    const bTime = Date.parse(b.created_at || '')

    if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) {
      return bTime - aTime
    }

    return String(b.id || '').localeCompare(String(a.id || ''))
  })[0] || null
}

export function hydrateBillingOrderSnapshot<T extends BillingOrderRow, U extends BillingTransactionRow>(
  order: T,
  transactions: U[],
): T {
  const latestTransaction = selectLatestBillingOrderTransaction(transactions)
  if (!latestTransaction) return order

  return {
    ...order,
    tx_hash: latestTransaction.tx_hash || order.tx_hash || null,
    token_symbol: latestTransaction.token_symbol || order.token_symbol || null,
    submitted_at: latestTransaction.created_at || order.submitted_at || null,
  }
}

async function upsertSubscriptionFromApprovedOrder(order: BillingOrderRow) {
  if (order.plan_id === 'topup') return null

  const { data: appliedByOrder, error: appliedErr } = await supabase
    .from('user_subscriptions')
    .select('*')
    .eq('source_order_id', order.id)
    .maybeSingle()

  if (appliedErr) throw appliedErr
  if (appliedByOrder) {
    return appliedByOrder
  }

  const plan = BILLING_PLANS[order.plan_id]
  const now = new Date()

  const { data: existing, error: existingErr } = await supabase
    .from('user_subscriptions')
    .select('*')
    .eq('user_id', order.user_id)
    .eq('plan_id', order.plan_id)
    .eq('status', 'active')
    .order('ends_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingErr) throw existingErr

  const baseStart = existing && new Date(existing.ends_at) > now ? new Date(existing.ends_at) : now
  const endsAt = addDays(baseStart, plan.durationDays || 30).toISOString()

  if (existing) {
    const { data: updated, error: updateErr } = await supabase
      .from('user_subscriptions')
      .update({
        ends_at: endsAt,
        unlimited: plan.unlimited,
        included_credits: plan.creditedCenticredits,
        source_order_id: order.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select()
      .single()

    if (updateErr) throw updateErr
    return updated
  }

  const { data: created, error: createErr } = await supabase
    .from('user_subscriptions')
    .insert({
      user_id: order.user_id,
      plan_id: order.plan_id,
      status: 'active',
      included_credits: plan.creditedCenticredits,
      unlimited: plan.unlimited,
      starts_at: now.toISOString(),
      ends_at: endsAt,
      source_order_id: order.id,
    })
    .select()
    .single()

  if (createErr) throw createErr
  return created
}

async function hasGrantedOrderCredits(order: BillingOrderRow): Promise<boolean> {
  if (order.expected_credits <= 0) return true

  const creditType = order.plan_id === 'topup' ? 'topup' : 'subscription_credit'
  const { data, error } = await supabase
    .from('credit_transactions')
    .select('id')
    .eq('user_id', order.user_id)
    .eq('type', creditType)
    .eq('reference_id', order.id)
    .eq('amount', order.expected_credits)
    .maybeSingle()

  if (error) throw error
  return Boolean(data)
}

export async function approveBillingOrder(orderId: string, reviewerUserId?: string | null, reviewNote?: string) {
  const atomic = await approveBillingOrderViaRpc(orderId, reviewerUserId, reviewNote)
  const result = atomic || await approveBillingOrderLegacy(orderId, reviewerUserId, reviewNote)
  await runApprovedBillingTracking(result.order)
  return result
}

async function runApprovedBillingTracking(order: BillingOrderRow): Promise<void> {
  if (!order.user_id || !order.id) return

  await markApprovedBillingOrder({
    orderId: order.id,
    userId: order.user_id,
    sessionId: order.attribution_session_id || null,
    approvedAt: order.approved_at || new Date().toISOString(),
    campaignCode: order.attribution_campaign_code || null,
    referralCode: order.attribution_referral_code || null,
    sourceType: order.attribution_source_type || null,
    sourcePlatform: order.attribution_source_platform || null,
    amountTokens: toNumeric(order.expected_amount_tokens),
    planId: order.plan_id,
  })
}

async function approveBillingOrderLegacy(orderId: string, reviewerUserId?: string | null, reviewNote?: string) {
  const { data: order, error } = await supabase
    .from('billing_orders')
    .select('*')
    .eq('id', orderId)
    .maybeSingle()

  if (error) throw error
  if (!order) throw new Error('ORDER_NOT_FOUND')
  if (order.status === 'approved') throw new Error('ORDER_ALREADY_APPROVED')
  if (order.status === 'rejected' || order.status === 'cancelled' || order.status === 'expired') {
    throw new Error('ORDER_NOT_APPROVABLE')
  }
  if (!order.tx_hash) throw new Error('ORDER_MISSING_TX')

  const typedOrder = order as BillingOrderRow

  const alreadyGranted = await hasGrantedOrderCredits(typedOrder)
  if (!alreadyGranted && typedOrder.expected_credits > 0) {
    await grantCredits(
      typedOrder.user_id,
      typedOrder.expected_credits,
      typedOrder.plan_id === 'topup' ? 'topup' : 'subscription_credit',
      typedOrder.id,
      typedOrder.plan_id === 'topup'
        ? `Top-up approved for order ${typedOrder.id}`
        : `Plan credits approved for order ${typedOrder.id}`
    )
  }

  const subscription = await upsertSubscriptionFromApprovedOrder(typedOrder)

  const { data: updatedOrder, error: updateErr } = await supabase
    .from('billing_orders')
    .update({
      status: 'approved',
      reviewed_by: reviewerUserId || null,
      review_note: reviewNote || null,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId)
    .select()
    .single()

  if (updateErr) throw updateErr

  await supabase
    .from('transactions')
    .update({
      status: 'approved',
      reviewed_by: reviewerUserId || null,
      review_note: reviewNote || null,
      reviewed_at: new Date().toISOString(),
    })
    .eq('billing_order_id', orderId)

  return { order: updatedOrder, subscription }
}

export async function rejectBillingOrder(orderId: string, reviewerUserId?: string | null, reviewNote?: string) {
  const atomic = await rejectBillingOrderViaRpc(orderId, reviewerUserId, reviewNote)
  if (atomic) return atomic

  return rejectBillingOrderLegacy(orderId, reviewerUserId, reviewNote)
}

async function rejectBillingOrderLegacy(orderId: string, reviewerUserId?: string | null, reviewNote?: string) {
  const { data: order, error } = await supabase
    .from('billing_orders')
    .select('*')
    .eq('id', orderId)
    .maybeSingle()

  if (error) throw error
  if (!order) throw new Error('ORDER_NOT_FOUND')
  if (order.status === 'approved') throw new Error('ORDER_ALREADY_APPROVED')
  if (order.status === 'rejected') throw new Error('ORDER_ALREADY_REJECTED')
  if (order.status === 'cancelled' || order.status === 'expired') throw new Error('ORDER_NOT_REJECTABLE')

  const { data: updatedOrder, error: updateErr } = await supabase
    .from('billing_orders')
    .update({
      status: 'rejected',
      reviewed_by: reviewerUserId || null,
      review_note: reviewNote || null,
      rejected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId)
    .select()
    .single()

  if (updateErr) throw updateErr

  await supabase
    .from('transactions')
    .update({
      status: 'rejected',
      reviewed_by: reviewerUserId || null,
      review_note: reviewNote || null,
      reviewed_at: new Date().toISOString(),
    })
    .eq('billing_order_id', orderId)

  return updatedOrder
}

async function approveBillingOrderViaRpc(
  orderId: string,
  reviewerUserId?: string | null,
  reviewNote?: string,
): Promise<AtomicBillingReviewResult | null> {
  const { data, error } = await supabase.rpc('approve_billing_order_atomic', {
    p_order_id: orderId,
    p_reviewer_user_id: reviewerUserId || null,
    p_review_note: reviewNote || null,
  })

  if (error) {
    if (isMissingBillingReviewRpc(error, 'approve_billing_order_atomic')) {
      return null
    }
    throw mapBillingReviewRpcError(error)
  }

  return data as AtomicBillingReviewResult
}

async function rejectBillingOrderViaRpc(
  orderId: string,
  reviewerUserId?: string | null,
  reviewNote?: string,
): Promise<BillingOrderRow | null> {
  const { data, error } = await supabase.rpc('reject_billing_order_atomic', {
    p_order_id: orderId,
    p_reviewer_user_id: reviewerUserId || null,
    p_review_note: reviewNote || null,
  })

  if (error) {
    if (isMissingBillingReviewRpc(error, 'reject_billing_order_atomic')) {
      return null
    }
    throw mapBillingReviewRpcError(error)
  }

  const payload = data as { order?: BillingOrderRow } | null
  return payload?.order || null
}

function isMissingBillingReviewRpc(
  error: { code?: string; message?: string; details?: string | null; hint?: string | null },
  functionName: string,
): boolean {
  const message = [error.message, error.details, error.hint].filter(Boolean).join(' ')
  return new RegExp(functionName, 'i').test(message) && /find the function|does not exist|schema cache|not found/i.test(message)
}

function mapBillingReviewRpcError(
  error: { message?: string; details?: string | null; hint?: string | null }
): Error {
  const message = [error.message, error.details, error.hint].filter(Boolean).join(' ')

  if (/ORDER_NOT_FOUND/i.test(message)) return new Error('ORDER_NOT_FOUND')
  if (/ORDER_ALREADY_APPROVED/i.test(message)) return new Error('ORDER_ALREADY_APPROVED')
  if (/ORDER_NOT_APPROVABLE/i.test(message)) return new Error('ORDER_NOT_APPROVABLE')
  if (/ORDER_MISSING_TX/i.test(message)) return new Error('ORDER_MISSING_TX')
  if (/ORDER_ALREADY_REJECTED/i.test(message)) return new Error('ORDER_ALREADY_REJECTED')
  if (/ORDER_NOT_REJECTABLE/i.test(message)) return new Error('ORDER_NOT_REJECTABLE')

  return new Error(message || 'Billing review RPC failed')
}

export async function attachTransactionToBillingOrder(params: {
  userId: string
  billingOrderId: string
  txHash: string
  tokenSymbol?: string | null
}) {
  const { userId, billingOrderId, txHash, tokenSymbol } = params

  const { data: order, error } = await supabase
    .from('billing_orders')
    .select('*')
    .eq('id', billingOrderId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  if (!order) throw new Error('ORDER_NOT_FOUND')
  if (!['created', 'submitted'].includes(order.status)) throw new Error('ORDER_NOT_ATTACHABLE')
  if (order.tx_hash && order.tx_hash !== txHash) throw new Error('ORDER_ALREADY_HAS_TRANSACTION')
  if (order.tx_hash === txHash) return order

  const { data: updatedOrder, error: updateErr } = await supabase
    .from('billing_orders')
    .update({
      status: 'submitted',
      tx_hash: txHash,
      token_symbol: tokenSymbol || null,
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', billingOrderId)
    .select()
    .single()

  if (updateErr) throw updateErr
  return updatedOrder
}

export async function expireFinishedSubscriptions() {
  const nowIso = new Date().toISOString()

  await supabase
    .from('user_subscriptions')
    .update({
      status: 'expired',
      updated_at: nowIso,
    })
    .eq('status', 'active')
    .lt('ends_at', nowIso)
}

export async function expireStaleBillingOrders(userId?: string) {
  const nowIso = new Date().toISOString()

  let query = supabase
    .from('billing_orders')
    .update({
      status: 'expired',
      updated_at: nowIso,
    })
    .in('status', ['created', 'submitted'])
    .lt('expires_at', nowIso)

  if (userId) {
    query = query.eq('user_id', userId)
  }

  await query
}

export function startBillingMaintenanceJob() {
  const runMaintenance = async () => {
    await Promise.all([
      expireFinishedSubscriptions(),
      expireStaleBillingOrders(),
    ])
  }

  void runMaintenance().catch((err) => {
    console.error('[Billing] Initial maintenance failed:', err)
  })

  setInterval(() => {
    void runMaintenance().catch((err) => {
      console.error('[Billing] Periodic maintenance failed:', err)
    })
  }, 10 * 60 * 1000)

  console.log('[Billing] Maintenance job scheduled: every 10 minutes')
}

export type { BillingOrderRow, UserSubscriptionRow }
