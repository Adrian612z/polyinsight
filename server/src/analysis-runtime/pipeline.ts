import { config } from '../config.js'
import {
  markAnalysisRecordCompleted,
  updateAnalysisPartialResult,
  type AnalysisJobRecord,
} from '../services/analysisJobs.js'

interface PolymarketMarket {
  id: string
  question: string
  slug: string
  outcomes?: string
  outcomePrices?: string
  active?: boolean
  closed?: boolean
  archived?: boolean
  acceptingOrders?: boolean
  enableOrderBook?: boolean
  groupItemTitle?: string
}

interface PolymarketEvent {
  id: string
  slug: string
  title: string
  description: string
  endDate?: string
  markets: PolymarketMarket[]
  eventMetadata?: {
    context_description?: string
  }
}

interface RuntimeOption {
  name: string
  market: number
  ai: number
}

interface ProbabilityDraft {
  event: string
  deadline: string
  options: RuntimeOption[]
  recommendation: string
  direction: string
  summary_markdown: string
}

interface RiskDraft {
  risk: 'safe' | 'caution' | 'danger' | 'reject'
  risk_reason: string
  audit_markdown: string
}

interface RuntimeHooks {
  onProgress?: (partialResult: string) => Promise<void>
}

type RuntimeStep = [string, string]
type RuntimeLang = 'en' | 'zh'

interface ModelRequestOptions {
  model: string
  maxRetries: number
  retryDelayMs: number
  useWebSearch: boolean
  maxOutputTokens?: number
}

const STEP_SEPARATOR = '\n\n'

export async function runCodeAnalysisPipeline(
  job: AnalysisJobRecord,
  hooks: RuntimeHooks = {}
): Promise<string> {
  const event = await fetchEventBySlug(job.payload.slug)
  const markets = getRenderableMarkets(event)
  const analysisPath = inferAnalysisPath(event, markets)

  const infoStep = renderInfoStep(event, markets, analysisPath, job.lang)
  await persistStep(job.analysis_record_id, [['info', infoStep]], hooks)

  const probabilityDraft = await buildProbabilityDraft(event, markets, analysisPath, job.lang)
  const probabilityStep = renderProbabilityStep(probabilityDraft, job.lang)
  await persistStep(
    job.analysis_record_id,
    [
      ['info', infoStep],
      ['probability', probabilityStep],
    ],
    hooks
  )

  const riskDraft = await buildRiskDraft(event, probabilityDraft, analysisPath, job.lang)
  const riskStep = renderRiskStep(riskDraft, job.lang)
  await persistStep(
    job.analysis_record_id,
    [
      ['info', infoStep],
      ['probability', probabilityStep],
      ['risk', riskStep],
    ],
    hooks
  )

  const finalResult = composeFinalResult(probabilityDraft, riskDraft, job.lang)
  await markAnalysisRecordCompleted(job.analysis_record_id, finalResult)
  return finalResult
}

export async function runStandaloneCodeAnalysis(input: {
  slug: string
  lang: 'en' | 'zh'
}): Promise<{
  info: string
  probability: ProbabilityDraft
  risk: RiskDraft
  finalResult: string
}> {
  const event = await fetchEventBySlug(input.slug)
  const markets = getRenderableMarkets(event)
  const analysisPath = inferAnalysisPath(event, markets)
  const info = renderInfoStep(event, markets, analysisPath, input.lang)
  const probability = await buildProbabilityDraft(event, markets, analysisPath, input.lang)
  const risk = await buildRiskDraft(event, probability, analysisPath, input.lang)
  const finalResult = composeFinalResult(probability, risk, input.lang)

  return { info, probability, risk, finalResult }
}

async function persistStep(
  recordId: string,
  steps: RuntimeStep[],
  hooks: RuntimeHooks = {}
): Promise<void> {
  const partial = steps
    .map(([step, content]) => `<!--STEP:${step}-->\n${content.trim()}`)
    .join(STEP_SEPARATOR)

  await updateAnalysisPartialResult(recordId, partial)
  if (hooks.onProgress) {
    await hooks.onProgress(partial)
  }
}

