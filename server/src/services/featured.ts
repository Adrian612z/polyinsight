interface FeaturedDecisionOption {
  market?: number
  ai?: number
}

interface FeaturedDecisionData {
  event?: string
  options?: FeaturedDecisionOption[]
  deadline?: string | null
}

export interface FeaturedRecord {
  id?: string
  event_slug: string
  event_title: string
  category?: string | null
  polymarket_url: string
  analysis_record_id?: string | null
  decision_data?: FeaturedDecisionData | null
  mispricing_score?: number | null
  is_active?: boolean | null
  expires_at?: string | null
  created_at?: string
}

function parseFeatureExpiry(input: string | null | undefined): number | null {
  if (!input) return null

  const trimmed = input.trim()
  if (!trimmed) return null

  // Treat bare YYYY-MM-DD deadlines as the end of that UTC day so a same-day
  // opportunity does not disappear at 00:00.
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const dateOnlyExpiry = Date.parse(`${trimmed}T23:59:59.999Z`)
    return Number.isFinite(dateOnlyExpiry) ? dateOnlyExpiry : null
  }

  const parsed = Date.parse(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

export function getFeatureExpiryMs(
  featured: Pick<FeaturedRecord, 'expires_at' | 'decision_data'>
): number | null {
  return parseFeatureExpiry(featured.expires_at) ?? parseFeatureExpiry(featured.decision_data?.deadline)
}

export function getFeatureExpiryIso(
  expiresAt: string | null | undefined,
  deadline: string | null | undefined
): string | null {
  const expiryMs = parseFeatureExpiry(expiresAt) ?? parseFeatureExpiry(deadline)
  return expiryMs ? new Date(expiryMs).toISOString() : null
}

export function parseDecisionJson(result: string): Record<string, unknown> | null {
  try {
    const match = result.match(/```json\s*([\s\S]*?)```/)
    if (match) return JSON.parse(match[1])
  } catch {}
  return null
}

export function calculateMispricingScore(data: Record<string, unknown> | null): number {
  if (!data?.options || !Array.isArray(data.options)) return 0

  let maxDiff = 0
  for (const opt of data.options as Array<{ market?: number; ai?: number }>) {
    if (typeof opt.market === 'number' && typeof opt.ai === 'number') {
      maxDiff = Math.max(maxDiff, Math.abs(opt.ai - opt.market))
    }
  }
  return maxDiff
}

export function guessCategory(title: string, data: Record<string, unknown> | null): string {
  const text = `${title} ${data?.event || ''}`.toLowerCase()
  if (/bitcoin|btc|eth|crypto|token|defi|solana/.test(text)) return 'crypto'
  if (/trump|biden|election|president|congress|senate|politi/.test(text)) return 'politics'
  if (/nba|nfl|soccer|football|tennis|sport|game|match|champion|league|cup/.test(text)) return 'sports'
  if (/ai|gpt|openai|claude|model|artificial/.test(text)) return 'ai'
  if (/gdp|inflation|rate|fed|economic|market|stock|oil|yield/.test(text)) return 'economics'
  return 'other'
}

export function getFeaturedSignalStrength(featured: Pick<FeaturedRecord, 'decision_data' | 'mispricing_score'>): number {
  const options = featured.decision_data?.options
  let strongest = 0

  if (Array.isArray(options)) {
    for (const option of options) {
      if (typeof option.market === 'number' && typeof option.ai === 'number') {
        strongest = Math.max(strongest, Math.abs(option.ai - option.market))
      }
    }
  }

  return strongest || Number(featured.mispricing_score || 0)
}

export function hasRenderableDecision(featured: Pick<FeaturedRecord, 'decision_data'>): boolean {
  const options = featured.decision_data?.options
  if (!Array.isArray(options) || options.length === 0) return false

  return options.some((option) => {
    if (typeof option.market !== 'number' || typeof option.ai !== 'number') return false
    return option.market >= 1 && option.market <= 99
  })
}

export function isExpiredFeature(featured: Pick<FeaturedRecord, 'expires_at'>, now = Date.now()): boolean {
  const expiry = getFeatureExpiryMs(featured as Pick<FeaturedRecord, 'expires_at' | 'decision_data'>)
  return expiry !== null && expiry <= now
}

export function isRenderableFeatured(featured: FeaturedRecord, now = Date.now()): boolean {
  return Boolean(
    featured.is_active !== false &&
    !isExpiredFeature(featured, now) &&
    hasRenderableDecision(featured) &&
    getFeaturedSignalStrength(featured) >= 1
  )
}
