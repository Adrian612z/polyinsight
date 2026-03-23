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

interface ProbabilityEstimateOption {
  name: string
  market: number
  fair_low: number
  fair_high: number
  fair_mid: number
  confidence: 'low' | 'medium' | 'high'
  sources: string[]
  rationale: string
}

interface StructuredProbabilityEstimate {
  event: string
  deadline: string
  options: ProbabilityEstimateOption[]
  recommendation: string
  direction: string
  summary_markdown: string
}

class StructuredOutputValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StructuredOutputValidationError'
  }
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

  const storedFinalResult = serializeRuntimeSteps([
    ['info', result.info],
    ['probability', renderProbabilityStep(result.probability, job.lang)],
    ['risk', result.risk],
    ['report', result.finalResult],
  ])

  await markAnalysisRecordCompleted(job.analysis_record_id, storedFinalResult)
  return storedFinalResult
}

export async function runStandaloneCodeAnalysis(input: {
  slug: string
  lang: RuntimeLang
  recordId?: string
  hooks?: RuntimeHooks
}): Promise<{
  info: string
  probability: StructuredProbabilityEstimate
  risk: string
  finalResult: string
}> {
  ensureRuntimeActive(input.hooks)
  const event = await fetchEventBySlug(input.slug, input.hooks?.signal)
  const context = await buildWorkflowContext(event)
  const promptSources = buildPromptSources(context, input.lang)
  const marketBlindPromptSources = buildMarketBlindPromptSources(context, input.lang)

  ensureRuntimeActive(input.hooks)
  const info = await requestModelText(
    config.analysisCodeBaseUrl.replace(/\/+$/, ''),
    getStep2SystemPrompt(marketBlindPromptSources),
    buildStep2Prompt(marketBlindPromptSources),
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
  const probabilityRaw = await requestModelText(
    config.analysisCodeBaseUrl.replace(/\/+$/, ''),
    getStep3SystemPrompt(toAnalysisPath(context.router.analysis_path), marketBlindPromptSources),
    buildStep3Prompt({ ...marketBlindPromptSources, step2Output: info }),
    {
      model: config.analysisCodeAnalysisModel,
      maxRetries: config.analysisCodeMaxRetries,
      retryDelayMs: config.analysisCodeAnalysisRetryDelayMs,
      useWebSearch: config.analysisCodeUseWebSearch,
      maxOutputTokens: 3600,
    },
    input.hooks
  )
  const probability = normalizeProbabilityEstimate(probabilityRaw, context, input.lang)
  const probabilityJson = JSON.stringify(probability, null, 2)
  const probabilityStep = renderProbabilityStep(probability, input.lang)

  if (input.recordId) {
    await persistStep(
      input.recordId,
      [
        ['info', info],
        ['probability', probabilityStep],
      ],
      input.hooks
    )
  }

  ensureRuntimeActive(input.hooks)
  const risk = await requestModelText(
    config.analysisCodeBaseUrl.replace(/\/+$/, ''),
    getStep4SystemPrompt(toAnalysisPath(context.router.analysis_path), promptSources),
    buildStep4Prompt({ ...promptSources, step2Output: info, step3Output: probabilityJson }),
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
        ['probability', probabilityStep],
        ['risk', risk],
      ],
      input.hooks
    )
  }

  ensureRuntimeActive(input.hooks)
  const finalResult = await requestModelText(
    config.analysisCodeBaseUrl.replace(/\/+$/, ''),
    getStep5SystemPrompt(toAnalysisPath(context.router.analysis_path), promptSources),
    buildStep5Prompt({ ...promptSources, step2Output: info, step3Output: probabilityJson, step4Output: risk }),
    {
      model: config.analysisCodeReportModel,
      maxRetries: config.analysisCodeMaxRetries,
      retryDelayMs: config.analysisCodeAuditRetryDelayMs,
      useWebSearch: false,
      maxOutputTokens: 3200,
    },
    input.hooks
  )

  if (input.recordId) {
    await persistStep(
      input.recordId,
      [
        ['info', info],
        ['probability', probabilityStep],
        ['risk', risk],
        ['report', finalResult],
      ],
      input.hooks
    )
  }

  return { info, probability, risk, finalResult }
}

