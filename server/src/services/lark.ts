import { config } from '../config.js'
import { supabase } from './supabase.js'
import { getStrongestFeaturedOption, type FeaturedRecord } from './featured.js'

interface LarkWebhookResponse {
  code?: number
  msg?: string
  StatusCode?: number
  StatusMessage?: string
}

interface FeaturedLarkGuidance {
  direction: string
  recommendation: string
  requiresManualReview: boolean
  note: string | null
}

function isMissingLarkStateColumnError(error: {
  message?: string
  details?: string | null
  hint?: string | null
}): boolean {
  const message = [error.message, error.details, error.hint].filter(Boolean).join(' ')
  return /lark_push_/i.test(message) && /column|schema cache|not found|does not exist/i.test(message)
}

function normalizeText(value: string | null | undefined, fallback = 'N/A'): string {
  const trimmed = value?.trim()
  return trimmed ? trimmed : fallback
}

function toPercent(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'N/A'
  return `${Math.round(value * 10) / 10}%`
}

function buildCampaignCode(featured: FeaturedRecord): string {
  return `featured_${featured.event_slug}`
}

function buildInternalPreviewLink(featured: FeaturedRecord): string {
  const url = new URL(config.publicAppUrl)
  url.searchParams.set('c', buildCampaignCode(featured))
  url.searchParams.set('internal_preview', '1')
  return url.toString()
}

function buildXShareLink(featured: FeaturedRecord): string {
  const url = new URL(config.publicAppUrl)
  url.searchParams.set('c', buildCampaignCode(featured))
  url.searchParams.set('utm_source', 'x')
  url.searchParams.set('utm_medium', 'social')
  url.searchParams.set('utm_campaign', 'featured_auto')
  return url.toString()
}

function normalizeDirection(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase()
  if (!trimmed) return null

  if (trimmed === 'buy yes') return 'Buy Yes'
  if (trimmed === 'buy no') return 'Buy No'
  if (trimmed === 'do not participate') return 'Do not participate'
  if (trimmed === 'review manually') return 'Review manually'
  return null
}

function deriveDirectionFromStrongestSignal(featured: FeaturedRecord): string | null {
  const strongest = getStrongestFeaturedOption(featured)
  if (!strongest) return null

  const optionName = strongest.option.name?.trim().toLowerCase() || ''
  const market = strongest.option.market
  const ai = strongest.option.ai
  if (typeof market !== 'number' || typeof ai !== 'number' || market === ai) {
    return 'Do not participate'
  }

  if (optionName === 'yes') {
    return ai > market ? 'Buy Yes' : 'Buy No'
  }

  if (optionName === 'no') {
    return ai > market ? 'Buy No' : 'Buy Yes'
  }

  return null
}

export function resolveFeaturedLarkGuidance(featured: FeaturedRecord): FeaturedLarkGuidance {
  const decision = featured.decision_data || null
  const strongestDirection = deriveDirectionFromStrongestSignal(featured)
  const modelDirection = normalizeDirection(decision?.direction)
  const recommendation = normalizeText(decision?.recommendation, 'No recommendation')

  if (strongestDirection && modelDirection && strongestDirection !== modelDirection) {
    return {
      direction: 'Review manually',
      recommendation: 'The model recommendation conflicted with the strongest pricing edge. Review the full PolyInsight analysis before acting.',
      requiresManualReview: true,
      note: `Signal implied ${strongestDirection}, but model output said ${modelDirection}.`,
    }
  }

  return {
    direction: modelDirection || strongestDirection || 'Do not participate',
    recommendation,
    requiresManualReview: false,
    note: null,
  }
}

export function buildFeaturedLarkText(featured: FeaturedRecord): string {
  const decision = featured.decision_data || null
  const strongest = getStrongestFeaturedOption(featured)
  const guidance = resolveFeaturedLarkGuidance(featured)
  const risk = normalizeText(decision?.risk, 'unknown')
  const riskReason = normalizeText(decision?.risk_reason, 'No risk note')
  const topLine = strongest
    ? `${normalizeText(strongest.option.name, 'Main option')}: AI ${toPercent(strongest.option.ai)} vs market ${toPercent(strongest.option.market)} (edge ${toPercent(strongest.diff)})`
    : 'No clear primary option found'

  return [
    '【PolyInsight 热门事件提醒】',
    `事件: ${normalizeText(decision?.event, featured.event_title || featured.event_slug)}`,
    `分类: ${normalizeText(featured.category, 'other')}`,
    `主信号: ${topLine}`,
    `建议方向: ${guidance.direction}`,
    `操作建议: ${guidance.recommendation}`,
    `风险等级: ${risk}`,
    `风险提示: ${riskReason}`,
    `到期时间: ${normalizeText(decision?.deadline, featured.expires_at || 'N/A')}`,
    `Polymarket: ${normalizeText(featured.polymarket_url)}`,
    `内部预览链接: ${buildInternalPreviewLink(featured)}`,
    `X 分享链接: ${buildXShareLink(featured)}`,
    guidance.note ? `系统提示: ${guidance.note}` : null,
  ].filter(Boolean).join('\n')
}

async function updateFeaturedLarkState(
  featuredId: string,
  updates: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase
    .from('featured_analyses')
    .update(updates)
    .eq('id', featuredId)

  if (error) {
    if (isMissingLarkStateColumnError(error)) {
      console.warn('[Lark] featured_analyses push-state columns are missing; skipping persistence')
      return
    }
    throw error
  }
}

export async function sendFeaturedToLark(featured: FeaturedRecord): Promise<void> {
  if (!config.larkBotWebhookUrl) {
    throw new Error('LARK_BOT_WEBHOOK_URL is not configured')
  }

  const text = buildFeaturedLarkText(featured)
  const payload = {
    msg_type: 'text',
    content: {
      text,
    },
  }
  const attemptedAt = new Date().toISOString()

  try {
    const response = await fetch(config.larkBotWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const body = await response.json() as LarkWebhookResponse
    const code = typeof body.code === 'number'
      ? body.code
      : typeof body.StatusCode === 'number'
        ? body.StatusCode
        : 0

    if (!response.ok || code !== 0) {
      const message = body.msg || body.StatusMessage || `HTTP ${response.status}`
      throw new Error(message)
    }

    if (featured.id) {
      await updateFeaturedLarkState(featured.id, {
        lark_push_status: 'sent',
        lark_push_sent_at: attemptedAt,
        lark_push_last_attempt_at: attemptedAt,
        lark_push_last_error: null,
        lark_push_payload: payload,
      })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (featured.id) {
      await updateFeaturedLarkState(featured.id, {
        lark_push_status: 'failed',
        lark_push_last_attempt_at: attemptedAt,
        lark_push_last_error: message.slice(0, 500),
        lark_push_payload: payload,
      })
    }
    throw error
  }
}
