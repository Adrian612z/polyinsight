import { Router, Request, Response } from 'express'
import { authMiddleware } from '../middleware/auth.js'
import { supabase } from '../services/supabase.js'
import { attachTransactionToBillingOrder, releaseBillingOrderTransaction } from '../services/billing.js'
import { verifyAndProcessTransaction } from '../services/transaction.js'

const router = Router()
const TX_HASH_REGEX = /^0x[a-fA-F0-9]{64}$/

// POST /api/transactions - Save a transaction hash
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { tx_hash, from_address, to_address, chain_name, token_symbol, amount, billing_order_id } = req.body

    if (!tx_hash || typeof tx_hash !== 'string' || !TX_HASH_REGEX.test(tx_hash)) {
      res.status(400).json({ error: 'A valid EVM tx_hash is required' })
      return
    }

    if (!chain_name || typeof chain_name !== 'string') {
      res.status(400).json({ error: 'chain_name is required for transaction verification' })
      return
    }

    const { data: existingTx, error: existingErr } = await supabase
      .from('transactions')
      .select('id')
      .eq('tx_hash', tx_hash)
      .maybeSingle()

    if (existingErr) throw existingErr
    if (existingTx) {
      res.status(409).json({ error: 'Transaction already recorded' })
      return
    }

    let attachedOrder: unknown = null

    if (billing_order_id) {
      try {
        attachedOrder = await attachTransactionToBillingOrder({
          userId: req.userId!,
          billingOrderId: billing_order_id,
          txHash: tx_hash,
          tokenSymbol: token_symbol || null,
        })
      } catch (err) {
        if (err instanceof Error && err.message === 'ORDER_NOT_FOUND') {
          res.status(404).json({ error: 'Billing order not found' })
          return
        }
        if (err instanceof Error && err.message === 'ORDER_NOT_ATTACHABLE') {
          res.status(409).json({ error: 'Billing order can no longer accept transactions' })
          return
        }
        if (err instanceof Error && err.message === 'ORDER_ALREADY_HAS_TRANSACTION') {
          res.status(409).json({ error: 'Billing order is already linked to a different transaction' })
          return
        }
        throw err
      }
    }

    let data: unknown = null

    try {
      const insertResult = await supabase
        .from('transactions')
        .insert({
          user_id: req.userId!,
          tx_hash,
          from_address: from_address || null,
          to_address: to_address || null,
          chain_name,
          token_symbol: token_symbol || null,
          amount: amount || null,
          billing_order_id: billing_order_id || null,
          plan_id: attachedOrder && typeof attachedOrder === 'object' && attachedOrder !== null && 'plan_id' in attachedOrder
            ? (attachedOrder as { plan_id: string }).plan_id
            : null,
          status: 'pending_review',
        })
        .select()
        .single()

      data = insertResult.data

      if (insertResult.error) {
        if (insertResult.error.code === '23505') {
          res.status(409).json({ error: 'Transaction already recorded' })
          return
        }
        throw insertResult.error
      }
    } catch (insertErr) {
      if (billing_order_id) {
        try {
          await releaseBillingOrderTransaction(req.userId!, billing_order_id, tx_hash)
        } catch (releaseErr) {
          console.error('Failed to release billing order after transaction insert error:', releaseErr)
        }
      }
      throw insertErr
    }

    void verifyAndProcessTransaction(tx_hash).catch((verifyErr) => {
      console.error('Automatic transaction verification error:', verifyErr)
    })

    res.json({ transaction: data, billingOrder: attachedOrder })
  } catch (err) {
    console.error('Save transaction error:', err)
    res.status(500).json({ error: 'Failed to save transaction' })
  }
})

// POST /api/transactions/:txHash/recheck - Retry verification for user's transaction
router.post('/:txHash/recheck', authMiddleware, async (req: Request, res: Response) => {
  try {
    const txHash = req.params.txHash
    if (!TX_HASH_REGEX.test(txHash)) {
      res.status(400).json({ error: 'A valid EVM tx_hash is required' })
      return
    }

    const { data: tx, error } = await supabase
      .from('transactions')
      .select('tx_hash, user_id')
      .eq('tx_hash', txHash)
      .eq('user_id', req.userId!)
      .maybeSingle()

    if (error) throw error
    if (!tx) {
      res.status(404).json({ error: 'Transaction not found' })
      return
    }

    await verifyAndProcessTransaction(txHash)

    const { data: refreshed, error: refreshErr } = await supabase
      .from('transactions')
      .select('*')
      .eq('tx_hash', txHash)
      .maybeSingle()

    if (refreshErr) throw refreshErr

    res.json({ transaction: refreshed })
  } catch (err) {
    console.error('Recheck transaction error:', err)
    res.status(500).json({ error: 'Failed to recheck transaction' })
  }
})

export default router
