import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { config } from './config.js'
import usersRouter from './routes/users.js'
import analysisRouter from './routes/analysis.js'
import creditsRouter from './routes/credits.js'
import referralsRouter from './routes/referrals.js'
import featuredRouter from './routes/featured.js'
import trendingRouter from './routes/trending.js'
import adminRouter from './routes/admin.js'
import walletRouter from './routes/wallet.js'
import chainsRouter from './routes/chains.js'
import transactionsRouter from './routes/transactions.js'
import marketsRouter from './routes/markets.js'
import { startStaleAnalysisJob } from './jobs/staleAnalysis.js'
import { startTrendingCache } from './services/polymarket.js'
import { startMarketsCache } from './services/markets.js'

const app = express()

// Trust the reverse proxy (for correct client IPs behind Nginx/Cloudflare)
app.set('trust proxy', 1)

// Security headers
app.use(helmet())

// CORS — only allow configured origins
app.use(cors({
  origin: config.allowedOrigins,
  credentials: true,
}))

// Body parser with size limit
app.use(express.json({ limit: '100kb' }))

// Global rate limit: 100 requests per minute per IP
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
})
app.use(globalLimiter)

// Strict rate limit for auth endpoints: 10 attempts per 15 minutes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later' },
})
app.use('/api/admin/login', authLimiter)
app.use('/api/users/register', authLimiter)

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() })
})

// Routes
app.use('/api/users', usersRouter)
app.use('/api/analysis', analysisRouter)
app.use('/api/credits', creditsRouter)
app.use('/api/referral', referralsRouter)
app.use('/api/featured', featuredRouter)
app.use('/api/trending', trendingRouter)
app.use('/api/admin', adminRouter)
app.use('/api/wallet', walletRouter)
app.use('/api/chains', chainsRouter)
app.use('/api/transactions', transactionsRouter)
app.use('/api/markets', marketsRouter)

app.listen(config.port, () => {
  console.log(`PolyInsight API server running on port ${config.port}`)
  startStaleAnalysisJob()
  startTrendingCache()
  startMarketsCache()
})
