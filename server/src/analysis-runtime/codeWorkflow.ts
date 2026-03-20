import { config } from '../config.js'
import {
  markAnalysisRecordCompleted,
  updateAnalysisPartialResult,
  type AnalysisJobRecord,
} from '../services/analysisJobs.js'
import {
  buildWorkflowContext,
  type PolymarketEvent,
  type WorkflowContext,
} from './parity.js'
import {
  buildStep2Prompt,
  buildStep3Prompt,
  buildStep4Prompt,
  buildStep5Prompt,
  getStep2SystemPrompt,
  getStep3SystemPrompt,
  getStep4SystemPrompt,
  getStep5SystemPrompt,
  type AnalysisPath,
} from './workflowPrompts.js'

export type RuntimeLang = 'en' | 'zh'

interface RuntimeHooks {
  onProgress?: (partialResult: string) => Promise<void>
  signal?: AbortSignal
  assertActive?: () => void
}

type RuntimeStep = [string, string]

interface ModelRequestOptions {
  model: string
  maxRetries: number
  retryDelayMs: number
  useWebSearch: boolean
  maxOutputTokens?: number
}

interface SemaphoreWaiter {
  resolve: () => void
  reject: (error: Error) => void
  signal?: AbortSignal
  onAbort?: () => void
}

class AsyncSemaphore {
  private readonly max: number
  private active = 0
  private readonly queue: SemaphoreWaiter[] = []

  constructor(max: number) {
    this.max = Math.max(max, 1)
  }

  async acquire(signal?: AbortSignal): Promise<() => void> {
    throwIfAborted(signal)

    if (this.active < this.max) {
      this.active += 1
      return () => this.release()
    }

    await new Promise<void>((resolve, reject) => {
      const entry: SemaphoreWaiter = {
        resolve: () => {
          if (entry.onAbort) {
            signal?.removeEventListener('abort', entry.onAbort)
          }
          resolve()
        },
        reject: (error: Error) => {
          if (entry.onAbort) {
            signal?.removeEventListener('abort', entry.onAbort)
          }
          reject(error)
        },
        signal,
      }

      if (signal) {
        entry.onAbort = () => {
          const index = this.queue.indexOf(entry)
          if (index >= 0) {
            this.queue.splice(index, 1)
          }
          entry.reject(signal.reason instanceof Error ? signal.reason : new Error('Analysis run aborted'))
        }
        signal.addEventListener('abort', entry.onAbort, { once: true })
      }

      this.queue.push(entry)
    })

    this.active += 1
    return () => this.release()
  }

  private release(): void {
    this.active = Math.max(this.active - 1, 0)
    const next = this.queue.shift()
    next?.resolve()
  }
}

const STEP_SEPARATOR = '\n\n'
const modelRequestSemaphore = new AsyncSemaphore(config.analysisCodeRequestConcurrency)

export async function runCodeAnalysisPipeline(
  job: AnalysisJobRecord,
  hooks: RuntimeHooks = {}
): Promise<string> {
  const result = await runStandaloneCodeAnalysis({
    slug: job.payload.slug,
    lang: job.lang,
    recordId: job.analysis_record_id,
    hooks,
  })

  await markAnalysisRecordCompleted(job.analysis_record_id, result.finalResult)
  return result.finalResult
}