async function persistStep(
  recordId: string,
  steps: RuntimeStep[],
  hooks: RuntimeHooks = {}
): Promise<void> {
  ensureRuntimeActive(hooks)
  const partial = serializeRuntimeSteps(steps)

  await updateAnalysisPartialResult(recordId, partial)
  if (hooks.onProgress) {
    await hooks.onProgress(partial)
  }
}

function serializeRuntimeSteps(steps: RuntimeStep[]): string {
  return steps
    .map(([step, content]) => `<!--STEP:${step}-->\n${content.trim()}`)
    .join(STEP_SEPARATOR)
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
    nowDate: formatUtcNow(false),
    nowDateTime: formatUtcNow(true),
    lang,
  }
}

function buildMarketBlindPromptSources(context: WorkflowContext, lang: RuntimeLang) {
  return {
    router: context.router,
    analysisPlan: stripPredictionMarketPricing(context.analysisPlan),
    marketSnapshot: stripPredictionMarketPricing(context.marketSnapshot),
    retrievalPlan: context.retrievalPlan,
    retrievalPack: context.retrievalPack,
    nowDate: formatUtcNow(false),
    nowDateTime: formatUtcNow(true),
    lang,
  }
}

function formatUtcNow(includeTime: boolean): string {
  const nowIso = new Date().toISOString()
  return includeTime ? nowIso.replace(/\.\d{3}Z$/, 'Z') : nowIso.slice(0, 10)
}

function toAnalysisPath(value: unknown): AnalysisPath {
  switch (value) {
    case 'deadline_procedural':
    case 'linked_binary_ladder':
    case 'numeric_market':
    case 'competitive_multi_outcome':
    case 'sports_competition':
    case 'weather_station_bucket':
    case 'weather_accumulation_bucket':
    case 'weather_first_occurrence_race':
    case 'tropical_cyclone_event':
    case 'climate_index_numeric':
      return value
    default:
      return 'generic_fallback'
  }
}

const PREDICTION_MARKET_PRICING_KEYS = new Set([
  'market',
  'probability',
  'yes_probability',
  'no_probability',
  'market_sum_yes',
])

function stripPredictionMarketPricing<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => stripPredictionMarketPricing(entry)) as T
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  const next: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (PREDICTION_MARKET_PRICING_KEYS.has(key)) {
      continue
    }
    next[key] = stripPredictionMarketPricing(child)
  }

  return next as T
}

function normalizeProbabilityEstimate(
  rawText: string,
  context: WorkflowContext,
  lang: RuntimeLang
): StructuredProbabilityEstimate {
  const parsed = parseJsonObject<Partial<StructuredProbabilityEstimate>>(rawText)
  const analysisPlan = context.analysisPlan && typeof context.analysisPlan === 'object' ? context.analysisPlan : {}
  const expectedRows = Array.isArray((analysisPlan as Record<string, unknown>).decision_option_rows)
    ? ((analysisPlan as Record<string, unknown>).decision_option_rows as Array<Record<string, unknown>>)
    : []

  const rawOptions = Array.isArray(parsed.options) ? (parsed.options as unknown as Array<Record<string, unknown>>) : []
  const rawOptionMap = new Map(
    rawOptions
      .filter((option) => typeof option?.name === 'string')
      .map((option) => [normalizeOptionKey(String(option.name)), option as Partial<ProbabilityEstimateOption>])
  )

  const normalizedOptions = expectedRows.length > 0
    ? expectedRows.map((row) => {
        const expectedName = String(row.name || '').trim()
        const expectedMarket = clampPercent(toNumber(row.market, 50))
        return normalizeProbabilityOption(rawOptionMap.get(normalizeOptionKey(expectedName)), expectedName, expectedMarket, lang)
      })
    : rawOptions
        .filter((option) => typeof option?.name === 'string')
        .map((option) =>
          normalizeProbabilityOption(
            option as Partial<ProbabilityEstimateOption>,
            String(option.name),
            clampPercent(toNumber(option.market, 50)),
            lang
          )
        )

  const calibratedOptions = calibrateProbabilityOptions(normalizedOptions, analysisPlan)
  const fallbackSummary =
    lang === 'zh'
      ? '已结合市场价格、最新信息和截止时间，给出更保守的概率区间与中心判断。'
      : 'The estimate combines market pricing, recent evidence, and deadline pressure into a more conservative fair range.'

  return {
    event: typeof parsed.event === 'string' && parsed.event.trim() ? parsed.event.trim() : context.event?.title || 'Polymarket event',
    deadline:
      typeof parsed.deadline === 'string' && parsed.deadline.trim()
        ? parsed.deadline.trim()
        : String((analysisPlan as Record<string, unknown>).primary_deadline || context.event?.endDate || 'N/A'),
    options: calibratedOptions,
    recommendation:
      typeof parsed.recommendation === 'string' && parsed.recommendation.trim()
        ? parsed.recommendation.trim()
        : lang === 'zh'
          ? '优先关注 AI 判断与市场价格差距最大的选项。'
          : 'Focus on the option with the clearest gap between the AI view and market pricing.',
    direction:
      typeof parsed.direction === 'string' && parsed.direction.trim()
        ? parsed.direction.trim()
        : 'Do not participate',
    summary_markdown:
      typeof parsed.summary_markdown === 'string' && parsed.summary_markdown.trim()
        ? parsed.summary_markdown.trim()
        : fallbackSummary,
  }
}