async function fetchEventBySlug(slug: string): Promise<PolymarketEvent> {
  const response = await fetch(`https://gamma-api.polymarket.com/events/slug/${encodeURIComponent(slug)}`)
  if (!response.ok) {
    throw new Error(`Failed to fetch Polymarket event (${response.status})`)
  }
  return response.json() as Promise<PolymarketEvent>
}

function getRenderableMarkets(event: PolymarketEvent): PolymarketMarket[] {
  const strict = event.markets.filter(
    (market) =>
      market.closed !== true &&
      market.archived !== true &&
      market.acceptingOrders !== false &&
      market.enableOrderBook !== false
  )

  if (strict.length > 0) return strict

  const active = event.markets.filter((market) => market.active !== false && market.archived !== true)
  return active.length > 0 ? active : event.markets
}

function inferAnalysisPath(event: PolymarketEvent, markets: PolymarketMarket[]): string {
  const title = `${event.title} ${event.description}`.toLowerCase()
  const allBinary = markets.every((market) => parseList(market.outcomes).length === 2)

  if (title.includes('sports') || title.includes('league') || title.includes('match') || title.includes('winner')) {
    return 'sports_competition'
  }

  if (allBinary && markets.length > 2 && /by|before|after|deadline|ipo/.test(title)) {
    return 'linked_binary_ladder'
  }

  if (allBinary && markets.length > 2) {
    return 'competitive_multi_outcome'
  }

  if (!allBinary) {
    return 'numeric_or_multi_outcome'
  }

  return 'generic_fallback'
}

function renderInfoStep(
  event: PolymarketEvent,
  markets: PolymarketMarket[],
  analysisPath: string,
  lang: 'en' | 'zh'
): string {
  const lines = [
    lang === 'zh' ? '## 事件结构' : '## Event Structure',
    `${lang === 'zh' ? '事件标题' : 'Event title'}: ${event.title}`,
    `${lang === 'zh' ? '分析路径' : 'Analysis path'}: ${analysisPath}`,
    `${lang === 'zh' ? '活跃市场数' : 'Active markets'}: ${markets.length}`,
    `${lang === 'zh' ? '截止时间' : 'Deadline'}: ${event.endDate || 'N/A'}`,
    '',
    lang === 'zh' ? '### 当前活跃市场' : '### Active markets',
  ]

  for (const market of markets.slice(0, 12)) {
    const outcomes = parseList(market.outcomes)
    const prices = parseNumberList(market.outcomePrices)
    const pairs = outcomes
      .map((outcome, idx) => `${outcome}: ${formatPercent(prices[idx] ?? 0)}`)
      .join(' | ')
    lines.push(`- ${(market.groupItemTitle || market.question).trim()}${pairs ? ` -> ${pairs}` : ''}`)
  }

  if (event.eventMetadata?.context_description) {
    lines.push('', lang === 'zh' ? '### 市场背景' : '### Market context', event.eventMetadata.context_description)
  }

  return lines.join('\n')
}