export async function runStandaloneCodeAnalysis(input: {
  slug: string
  lang: RuntimeLang
  recordId?: string
  hooks?: RuntimeHooks
}): Promise<{
  info: string
  probability: string
  risk: string
  finalResult: string
}> {
  ensureRuntimeActive(input.hooks)
  const event = await fetchEventBySlug(input.slug, input.hooks?.signal)
  const context = await buildWorkflowContext(event)
  const promptSources = buildPromptSources(context, input.lang)

  ensureRuntimeActive(input.hooks)
  const info = await requestModelText(
    config.analysisCodeBaseUrl.replace(/\/+$/, ''),
    getStep2SystemPrompt(promptSources),
    buildStep2Prompt(promptSources),
    {
      model: config.analysisCodeExtractModel,
      maxRetries: 1,
      retryDelayMs: config.analysisCodeRetryDelayMs,
      useWebSearch: false,
      maxOutputTokens: 2400,
    },
    input.hooks
  )

  if (input.recordId) {
    await persistStep(input.recordId, [['info', info]], input.hooks)
  }

  ensureRuntimeActive(input.hooks)
  const probability = await requestModelText(
    config.analysisCodeBaseUrl.replace(/\/+$/, ''),
    getStep3SystemPrompt(toAnalysisPath(context.router.analysis_path), promptSources),
    buildStep3Prompt({ ...promptSources, step2Output: info }),
    {
      model: config.analysisCodeAnalysisModel,
      maxRetries: config.analysisCodeMaxRetries,
      retryDelayMs: config.analysisCodeAnalysisRetryDelayMs,
      useWebSearch: config.analysisCodeUseWebSearch,
      maxOutputTokens: 3600,
    },
    input.hooks
  )

  if (input.recordId) {
    await persistStep(
      input.recordId,
      [
        ['info', info],
        ['probability', probability],
      ],
      input.hooks
    )
  }

  ensureRuntimeActive(input.hooks)
  const risk = await requestModelText(
    config.analysisCodeBaseUrl.replace(/\/+$/, ''),
    getStep4SystemPrompt(toAnalysisPath(context.router.analysis_path), promptSources),
    buildStep4Prompt({ ...promptSources, step2Output: info, step3Output: probability }),
    {
      model: config.analysisCodeAuditModel,
      maxRetries: config.analysisCodeMaxRetries,
      retryDelayMs: config.analysisCodeAuditRetryDelayMs,
      useWebSearch: config.analysisCodeUseWebSearch,
      maxOutputTokens: 2800,
    },
    input.hooks
  )

  if (input.recordId) {
    await persistStep(
      input.recordId,
      [
        ['info', info],
        ['probability', probability],
        ['risk', risk],
      ],
      input.hooks
    )
  }

  ensureRuntimeActive(input.hooks)
  const finalResult = await requestModelText(
    config.analysisCodeBaseUrl.replace(/\/+$/, ''),
    getStep5SystemPrompt(promptSources),
    buildStep5Prompt({ ...promptSources, step2Output: info, step3Output: probability, step4Output: risk }),
    {
      model: config.analysisCodeReportModel,
      maxRetries: config.analysisCodeMaxRetries,
      retryDelayMs: config.analysisCodeAuditRetryDelayMs,
      useWebSearch: false,
      maxOutputTokens: 3200,
    },
    input.hooks
  )

  return { info, probability, risk, finalResult }
}

async function persistStep(
  recordId: string,
  steps: RuntimeStep[],
  hooks: RuntimeHooks = {}
): Promise<void> {
  ensureRuntimeActive(hooks)
  const partial = steps
    .map(([step, content]) => `<!--STEP:${step}-->\n${content.trim()}`)
    .join(STEP_SEPARATOR)

  await updateAnalysisPartialResult(recordId, partial)
  if (hooks.onProgress) {
    await hooks.onProgress(partial)
  }
}

async function fetchEventBySlug(slug: string, signal?: AbortSignal): Promise<PolymarketEvent> {
  throwIfAborted(signal)
  const response = await fetch(`https://gamma-api.polymarket.com/events/slug/${encodeURIComponent(slug)}`, {
    signal,
  })
  if (!response.ok) {
    throw new Error(`Failed to fetch Polymarket event (${response.status})`)
  }
  return (await response.json()) as PolymarketEvent
}

function buildPromptSources(context: WorkflowContext, lang: RuntimeLang) {
  return {
    router: context.router,
    analysisPlan: context.analysisPlan,
    marketSnapshot: context.marketSnapshot,
    retrievalPlan: context.retrievalPlan,
    retrievalPack: context.retrievalPack,
    nowDate: formatShanghaiDate(false),
    nowDateTime: formatShanghaiDate(true),
    lang,
  }
}

