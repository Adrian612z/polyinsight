import { Router, Request, Response } from 'express'
import { createWalletFromSeed, getWalletBySeed } from '../services/wallet.js'

const router = Router()

// POST /api/wallet/create - Create a wallet from seed
router.post('/create', async (req: Request, res: Response) => {
  try {
    const { seed } = req.body

    if (!seed || typeof seed !== 'string') {
      res.status(400).json({ error: 'seed is required and must be a string' })
      return
    }

    const wallet = await createWalletFromSeed(seed)
    res.json({
      seed: wallet.seed,
      address: wallet.address,
    })
  } catch (err) {
    console.error('Create wallet error:', err)
    res.status(500).json({ error: 'Failed to create wallet' })
  }
})

// GET /api/wallet/address?seed=xxx - Query wallet address by seed
router.get('/address', async (req: Request, res: Response) => {
  try {
    const seed = req.query.seed as string

    if (!seed) {
      res.status(400).json({ error: 'seed query parameter is required' })
      return
    }

    const wallet = await getWalletBySeed(seed)
    if (!wallet) {
      res.status(404).json({ error: 'Wallet not found for this seed' })
      return
    }

    res.json({ address: wallet.address })
  } catch (err) {
    console.error('Get wallet error:', err)
    res.status(500).json({ error: 'Failed to query wallet' })
  }
})

export default router