async function buildProbabilityDraft(
  event: PolymarketEvent,
  markets: PolymarketMarket[],
  analysisPath: string,
  lang: RuntimeLang
): Promise<ProbabilityDraft> {
  const prompt = [
    lang === 'zh'
      ? '你是 PolyInsight 的概率分析模型。请基于给定的 Polymarket 事件和当前活跃市场，输出严格 JSON。'
      : "You are PolyInsight's probability analysis model. Use the provided Polymarket event and active markets to return strict JSON.",
    '',
    lang === 'zh'
      ? '要求：保留所有当前活跃市场/选项；market 为市场隐含概率，ai 为你的估计概率；所有概率用 0-100 的数字并保留 1 位小数。'
      : 'Rules: keep every active market/outcome; market is the current market implied probability, ai is your estimate; all probabilities are 0-100 numbers rounded to 1 decimal.',
    '',
    lang === 'zh'
      ? '返回 schema: {"event":string,"deadline":string,"options":[{"name":string,"market":number,"ai":number}],"recommendation":string,"direction":string,"summary_markdown":string}'
      : 'Return schema: {"event":string,"deadline":string,"options":[{"name":string,"market":number,"ai":number}],"recommendation":string,"direction":string,"summary_markdown":string}',
    '',
    `analysis_path: ${analysisPath}`,
    `event_title: ${event.title}`,
    `deadline: ${event.endDate || 'N/A'}`,
    `description: ${event.description}`,
    `context: ${event.eventMetadata?.context_description || 'N/A'}`,
    '',
    'markets:',
    JSON.stringify(normalizeMarkets(markets), null, 2),
  ].join('\n')

  return callOpenAiCompatibleJson<ProbabilityDraft>(
    prompt,
    getProbabilitySystemPrompt(analysisPath, lang),
    {
      model: config.analysisCodeAnalysisModel,
      maxRetries: config.analysisCodeMaxRetries,
      retryDelayMs: config.analysisCodeAnalysisRetryDelayMs,
      useWebSearch: config.analysisCodeUseWebSearch,
    }
  )
}

async function buildRiskDraft(
  event: PolymarketEvent,
  draft: ProbabilityDraft,
  analysisPath: string,
  lang: RuntimeLang
): Promise<RiskDraft> {
  const prompt = [
    lang === 'zh'
      ? '你是 PolyInsight 的风控审计模型。请审核这份概率输出，并返回严格 JSON。'
      : "You are PolyInsight's risk audit model. Review the probability output and return strict JSON.",
    '',
    lang === 'zh'
      ? '返回 schema: {"risk":"safe|caution|danger|reject","risk_reason":string,"audit_markdown":string}'
      : 'Return schema: {"risk":"safe|caution|danger|reject","risk_reason":string,"audit_markdown":string}',
    '',
    `event_title: ${event.title}`,
    `description: ${event.description}`,
    `deadline: ${event.endDate || 'N/A'}`,
    'probability_output:',
    JSON.stringify(draft, null, 2),
  ].join('\n')

  return callOpenAiCompatibleJson<RiskDraft>(
    prompt,
    getRiskSystemPrompt(analysisPath, lang),
    {
      model: config.analysisCodeAuditModel,
      maxRetries: config.analysisCodeMaxRetries,
      retryDelayMs: config.analysisCodeAuditRetryDelayMs,
      useWebSearch: config.analysisCodeUseWebSearch,
    }
  )
}

function renderProbabilityStep(draft: ProbabilityDraft, lang: 'en' | 'zh'): string {
  const lines = [
    lang === 'zh' ? '## 概率分析' : '## Probability Analysis',
    draft.summary_markdown,
    '',
    lang === 'zh' ? '### 关键概率' : '### Key probabilities',
  ]

  for (const option of draft.options) {
    lines.push(`- ${option.name}: ${formatPercent(option.market)} -> ${formatPercent(option.ai)}`)
  }

  return lines.join('\n')
}

function renderRiskStep(risk: RiskDraft, lang: 'en' | 'zh'): string {
  return [
    lang === 'zh' ? '## 风控审计' : '## Risk Audit',
    risk.audit_markdown,
    '',
    `${lang === 'zh' ? '风险等级' : 'Risk'}: ${risk.risk}`,
    `${lang === 'zh' ? '说明' : 'Reason'}: ${risk.risk_reason}`,
  ].join('\n')
}

