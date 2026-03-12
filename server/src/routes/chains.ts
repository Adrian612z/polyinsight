import { Router, Request, Response } from 'express'
import { supabase } from '../services/supabase.js'

const router = Router()

// GET /api/chains - Get all chain configs (RPC + token addresses)
router.get('/', async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('chain_configs')
      .select('*')
      .order('chain_name')

    if (error) throw error

    res.json({ chains: data })
  } catch (err) {
    console.error('Get chains error:', err)
    res.status(500).json({ error: 'Failed to fetch chain configs' })
  }
})

// GET /api/chains/:chainName - Get a specific chain config
router.get('/:chainName', async (req: Request, res: Response) => {
  try {
    const { chainName } = req.params

    const { data, error } = await supabase
      .from('chain_configs')
      .select('*')
      .eq('chain_name', chainName)
      .single()

    if (error || !data) {
      res.status(404).json({ error: 'Chain not found' })
      return
    }

    res.json({ chain: data })
  } catch (err) {
    console.error('Get chain error:', err)
    res.status(500).json({ error: 'Failed to fetch chain config' })
  }
})

export default router
