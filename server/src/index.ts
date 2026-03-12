import express from 'express'
import cors from 'cors'
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
import { startStaleAnalysisJob } from './jobs/staleAnalysis.js'

const app = express()

app.use(cors())
app.use(express.json())

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

app.listen(config.port, () => {
  console.log(`PolyInsight API server running on port ${config.port}`)
  startStaleAnalysisJob()
})
