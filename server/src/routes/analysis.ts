import { Router, Request, Response } from 'express'
import { supabase } from '../services/supabase.js'
import { authMiddleware } from '../middleware/auth.js'
import { deductCredits } from '../services/credit.js'
import { config } from '../config.js'

const router = Router()

// POST /api/analysis - Create analysis with credit deduction
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!
    const { url } = req.body

    if (!url) {
      res.status(400).json({ error: 'Please provide a Polymarket URL' })
      return
    }

    // 1. Create analysis record
    const { data: record, error: dbError } = await supabase
      .from('analysis_records')
      .insert({
        event_url: url,
        status: 'pending',
        user_id: userId,
        credits_charged: config.analysisCost,
      })
      .select()
      .single()

    if (dbError) throw dbError

    // 2. Deduct credits (includes referral commission)
    let newBalance: number
    try {
      newBalance = await deductCredits(
        userId,
        config.analysisCost,
        'analysis_spend',
        record.id,
        `Analysis: ${url.slice(0, 60)}...`
      )
    } catch (err: unknown) {
      // Rollback: delete the record
      await supabase.from('analysis_records').delete().eq('id', record.id)
      if (err instanceof Error && err.message === 'INSUFFICIENT_CREDITS') {
        res.status(402).json({ error: 'Insufficient credits', code: 'INSUFFICIENT_CREDITS' })
        return
      }
      throw err
    }

    // 3. Trigger n8n webhook (fire-and-forget)
    fetch(config.n8nWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        user_id: userId,
        record_id: record.id,
      }),
    }).catch((err) => {
      console.error('n8n webhook error:', err)
    })

    res.json({
      record_id: record.id,
      remaining_balance: newBalance,
    })
  } catch (err) {
    console.error('Analysis error:', err)
    res.status(500).json({ error: 'Failed to create analysis' })
  }
})

export default router
