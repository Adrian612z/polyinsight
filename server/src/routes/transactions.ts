import { Router, Request, Response } from 'express'
import { authMiddleware } from '../middleware/auth.js'
import { adminMiddleware } from '../middleware/admin.js'
import { supabase } from '../services/supabase.js'
import { verifyAndUpdateTransaction } from '../services/transaction.js'

const router = Router()
const TX_HASH_REGEX = /^0x[a-fA-F0-9]{64}$/

// POST /api/transactions - Save a transaction hash and verify on-chain
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { tx_hash, from_address, to_address, chain_name, token_symbol, amount } = req.body

    if (!tx_hash || typeof tx_hash !== 'string' || !TX_HASH_REGEX.test(tx_hash)) {
      res.status(400).json({ error: 'A valid EVM tx_hash is required' })
      return
    }

    if (!chain_name || typeof chain_name !== 'string') {
      res.status(400).json({ error: 'chain_name is required for transaction verification' })
      return
    }

    console.log(`[Transactions] POST received: tx_hash=${tx_hash} chain=${chain_name} token=${token_symbol} amount=${amount} user=${req.userId}`)

    // Insert with pending status and user_id
    const { data, error } = await supabase
      .from('transactions')
      .insert({
        tx_hash,
        from_address: from_address || null,
        to_address: to_address || null,
        chain_name,
        token_symbol: token_symbol || null,
        amount: amount || null,
        status: 'pending',
        user_id: req.userId || null,
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        res.status(409).json({ error: 'Transaction already recorded' })
        return
      }
      throw error
    }

    console.log(`[Transactions] Saved to DB, id=${data.id}, starting background verification`)

    // Verify transaction on-chain in the background; grant credits on success
    verifyAndUpdateTransaction(tx_hash, chain_name, req.userId, amount).catch(err => {
      console.error(`[Transactions] Background tx verification failed for ${tx_hash}:`, err)
    })

    res.json({ transaction: data })
  } catch (err) {
    console.error('Save transaction error:', err)
    res.status(500).json({ error: 'Failed to save transaction' })
  }
})

// GET /api/transactions - List transactions
router.get('/', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100)
    const page = Math.max(parseInt(req.query.page as string) || 1, 1)
    const offset = (page - 1) * limit

    const { data, error, count } = await supabase
      .from('transactions')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) throw error

    res.json({ transactions: data, total: count, page, pages: Math.ceil((count || 0) / limit) })
  } catch (err) {
    console.error('List transactions error:', err)
    res.status(500).json({ error: 'Failed to fetch transactions' })
  }
})

export default router
