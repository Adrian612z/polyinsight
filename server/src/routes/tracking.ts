import { Router, Request, Response } from 'express'
import { recordGrowthEvent, upsertVisitSession } from '../services/tracking.js'

const router = Router()

router.post('/session', async (req: Request, res: Response) => {
  try {
    const session = await upsertVisitSession({
      sessionId: req.body?.sessionId,
      visitorId: req.body?.visitorId,
      campaignCode: req.body?.campaignCode,
      referralCode: req.body?.referralCode,
      sourceType: req.body?.sourceType,
      sourcePlatform: req.body?.sourcePlatform,
      utmSource: req.body?.utmSource,
      utmMedium: req.body?.utmMedium,
      utmCampaign: req.body?.utmCampaign,
      utmContent: req.body?.utmContent,
      referrerUrl: req.body?.referrerUrl,
      landingPath: req.body?.landingPath,
      landingQuery: req.body?.landingQuery,
      locale: req.body?.locale,
      userAgent: req.get('user-agent') || req.body?.userAgent,
    })

    res.json({
      sessionId: session.id,
      visitorId: session.visitor_id,
      sourceType: session.source_type,
      sourcePlatform: session.source_platform,
      campaignCode: session.campaign_code,
      referralCode: session.referral_code,
    })
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('TRACKING_')) {
      res.status(400).json({ error: 'Invalid tracking payload' })
      return
    }

    console.error('Tracking session error:', err)
    res.status(500).json({ error: 'Failed to record visit session' })
  }
})

router.post('/event', async (req: Request, res: Response) => {
  try {
    await recordGrowthEvent({
      eventName: req.body?.eventName,
      sessionId: req.body?.sessionId,
      visitorId: req.body?.visitorId,
      userId: req.body?.userId,
      pagePath: req.body?.pagePath,
      campaignCode: req.body?.campaignCode,
      referralCode: req.body?.referralCode,
      sourceType: req.body?.sourceType,
      sourcePlatform: req.body?.sourcePlatform,
      metadata: req.body?.metadata,
    })

    res.json({ ok: true })
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('TRACKING_')) {
      res.status(400).json({ error: 'Invalid tracking event payload' })
      return
    }

    console.error('Tracking event error:', err)
    res.status(500).json({ error: 'Failed to record tracking event' })
  }
})

export default router
