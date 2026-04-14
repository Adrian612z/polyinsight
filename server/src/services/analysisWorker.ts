import { config } from '../config.js'
import { formatAnalysisProviderSummary } from '../analysis-runtime/provider.js'
import {
  claimQueuedAnalysisJobs,
  createAnalysisWorkerId,
  failAnalysisRecordAndRefund,
  heartbeatAnalysisJob,
  markAnalysisJobCompleted,
  markAnalysisJobFailed,
  requeueAnalysisJob,
  requeueStaleRunningJobs,
  type AnalysisJobRecord,
} from './analysisJobs.js'
import { runCodeAnalysisPipeline } from '../analysis-runtime/codeWorkflow.js'
import { runN8nAnalysisPipeline } from './n8nAnalysis.js'

const workerId = createAnalysisWorkerId()
const activeJobs = new Set<string>()
let tickInFlight = false

export function startAnalysisWorker() {
  if (!config.analysisWorkerEnabled) {
    console.log('[AnalysisWorker] Disabled by config')
    return
  }

  if (config.analysisEngine === 'code') {
    console.log(
      `[AnalysisProvider] ${formatAnalysisProviderSummary({
        engine: config.analysisEngine,
        baseUrl: config.analysisCodeBaseUrl,
        apiKey: config.analysisCodeApiKey,
        models: {
          extract: config.analysisCodeExtractModel,
          analysis: config.analysisCodeAnalysisModel,
          audit: config.analysisCodeAuditModel,
          report: config.analysisCodeReportModel,
        },
      })}`
    )
  }

  void tick()
  setInterval(() => {
    void tick()
  }, config.analysisWorkerPollMs)

  setInterval(() => {
    void requeueStaleRunningJobs()
      .then((count) => {
        if (count > 0) {
          console.log(`[AnalysisWorker] Re-queued or failed ${count} stale jobs`)
        }
      })
      .catch((err) => {
        console.error('[AnalysisWorker] Failed to requeue stale jobs:', err)
      })
  }, 60_000)

  console.log(
    `[AnalysisWorker] Started with engine=${config.analysisEngine}, concurrency=${config.analysisWorkerConcurrency}, modelRequests=${config.analysisCodeRequestConcurrency}, poll=${config.analysisWorkerPollMs}ms, maxRuntime=${config.analysisJobMaxRuntimeMs}ms`
  )
}

async function tick() {
  if (tickInFlight) return
  tickInFlight = true

  try {
    const available = Math.max(config.analysisWorkerConcurrency - activeJobs.size, 0)
    if (available === 0) return

    const jobs = await claimQueuedAnalysisJobs(workerId, available)
    for (const job of jobs) {
      activeJobs.add(job.id)
      void runJob(job).finally(() => activeJobs.delete(job.id))
    }
  } catch (err) {
    console.error('[AnalysisWorker] Tick failed:', err)
  } finally {
    tickInFlight = false
  }
}

async function runJob(job: AnalysisJobRecord) {
  const lease = startJobLease(job.id)

  try {
    if (job.engine === 'code') {
      await runCodeAnalysisPipeline(job, {
        signal: lease.signal,
        assertActive: lease.assertActive,
      })
    } else {
      await runN8nAnalysisPipeline(job)
    }

    const completed = await markAnalysisJobCompleted(job.id, workerId)
    if (!completed) {
      console.warn(`[AnalysisWorker] Job ${job.id} finished after losing ownership; skipped completion update`)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)

    if (lease.lostOwnership) {
      console.warn(`[AnalysisWorker] Job ${job.id} stopped: ${message}`)
      return
    }

    if (lease.timedOut) {
      console.error(`[AnalysisWorker] Job ${job.id} timed out:`, message)
    } else {
      console.error(`[AnalysisWorker] Job ${job.id} failed:`, message)
    }

    if (job.attempts < job.max_attempts) {
      const requeued = await requeueAnalysisJob(job.id, message, workerId)
      if (!requeued) {
        console.warn(`[AnalysisWorker] Job ${job.id} lost ownership before requeue`)
      }
      return
    }

    const failed = await markAnalysisJobFailed(job.id, message, workerId)
    if (!failed) {
      console.warn(`[AnalysisWorker] Job ${job.id} lost ownership before failure handling`)
      return
    }

    await failAnalysisRecordAndRefund(job, message)
  } finally {
    lease.stop()
  }
}

function startJobLease(jobId: string) {
  const abortController = new AbortController()
  let lostOwnership = false
  let timedOut = false

  const heartbeatTimer = setInterval(() => {
    void heartbeatAnalysisJob(jobId, workerId)
      .then((alive) => {
        if (alive || lostOwnership || timedOut) return
        lostOwnership = true
        abortController.abort(new Error('Analysis job no longer active'))
      })
      .catch((err) => {
        console.error(`[AnalysisWorker] Heartbeat failed for ${jobId}:`, err)
      })
  }, config.analysisWorkerHeartbeatMs)

  heartbeatTimer.unref?.()

  const runtimeTimer = setTimeout(() => {
    if (lostOwnership || timedOut || abortController.signal.aborted) return
    timedOut = true
    abortController.abort(new Error(`Analysis job exceeded max runtime (${config.analysisJobMaxRuntimeMs}ms)`))
  }, config.analysisJobMaxRuntimeMs)

  runtimeTimer.unref?.()

  return {
    signal: abortController.signal,
    get lost() {
      return lostOwnership || timedOut || abortController.signal.aborted
    },
    get lostOwnership() {
      return lostOwnership
    },
    get timedOut() {
      return timedOut
    },
    assertActive() {
      if (lostOwnership || timedOut || abortController.signal.aborted) {
        throw abortController.signal.reason instanceof Error
          ? abortController.signal.reason
          : new Error('Analysis job no longer active')
      }
    },
    stop() {
      clearInterval(heartbeatTimer)
      clearTimeout(runtimeTimer)
    },
  }
}
