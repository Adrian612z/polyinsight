import { grantCredits } from './credit.js'
import { supabase } from './supabase.js'

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
    expectedAmountTokens: 39.9,
    minimumAmountTokens: 39.9,
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
  tx_hash?: string | null
  token_symbol?: string | null
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

function roundTokenAmount(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000
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

export async function createBillingOrder(userId: string, planId: BillingPlanId, rawAmount?: number) {
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
    return reusableOrder
  }

  const { data, error } = await supabase
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

  if (error) throw error
  return data
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

  return {
    order,
    transactions: transactions || [],
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

  if (order.tx_hash) {
    await supabase
      .from('transactions')
      .update({
        status: 'rejected',
        review_note: 'Order cancelled by user',
        reviewed_at: new Date().toISOString(),
      })
      .eq('tx_hash', order.tx_hash)
  }

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

  if (order.tx_hash !== txHash) {
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

async function upsertSubscriptionFromApprovedOrder(order: BillingOrderRow) {
  if (order.plan_id === 'topup') return null

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

export async function approveBillingOrder(orderId: string, reviewerUserId?: string | null, reviewNote?: string) {
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

  if (typedOrder.expected_credits > 0) {
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
  const { data: order, error } = await supabase
    .from('billing_orders')
    .select('*')
    .eq('id', orderId)
    .maybeSingle()

  if (error) throw error
  if (!order) throw new Error('ORDER_NOT_FOUND')
  if (order.status === 'approved') throw new Error('ORDER_ALREADY_APPROVED')
  if (order.status === 'rejected') throw new Error('ORDER_ALREADY_REJECTED')

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
