import { Request, Response, NextFunction } from 'express'
import { PrivyClient } from '@privy-io/server-auth'
import { config } from '../config.js'

const privy = new PrivyClient(config.privyAppId, config.privyAppSecret)

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      userId?: string
    }
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) {
    res.status(401).json({ error: 'Unauthorized, please log in' })
    return
  }

  try {
    const claims = await privy.verifyAuthToken(token)
    req.userId = claims.userId
    next()
  } catch {
    res.status(401).json({ error: 'Session expired, please log in again' })
  }
}