function formatShanghaiDate(includeTime: boolean): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(includeTime
      ? {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }
      : {}),
  })

  const parts = formatter.formatToParts(new Date())
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  if (!includeTime) {
    return `${map.year}-${map.month}-${map.day}`
  }
  return `${map.year}-${map.month}-${map.day}-${map.hour}-${map.minute}`
}

function toAnalysisPath(value: unknown): AnalysisPath {
  switch (value) {
    case 'deadline_procedural':
    case 'linked_binary_ladder':
    case 'numeric_market':
    case 'competitive_multi_outcome':
    case 'sports_competition':
      return value
    default:
      return 'generic_fallback'
  }
}

async function requestModelText(
  baseUrl: string,
  systemPrompt: string,
  prompt: string,
  requestOptions: ModelRequestOptions,
  hooks: RuntimeHooks = {}
): Promise<string> {
  if (!config.analysisCodeApiKey) {
    throw new Error('ANALYSIS_CODE_API_KEY is required for code-based analysis runtime')
  }

  let lastError = 'Unknown provider error'
  let lastStatus = 0
  const attempts = Math.max(requestOptions.maxRetries, 1)

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    ensureRuntimeActive(hooks)
    const responsesResult = await withModelRequestLease(hooks.signal, () =>
      requestResponsesApi(baseUrl, systemPrompt, prompt, requestOptions, hooks.signal)
    )
    if (responsesResult.ok) {
      return responsesResult.text
    }

    lastError = responsesResult.error
    lastStatus = responsesResult.status

    if (shouldFallbackToChat(lastStatus, lastError)) {
      const chatResult = await withModelRequestLease(hooks.signal, () =>
        requestChatCompletionsApi(baseUrl, systemPrompt, prompt, requestOptions, hooks.signal)
      )
      if (chatResult.ok) {
        return chatResult.text
      }

      lastError = chatResult.error || lastError
      lastStatus = chatResult.status || lastStatus
    }

    if (!shouldRetryProviderRequest(lastStatus, lastError) || attempt === attempts) {
      break
    }

    await sleep(requestOptions.retryDelayMs, hooks.signal)
  }

  throw new Error(`Code analysis provider request failed (${lastStatus}): ${lastError}`.slice(0, 360))
}

async function requestResponsesApi(
  baseUrl: string,
  systemPrompt: string,
  prompt: string,
  requestOptions: ModelRequestOptions,
  signal?: AbortSignal
): Promise<{ ok: true; text: string } | { ok: false; status: number; error: string }> {
  throwIfAborted(signal)
  const response = await fetch(`${baseUrl}/responses`, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.analysisCodeApiKey}`,
    },
    body: JSON.stringify({
      model: requestOptions.model,
      instructions: systemPrompt,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: prompt,
            },
          ],
        },
      ],
      max_output_tokens: requestOptions.maxOutputTokens || 3500,
      tools: requestOptions.useWebSearch
        ? [
            {
              type: 'web_search',
              search_context_size: config.analysisCodeSearchContextSize,
            },
          ]
        : undefined,
      tool_choice: requestOptions.useWebSearch ? 'auto' : undefined,
      stream: false,
    }),
  })

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: (await response.text()).slice(0, 300),
    }
  }

  const rawBody = await response.text()
  const data = parseResponsesBody(rawBody) as {
    output_text?: string
    output?: Array<{
      content?: Array<{ type?: string; text?: string }>
    }>
  }

  const text = data.output_text?.trim() || normalizeResponsesOutput(data.output)
  return { ok: true, text }
}

async function requestChatCompletionsApi(
  baseUrl: string,
  systemPrompt: string,
  prompt: string,
  requestOptions: ModelRequestOptions,
  signal?: AbortSignal
): Promise<{ ok: true; text: string } | { ok: false; status: number; error: string }> {
  throwIfAborted(signal)
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.analysisCodeApiKey}`,
    },
    body: JSON.stringify({
      model: requestOptions.model,
      max_tokens: requestOptions.maxOutputTokens || 3500,
      temperature: 0.2,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
    }),
  })

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: (await response.text()).slice(0, 300),
    }
  }

  const data = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string | Array<{ type?: string; text?: string }>
      }
    }>
  }

  const rawContent = data.choices?.[0]?.message?.content
  return { ok: true, text: normalizeModelContent(rawContent) }
}

