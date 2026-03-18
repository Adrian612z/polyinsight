import { config } from './config.js'
import { startAnalysisWorker } from './services/analysisWorker.js'

console.log(
  `[AnalysisWorkerProcess] Starting standalone worker with concurrency=${config.analysisWorkerConcurrency}, heartbeat=${config.analysisWorkerHeartbeatMs}ms`
)

startAnalysisWorker()
