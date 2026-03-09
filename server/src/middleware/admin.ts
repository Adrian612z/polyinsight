import { Request, Response, NextFunction } from 'express'
import { supabase } from '../services/supabase.js'

export async function adminMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!req.userId) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const { data: user } = await supabase
    .from('users')
    .select('role')
    .eq('id', req.userId)
    .single()

  if (user?.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' })
    return
  }

  next()
}