function composeFinalResult(
  probability: ProbabilityDraft,
  risk: RiskDraft,
  lang: 'en' | 'zh'
): string {
  const decision = {
    event: probability.event,
    deadline: probability.deadline,
    options: probability.options,
    risk: risk.risk,
    risk_reason: risk.risk_reason,
    recommendation: probability.recommendation,
    direction: probability.direction,
  }

  const sections = [
    '```json',
    JSON.stringify(decision, null, 2),
    '```',
    '',
    '---',
    '',
    lang === 'zh' ? '## 概率分析' : '## Probability Analysis',
    probability.summary_markdown,
    '',
    lang === 'zh' ? '## 风控审计' : '## Risk Audit',
    risk.audit_markdown,
    '',
    `${lang === 'zh' ? '推荐' : 'Recommendation'}: ${probability.recommendation}`,
    `${lang === 'zh' ? '方向' : 'Direction'}: ${probability.direction}`,
  ]

  return sections.join('\n')
}

async function callOpenAiCompatibleJson<T>(
  prompt: string,
  systemPrompt: string,
  requestOptions: ModelRequestOptions
): Promise<T> {
  if (!config.analysisCodeApiKey) {
    throw new Error('ANALYSIS_CODE_API_KEY is required for code-based analysis runtime')
  }

  const baseUrl = config.analysisCodeBaseUrl.replace(/\/+$/, '')
  const text = await requestModelText(baseUrl, systemPrompt, prompt, requestOptions)
  if (!text) {
    throw new Error('Code analysis provider response did not include text content')
  }

  return parseJsonObject<T>(text)
}

async function requestModelText(
  baseUrl: string,
  systemPrompt: string,
  prompt: string,
  requestOptions: ModelRequestOptions
): Promise<string> {
  let lastError = 'Unknown provider error'
  let lastStatus = 0
  const attempts = Math.max(requestOptions.maxRetries, 1)

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const responsesResult = await requestResponsesApi(baseUrl, systemPrompt, prompt, requestOptions)
    if (responsesResult.ok) {
      return responsesResult.text
    }

    lastError = responsesResult.error
    lastStatus = responsesResult.status

    if (shouldFallbackToChat(lastStatus, lastError)) {
      const chatResult = await requestChatCompletionsApi(baseUrl, systemPrompt, prompt, requestOptions)
      if (chatResult.ok) {
        return chatResult.text
      }

      lastError = chatResult.error || lastError
      lastStatus = chatResult.status || lastStatus
    }

    if (!shouldRetryProviderRequest(lastStatus, lastError) || attempt === attempts) {
      break
    }

    await sleep(requestOptions.retryDelayMs)
  }

  throw new Error(`Code analysis provider request failed (${lastStatus}): ${lastError}`.slice(0, 360))
}

