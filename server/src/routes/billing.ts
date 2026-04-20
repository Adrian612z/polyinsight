import { Router, Request, Response } from 'express'
import { authMiddleware } from '../middleware/auth.js'
import {
  BillingPlanId,
  cancelBillingOrder,
  createBillingOrder,
  getBillingOrderForUser,
  getBillingOverview,
  listBillingPlans,
} from '../services/billing.js'
import { verifyAndProcessTransaction } from '../services/transaction.js'
import { getAttributionSnapshotBySessionId, recordGrowthEvent } from '../services/tracking.js'

const router = Router()

// GET /api/billing/plans - Public billing plan definitions
router.get('/plans', (_req: Request, res: Response) => {
  res.json({ plans: listBillingPlans() })
})

// GET /api/billing/me - Current user's billing overview
router.get('/me', authMiddleware, async (req: Request, res: Response) => {
  try {
    const overview = await getBillingOverview(req.userId!)
    res.json(overview)
  } catch (err) {
    console.error('Billing overview error:', err)
    res.status(500).json({ error: 'Failed to fetch billing overview' })
  }
})

// GET /api/billing/orders/:id - Current user's billing order detail
router.get('/orders/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await getBillingOrderForUser(req.userId!, req.params.id)
    res.json(result)
  } catch (err) {
    if (err instanceof Error && err.message === 'ORDER_NOT_FOUND') {
      res.status(404).json({ error: 'Billing order not found' })
      return
    }

    console.error('Billing order detail error:', err)
    res.status(500).json({ error: 'Failed to fetch billing order' })
  }
})

// POST /api/billing/orders - Create a billing order before payment submission
router.post('/orders', authMiddleware, async (req: Request, res: Response) => {
  try {
    const planId = req.body?.planId as BillingPlanId | undefined
    const amount = req.body?.amount as number | undefined
    const trackingSessionId =
      typeof req.body?.trackingSessionId === 'string' ? req.body.trackingSessionId : null

    if (!planId || !['topup', 'monthly', 'unlimited'].includes(planId)) {
      res.status(400).json({ error: 'A valid billing plan is required' })
      return
    }

    const trackingSnapshot = await getAttributionSnapshotBySessionId(trackingSessionId)
    const order = await createBillingOrder(req.userId!, planId, amount, {
      sessionId: trackingSnapshot?.sessionId || null,
      campaignCode: trackingSnapshot?.campaignCode || null,
      referralCode: trackingSnapshot?.referralCode || null,
      sourceType: trackingSnapshot?.sourceType || null,
      sourcePlatform: trackingSnapshot?.sourcePlatform || null,
    })

    if (trackingSnapshot) {
      await recordGrowthEvent({
        eventName: 'billing_order_created',
        sessionId: trackingSnapshot.sessionId,
        visitorId: trackingSnapshot.visitorId,
        userId: req.userId!,
        pagePath: '/billing',
        metadata: {
          orderId: order.id,
          planId,
          amount: amount ?? null,
        },
      })
    }

    res.json({ order })
  } catch (err) {
    if (err instanceof Error && err.message === 'INVALID_TOPUP_AMOUNT') {
      res.status(400).json({ error: 'Top-up amount must be at least 0.01 token' })
      return
    }
    if (err instanceof Error && err.message === 'PLAN_NOT_COMPATIBLE_WITH_ACTIVE_SUBSCRIPTION') {
      res.status(409).json({ error: 'Your unlimited subscription is still active, so this monthly plan is unnecessary right now' })
      return
    }

    console.error('Create billing order error:', err)
    res.status(500).json({ error: 'Failed to create billing order' })
  }
})

// POST /api/billing/orders/:id/recheck - Re-run transaction verification for a submitted order
router.post('/orders/:id/recheck', authMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await getBillingOrderForUser(req.userId!, req.params.id)
    const txHash = result.order.tx_hash

    if (!txHash) {
      res.status(409).json({ error: 'Billing order has no submitted transaction yet' })
      return
    }

    await verifyAndProcessTransaction(txHash)
    const refreshed = await getBillingOrderForUser(req.userId!, req.params.id)
    res.json(refreshed)
  } catch (err) {
    if (err instanceof Error && err.message === 'ORDER_NOT_FOUND') {
      res.status(404).json({ error: 'Billing order not found' })
      return
    }

    console.error('Billing order recheck error:', err)
    res.status(500).json({ error: 'Failed to recheck billing order' })
  }
})

// POST /api/billing/orders/:id/cancel - Cancel a pending billing order
router.post('/orders/:id/cancel', authMiddleware, async (req: Request, res: Response) => {
  try {
    const order = await cancelBillingOrder(req.userId!, req.params.id)
    res.json({ order })
  } catch (err) {
    if (err instanceof Error && err.message === 'ORDER_NOT_FOUND') {
      res.status(404).json({ error: 'Billing order not found' })
      return
    }
    if (err instanceof Error && err.message === 'ORDER_NOT_CANCELLABLE') {
      res.status(409).json({ error: 'Billing order can no longer be cancelled' })
      return
    }

    console.error('Cancel billing order error:', err)
    res.status(500).json({ error: 'Failed to cancel billing order' })
  }
})

export default router