function normalizeModelContent(content: string | Array<{ type?: string; text?: string }> | undefined): string {
  if (typeof content === 'string') {
    return content.trim()
  }

  if (!Array.isArray(content)) {
    return ''
  }

  return content
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .join('')
    .trim()
}

function normalizeResponsesOutput(
  output: Array<{ content?: Array<{ type?: string; text?: string }> }> | undefined
): string {
  if (!Array.isArray(output)) {
    return ''
  }

  return output
    .flatMap((item) => (Array.isArray(item.content) ? item.content : []))
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .join('')
    .trim()
}

function parseResponsesBody(rawBody: string): {
  output_text?: string
  output?: Array<{
    content?: Array<{ type?: string; text?: string }>
  }>
} {
  const trimmed = rawBody.trim()
  if (!trimmed) {
    return {}
  }

  try {
    return JSON.parse(trimmed) as {
      output_text?: string
      output?: Array<{
        content?: Array<{ type?: string; text?: string }>
      }>
    }
  } catch {
    return parseResponsesSseBody(trimmed)
  }
}

function parseResponsesSseBody(rawBody: string): {
  output_text?: string
  output?: Array<{
    content?: Array<{ type?: string; text?: string }>
  }>
} {
  let outputText = ''
  let completedResponse:
    | {
        output_text?: string
        output?: Array<{
          content?: Array<{ type?: string; text?: string }>
        }>
      }
    | null = null

  for (const block of rawBody.split(/\r?\n\r?\n/)) {
    let eventName = ''
    const dataLines: string[] = []

    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('event:')) {
        eventName = line.slice('event:'.length).trim()
        continue
      }
      if (line.startsWith('data:')) {
        dataLines.push(line.slice('data:'.length).trimStart())
      }
    }

    if (!dataLines.length) continue

    const payloadText = dataLines.join('\n').trim()
    if (!payloadText || payloadText === '[DONE]') continue

    try {
      const payload = JSON.parse(payloadText) as {
        delta?: string
        text?: string
        response?: {
          output_text?: string
          output?: Array<{
            content?: Array<{ type?: string; text?: string }>
          }>
        }
      }

      if (eventName === 'response.output_text.delta' && typeof payload.delta === 'string') {
        outputText += payload.delta
      }

      if (eventName === 'response.output_text.done' && typeof payload.text === 'string') {
        outputText = payload.text
      }

      if (eventName === 'response.completed' && payload.response) {
        completedResponse = payload.response
      }
    } catch {
      continue
    }
  }

  if (completedResponse) {
    return completedResponse
  }

  if (outputText) {
    return { output_text: outputText }
  }

  throw new Error('Unsupported SSE response body from analysis provider')
}

function shouldRetryProviderRequest(status: number, error: string): boolean {
  if (status === 429) return true
  if (status >= 500) return true
  return /temporarily unavailable|timeout|timed out|rate limit|overloaded|upstream/i.test(error)
}

function shouldFallbackToChat(status: number, error: string): boolean {
  if (status === 404) return true
  return /responses[^a-z]+is not supported|unknown endpoint|unsupported protocol/i.test(error)
}

function ensureRuntimeActive(hooks: RuntimeHooks = {}): void {
  hooks.assertActive?.()
  throwIfAborted(hooks.signal)
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  throw signal.reason instanceof Error ? signal.reason : new Error('Analysis run aborted')
}

async function withModelRequestLease<T>(signal: AbortSignal | undefined, task: () => Promise<T>): Promise<T> {
  const release = await modelRequestSemaphore.acquire(signal)
  try {
    return await task()
  } finally {
    release()
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal)
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)

    const onAbort = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      reject(signal?.reason instanceof Error ? signal.reason : new Error('Analysis run aborted'))
    }

    signal?.addEventListener('abort', onAbort, { once: true })
  })
}