async function requestResponsesApi(
  baseUrl: string,
  systemPrompt: string,
  prompt: string,
  requestOptions: ModelRequestOptions
): Promise<{ ok: true; text: string } | { ok: false; status: number; error: string }> {
  const response = await fetch(`${baseUrl}/responses`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.analysisCodeApiKey}`,
    },
    body: JSON.stringify({
      model: requestOptions.model,
      instructions: systemPrompt,
      input: buildResponsesInput(prompt),
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
    }),
  })

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: (await response.text()).slice(0, 300),
    }
  }

  const data = await response.json() as {
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
  requestOptions: ModelRequestOptions
): Promise<{ ok: true; text: string } | { ok: false; status: number; error: string }> {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
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

  const data = await response.json() as {
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

function shouldRetryProviderRequest(status: number, error: string): boolean {
  if (status === 429) return true
  if (status >= 500) return true
  return /temporarily unavailable|timeout|timed out|rate limit|overloaded/i.test(error)
}

function shouldFallbackToChat(status: number, error: string): boolean {
  if (status === 404) return true
  return /responses[^a-z]+is not supported|unknown endpoint|unsupported protocol/i.test(error)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function buildResponsesInput(prompt: string) {
  return [
    {
      role: 'user',
      content: [
        {
          type: 'input_text',
          text: prompt,
        },
      ],
    },
  ]
}

function getProbabilitySystemPrompt(analysisPath: string, lang: RuntimeLang): string {
  const base =
    lang === 'zh'
      ? [
          '你是 PolyInsight 的概率分析模型。',
          '只返回用户要求的 JSON，不要附加解释。',
          '把内置 web search 当作验证和补充手段，不要只复述已有市场价格。',
          '使用绝对日期，区分已确认事实和推断；如果你的判断和市场差异很大，必须说明关键假设。',
        ]
      : [
          "You are PolyInsight's probability analysis model.",
          'Return only the requested JSON with no extra wrapper text.',
          'Use built-in web search to verify and extend the current evidence instead of parroting market prices.',
          'Use absolute dates, distinguish facts from inference, and explain the key assumption whenever you materially differ from the market.',
        ]

  const pathSpecific = getProbabilityPathInstructions(analysisPath, lang)
  return [...base, ...pathSpecific].join('\n')
}

function getRiskSystemPrompt(analysisPath: string, lang: RuntimeLang): string {
  const base =
    lang === 'zh'
      ? [
          '你是 PolyInsight 的风控审计模型。',
          '只返回用户要求的 JSON，不要附加解释。',
          '你的任务不是重做一遍分析，而是审计概率输出是否过度自信、是否忽略了规则风险、时间风险、歧义风险和执行路径风险。',
          '如果证据混杂，就扩大区间并降低确定性。',
        ]
      : [
          "You are PolyInsight's risk audit model.",
          'Return only the requested JSON with no extra wrapper text.',
          'Do not re-run the analysis from scratch; audit the draft for overconfidence, rule risk, timing risk, ambiguity risk, and execution-path risk.',
          'When the evidence is mixed, widen the range and lower conviction instead of forcing a sharp view.',
        ]

  const pathSpecific = getRiskPathInstructions(analysisPath, lang)
  return [...base, ...pathSpecific].join('\n')
}

function getProbabilityPathInstructions(analysisPath: string, lang: RuntimeLang): string[] {
  const copy = {
    procedural:
      lang === 'zh'
        ? '重点判断触发 Yes 结算的正式行为，是否会在截止时间之前真正完成；把程序步骤、负责机构、时间窗口和主要阻碍讲清楚。'
        : 'Focus on whether the exact formal act required for Yes can actually finish before the deadline, including the remaining steps, responsible actors, timing windows, and the main blocker path.',
    ladder:
      lang === 'zh'
        ? '把这些选项视为相关的时间梯度桶，不是互斥结果；尽量保持后续时间桶概率单调不降，不要强行求和到 100。'
        : 'Treat the options as correlated deadline buckets rather than mutually exclusive outcomes; preserve monotonicity across later buckets and do not force them to sum to 100.',
    numeric:
      lang === 'zh'
        ? '先确认指标、单位、阈值或区间结构，再结合当前水平、剩余时间和催化剂判断概率；如果是互斥区间，保持整体分布一致。'
        : 'Verify the metric, unit, threshold, or bucket structure first, then use the current level, remaining time, and catalysts to estimate probabilities; keep mutually exclusive buckets coherent when applicable.',
    competitive:
      lang === 'zh'
        ? '把市场视为互斥竞争场，报告集合内概率应接近 100，并明确说明尾部或 Other 风险。'
        : 'Treat the market as a mutually exclusive competitive field; keep the reported option set close to 100 in total and explicitly account for tail or Other risk.',
    sports:
      lang === 'zh'
        ? '优先使用官方赛程、积分榜、伤停和出场信息，以及强时效体育报道；不要因为单条传闻就过度调整概率。'
        : 'Prioritize official standings, schedules, injuries, availability, and strong sports reporting; do not overreact to a single rumor or result.',
    generic:
      lang === 'zh'
        ? '先从规则、时间线和最新高质量证据建立独立判断，再用市场价格做校准信号。'
        : 'Build an independent base case from the rules, timeline, and freshest reliable evidence before using market prices as calibration signals.',
  }

  switch (analysisPath) {
    case 'deadline_procedural':
      return [copy.procedural]
    case 'linked_binary_ladder':
      return [copy.ladder]
    case 'numeric_market':
    case 'numeric_or_multi_outcome':
      return [copy.numeric]
    case 'competitive_multi_outcome':
      return [copy.competitive]
    case 'sports_competition':
      return [copy.sports]
    default:
      return [copy.generic]
  }
}

function getRiskPathInstructions(analysisPath: string, lang: RuntimeLang): string[] {
  const copy = {
    procedural:
      lang === 'zh'
        ? '重点攻击“最终会发生”与“会按时发生”被混为一谈的论证，检查排期、法定流程、时区和发布延迟。'
        : 'Challenge arguments that prove eventual occurrence but not on-time completion, and check scheduling, statutory sequencing, timezone handling, and publication delay.',
    ladder:
      lang === 'zh'
        ? '审计整个时间曲线是否前重后轻失真，检查是否错误地把相关时间桶当成互斥结果。'
        : 'Audit the whole timing curve for front-loaded or back-loaded distortions, and verify the draft did not treat correlated buckets as mutually exclusive outcomes.',
    numeric:
      lang === 'zh'
        ? '核对指标定义、最新数值、阈值或区间边界，以及波动和催化剂假设是否过时。'
        : 'Verify the metric definition, latest observed value, threshold or bucket boundaries, and whether volatility or catalyst assumptions are stale.',
    competitive:
      lang === 'zh'
        ? '检查是否遗漏尾部风险、是否把热门选项过度集中，以及集合内概率是否整体自洽。'
        : 'Check for missing tail risk, overconcentrated frontrunners, and whether the option set remains internally coherent.',
    sports:
      lang === 'zh'
        ? '重点挑战赛程难度、积分规则、伤停、阵容可用性和晋级机制上的薄弱假设。'
        : 'Challenge weak assumptions around schedule difficulty, standings rules, injuries, availability, and qualification or playoff mechanics.',
    generic:
      lang === 'zh'
        ? '如果草稿只是复述市场价格、证据陈旧或来源薄弱，就应明确降级风险结论。'
        : 'If the draft mostly parrots market pricing, uses stale evidence, or relies on weak sourcing, explicitly soften or reject it.',
  }

  switch (analysisPath) {
    case 'deadline_procedural':
      return [copy.procedural]
    case 'linked_binary_ladder':
      return [copy.ladder]
    case 'numeric_market':
    case 'numeric_or_multi_outcome':
      return [copy.numeric]
    case 'competitive_multi_outcome':
      return [copy.competitive]
    case 'sports_competition':
      return [copy.sports]
    default:
      return [copy.generic]
  }
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

function normalizeMarkets(markets: PolymarketMarket[]) {
  return markets.map((market) => {
    const outcomes = parseList(market.outcomes)
    const prices = parseNumberList(market.outcomePrices)
    const label = (market.groupItemTitle || market.question).trim()

    return {
      market: label,
      question: market.question,
      slug: market.slug,
      options: outcomes.map((outcome, idx) => ({
        name: outcomes.length === 2 ? `${label} — ${outcome.toUpperCase()}` : outcome,
        market: roundToTenth(prices[idx] ?? 0),
      })),
    }
  })
}

function parseList(input?: string): string[] {
  if (!input) return []
  try {
    const parsed = JSON.parse(input)
    return Array.isArray(parsed) ? parsed.map((value) => String(value)) : []
  } catch {
    return []
  }
}

function parseNumberList(input?: string): number[] {
  return parseList(input)
    .map((value) => Number(value) * 100)
    .map((value) => (Number.isFinite(value) ? value : 0))
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10
}

function formatPercent(value: number): string {
  return `${roundToTenth(value).toFixed(1)}%`
}