function normalizeProbabilityOption(
  raw: Partial<ProbabilityEstimateOption> | undefined,
  expectedName: string,
  expectedMarket: number,
  lang: RuntimeLang
): ProbabilityEstimateOption {
  if (!raw) {
    throw new StructuredOutputValidationError(`Structured probability output is missing option: ${expectedName}`)
  }

  const market = roundToTenth(expectedMarket)
  const baseMid = readRequiredPercentField(raw, ['fair_mid', 'ai'], expectedName, 'fair_mid')
  const baseLow = readRequiredPercentField(raw, ['fair_low'], expectedName, 'fair_low')
  const baseHigh = readRequiredPercentField(raw, ['fair_high'], expectedName, 'fair_high')

  if (!(baseLow <= baseMid && baseMid <= baseHigh)) {
    throw new StructuredOutputValidationError(
      `Structured probability output has invalid range ordering for ${expectedName}: low=${baseLow}, mid=${baseMid}, high=${baseHigh}`
    )
  }

  const confidence = normalizeConfidence(raw?.confidence)
  if (!confidence) {
    throw new StructuredOutputValidationError(`Structured probability output is missing or invalid confidence for ${expectedName}`)
  }

  const rationale =
    typeof raw?.rationale === 'string' && raw.rationale.trim()
      ? raw.rationale.trim()
      : null
  if (!rationale) {
    throw new StructuredOutputValidationError(`Structured probability output is missing rationale for ${expectedName}`)
  }

  const sources = Array.isArray(raw?.sources)
    ? raw.sources.map((value) => String(value).trim()).filter(Boolean).slice(0, 6)
    : []
  if (sources.length === 0) {
    throw new StructuredOutputValidationError(`Structured probability output is missing sources for ${expectedName}`)
  }

  return {
    name: expectedName,
    market,
    fair_low: roundToTenth(baseLow),
    fair_mid: roundToTenth(baseMid),
    fair_high: roundToTenth(baseHigh),
    confidence,
    sources,
    rationale,
  }
}

function calibrateProbabilityOptions(
  options: ProbabilityEstimateOption[],
  analysisPlan: Record<string, unknown>
): ProbabilityEstimateOption[] {
  if (options.length === 0) return []

  const structureKind = String(analysisPlan.structure_kind || '')
  const analysisPath = String(analysisPlan.analysis_path || '')
  const monotonicityApplies =
    Boolean((analysisPlan.monotonicity as Record<string, unknown> | undefined)?.applies) ||
    analysisPath === 'linked_binary_ladder' ||
    structureKind === 'timing_curve' ||
    structureKind === 'numeric_timing_curve'

  let next = options.map((option) => ({ ...option }))

  if (shouldNormalizeExclusiveDistribution(structureKind, analysisPath, next.length)) {
    const total = next.reduce((sum, option) => sum + option.fair_mid, 0)
    if (total > 0.001) {
      next = next.map((option) => {
        const spreadLow = Math.max(0, option.fair_mid - option.fair_low)
        const spreadHigh = Math.max(0, option.fair_high - option.fair_mid)
        const fairMid = roundToTenth(clampPercent((option.fair_mid / total) * 100))
        const fairLow = roundToTenth(clampPercent(fairMid - spreadLow))
        const fairHigh = roundToTenth(clampPercent(fairMid + spreadHigh))
        return {
          ...option,
          fair_low: Math.min(fairLow, fairMid),
          fair_mid: fairMid,
          fair_high: Math.max(fairHigh, fairMid),
        }
      })
    }
  }

  if (monotonicityApplies) {
    let runningLow = 0
    let runningMid = 0
    let runningHigh = 0
    next = next.map((option) => {
      runningLow = Math.max(runningLow, option.fair_low)
      runningMid = Math.max(runningMid, option.fair_mid)
      runningHigh = Math.max(runningHigh, option.fair_high)
      const boundedHigh = Math.max(runningMid, Math.min(100, runningHigh))
      return {
        ...option,
        fair_low: roundToTenth(Math.min(runningLow, runningMid)),
        fair_mid: roundToTenth(runningMid),
        fair_high: roundToTenth(boundedHigh),
      }
    })
  }

  return next
}

