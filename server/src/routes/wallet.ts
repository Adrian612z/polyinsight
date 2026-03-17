import { Router, Request, Response } from 'express'
import { authMiddleware } from '../middleware/auth.js'
import { createWalletFromSeed, getWalletBySeed } from '../services/wallet.js'

const router = Router()
const walletLookupKey = (userId: string) => `user:${userId}`

// POST /api/wallet/create - Create or fetch the authenticated user's wallet
router.post('/create', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!
    const currentWallet = await getWalletBySeed(walletLookupKey(userId))
    if (currentWallet) {
      res.json({ address: currentWallet.address })
      return
    }

    const wallet = await createWalletFromSeed(walletLookupKey(userId))
    res.json({
      address: wallet.address,
    })
  } catch (err) {
    console.error('Create wallet error:', err)
    res.status(500).json({ error: 'Failed to create wallet' })
  }
})

// GET /api/wallet/address - Query the authenticated user's wallet address
router.get('/address', authMiddleware, async (_req: Request, res: Response) => {
  try {
    const wallet = await createWalletFromSeed(walletLookupKey(_req.userId!))
    res.json({ address: wallet.address })
  } catch (err) {
    console.error('Get wallet error:', err)
    res.status(500).json({ error: 'Failed to query wallet' })
  }
})

export default router