function shouldNormalizeExclusiveDistribution(structureKind: string, analysisPath: string, optionCount: number): boolean {
  if (optionCount <= 1) return false
  if (analysisPath === 'linked_binary_ladder') return false
  if (structureKind === 'timing_curve' || structureKind === 'numeric_timing_curve') return false
  if (structureKind === 'sports_qualification_bundle' || structureKind === 'sports_generic_multi' || structureKind === 'event_bundle') {
    return false
  }
  return true
}

function renderProbabilityStep(draft: StructuredProbabilityEstimate, lang: RuntimeLang): string {
  const heading = lang === 'zh' ? '## 概率分析' : '## Probability Analysis'
  const subheading = lang === 'zh' ? '### 关键概率' : '### Key probabilities'
  const confidenceLabel = (value: ProbabilityEstimateOption['confidence']) => {
    if (lang === 'zh') {
      return value === 'high' ? '高' : value === 'medium' ? '中' : '低'
    }
    return value
  }

  const lines = [heading, draft.summary_markdown, '', subheading]
  for (const option of draft.options) {
    const sourceSuffix = option.sources.length > 0
      ? lang === 'zh'
        ? ` | 依据: ${option.sources.slice(0, 2).join('；')}`
        : ` | Sources: ${option.sources.slice(0, 2).join('; ')}`
      : ''
    lines.push(
      `- ${option.name}: ${lang === 'zh' ? '市场' : 'Market'} ${formatPercent(option.market)} | ${lang === 'zh' ? '合理区间' : 'Fair range'} ${formatPercent(option.fair_low)}-${formatPercent(option.fair_high)} | ${lang === 'zh' ? '中心判断' : 'Mid'} ${formatPercent(option.fair_mid)} | ${lang === 'zh' ? '把握度' : 'Confidence'} ${confidenceLabel(option.confidence)}${sourceSuffix}`
    )
  }

  return lines.join('\n')
}

function normalizeOptionKey(value: string): string {
  return value.replace(/\s+/g, ' ').replace(/[–—]/g, '-').trim().toLowerCase()
}

function normalizeConfidence(value: unknown): ProbabilityEstimateOption['confidence'] | null {
  if (typeof value === 'number') {
    if (value >= 0.75) return 'high'
    if (value >= 0.45) return 'medium'
    return 'low'
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'high' || normalized === 'medium' || normalized === 'low') return normalized
  }
  return null
}

function readRequiredPercentField(
  raw: Record<string, unknown>,
  keys: string[],
  optionName: string,
  fieldLabel: string
): number {
  for (const key of keys) {
    const next = Number(raw[key])
    if (Number.isFinite(next)) {
      return clampPercent(next)
    }
  }

  throw new StructuredOutputValidationError(
    `Structured probability output is missing numeric ${fieldLabel} for ${optionName}`
  )
}

function toNumber(value: unknown, fallback: number): number {
  const next = Number(value)
  return Number.isFinite(next) ? next : fallback
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value))
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10
}

function formatPercent(value: number): string {
  return `${roundToTenth(value).toFixed(1)}%`
}

function parseJsonObject<T>(text: string): T {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i)
  const raw = fenced ? fenced[1] : text
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Could not locate JSON object in model output: ${text.slice(0, 200)}`)
  }
  return JSON.parse(raw.slice(start, end + 1)) as T
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
