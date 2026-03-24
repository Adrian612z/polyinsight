import React, { useState, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronUp, ExternalLink, ShieldCheck, Shield, ShieldAlert, ShieldX } from 'lucide-react'

interface DecisionOption {
  name: string
  market: number
  ai: number
  fair_low?: number
  fair_high?: number
  fair_mid?: number
  confidence?: 'low' | 'medium' | 'high'
  sources?: string[]
  rationale?: string
}

interface DecisionData {
  event: string
  deadline: string
  options: DecisionOption[]
  risk: 'safe' | 'caution' | 'danger' | 'reject'
  risk_reason: string
  recommendation: string
  direction: string
}

function parseResult(result: string): { decision: DecisionData | null; detail: string } {
  // Try to extract JSON block from ```json ... ```
  const jsonMatch = result.match(/```json\s*([\s\S]*?)```/)
  if (!jsonMatch) {
    return { decision: null, detail: result }
  }

  try {
    const decision = JSON.parse(jsonMatch[1].trim()) as DecisionData
    // Everything after the JSON block, skip the --- separator
    const afterJson = result.slice(result.indexOf('```', jsonMatch.index! + 6) + 3).trim()
    const detail = afterJson.startsWith('---') ? afterJson.slice(3).trim() : afterJson
    return { decision, detail }
  } catch {
    return { decision: null, detail: result }
  }
}

const riskConfig = {
  safe: {
    labelKey: 'decision.risk.safe.label',
    emoji: '🟢',
    icon: ShieldCheck,
    surface: 'tone-safe-surface',
    badge: 'tone-safe-badge',
    descKey: 'decision.risk.safe.desc',
  },
  caution: {
    labelKey: 'decision.risk.caution.label',
    emoji: '🟡',
    icon: Shield,
    surface: 'tone-caution-surface',
    badge: 'tone-caution-badge',
    descKey: 'decision.risk.caution.desc',
  },
  danger: {
    labelKey: 'decision.risk.danger.label',
    emoji: '🔴',
    icon: ShieldAlert,
    surface: 'tone-danger-surface',
    badge: 'tone-danger-badge',
    descKey: 'decision.risk.danger.desc',
  },
  reject: {
    labelKey: 'decision.risk.reject.label',
    emoji: '⚫',
    icon: ShieldX,
    surface: 'tone-reject-surface',
    badge: 'tone-reject-badge',
    descKey: 'decision.risk.reject.desc',
  },
}

export { parseResult, riskConfig }
export type { DecisionData }

const directionMap: Record<string, string> = {
  'Buy Yes': 'decision.direction.buyYes',
  'Buy No': 'decision.direction.buyNo',
  'Do not participate': 'decision.direction.doNotParticipate',
  'Hold': 'decision.direction.hold',
}

interface OptionGroup {
  key: string
  label: string
  options: Array<DecisionOption & { side: string | null; diff: number; pointEstimate: number }>
}

type GroupOption = OptionGroup['options'][number]
type TFunction = ReturnType<typeof useTranslation>['t']

interface BinaryMarketRenderItem {
  type: 'binary'
  key: string
  title: string | null
  subtitle?: string | null
  yesOption: GroupOption
  noOption: GroupOption
}

interface SingleMarketRenderItem {
  type: 'single'
  key: string
  title: string | null
  subtitle?: string | null
  option: GroupOption
}

type MarketRenderItem = BinaryMarketRenderItem | SingleMarketRenderItem

function formatPercent(value: number): string {
  return `${new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value)}%`
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value))
}

function shouldOmitDeterministicOption(market: number): boolean {
  const roundedMarket = roundToTenth(market)

  const nearZero = roundedMarket < 1
  const nearHundred = roundedMarket > 99

  return nearZero || nearHundred
}

function parseOptionSide(name: string): { label: string; side: string | null } {
  const normalized = name.replace(/\s+[–—-]\s+/g, ' — ').trim()
  const match = normalized.match(/^(.*)\s+—\s+(YES|NO)$/i)

  if (!match) {
    return { label: normalized, side: null }
  }

  return {
    label: match[1].trim(),
    side: match[2].toUpperCase(),
  }
}

function groupDecisionOptions(options: DecisionOption[]): OptionGroup[] {
  const grouped = new Map<string, OptionGroup>()

  for (const option of options) {
    const { label, side } = parseOptionSide(option.name)
    const key = `${label}::${side ?? option.name}`
    const groupKey = side ? label : key
    const existing = grouped.get(groupKey)
    const pointEstimate = getPointEstimate(option)
    const enriched = {
      ...option,
      side,
      pointEstimate,
      diff: pointEstimate - option.market,
    }

    if (existing) {
      existing.options.push(enriched)
      continue
    }

    grouped.set(groupKey, {
      key: groupKey,
      label,
      options: [enriched],
    })
  }

  return Array.from(grouped.values())
}

function getSideOrder(side: string | null): number {
  if (side === 'YES') return 0
  if (side === 'NO') return 1
  return 2
}

function normalizeYesNo(value: string | null | undefined): 'YES' | 'NO' | null {
  if (!value) return null
  const normalized = value.trim().toUpperCase()
  if (normalized === 'YES' || normalized === 'NO') return normalized
  return null
}

function isBinaryYesNoGroup(options: GroupOption[]): boolean {
  if (options.length !== 2) return false
  const sides = options.map((option) => option.side)
  return sides.includes('YES') && sides.includes('NO')
}

function isPlainBinaryPair(groups: OptionGroup[]): boolean {
  if (groups.length !== 2) return false

  const labels = groups.map((group) => {
    if (group.options.length !== 1) return null
    const option = group.options[0]
    const groupName = normalizeYesNo(group.label)
    const optionName = normalizeYesNo(option.name)

    if (!groupName || groupName !== optionName) return null

    return groupName
  })

  return labels.includes('YES') && labels.includes('NO')
}

function getSingleCardTitle(group: OptionGroup, option: GroupOption): string | null {
  if (option.side && normalizeYesNo(group.label) !== normalizeYesNo(option.side)) {
    return group.label
  }

  return option.name.trim() || group.label.trim() || null
}

function getSingleCardSubtitle(group: OptionGroup, option: GroupOption): string | null {
  if (option.side && normalizeYesNo(group.label) !== normalizeYesNo(option.side)) {
    return option.side
  }

  return null
}

function buildMarketRenderItems(groups: OptionGroup[]): MarketRenderItem[] {
  if (isPlainBinaryPair(groups)) {
    const yesGroup = groups.find((group) => normalizeYesNo(group.label) === 'YES')
    const noGroup = groups.find((group) => normalizeYesNo(group.label) === 'NO')

    if (yesGroup?.options[0] && noGroup?.options[0]) {
      return [
        {
          type: 'binary',
          key: 'plain-binary-market',
          title: null,
          subtitle: null,
          yesOption: yesGroup.options[0],
          noOption: noGroup.options[0],
        },
      ]
    }
  }

  const items: MarketRenderItem[] = []

  for (const group of groups) {
    const rankedOptions = [...group.options].sort((a, b) => {
      const sideOrder = getSideOrder(a.side) - getSideOrder(b.side)
      if (sideOrder !== 0) return sideOrder
      return 0
    })

    if (isBinaryYesNoGroup(rankedOptions)) {
      const yesOption = rankedOptions.find((option) => option.side === 'YES')
      const noOption = rankedOptions.find((option) => option.side === 'NO')

      if (yesOption && noOption) {
        items.push({
          type: 'binary',
          key: group.key,
          title: group.label,
          subtitle: null,
          yesOption,
          noOption,
        })
        continue
      }
    }

    for (const option of rankedOptions) {
      items.push({
        type: 'single',
        key: `${group.key}:${option.name}`,
        title: getSingleCardTitle(group, option),
        subtitle: getSingleCardSubtitle(group, option),
        option,
      })
    }
  }

  return items
}

function getPointEstimate(option: DecisionOption): number {
  if (typeof option.fair_mid === 'number') return option.fair_mid
  return option.ai
}

function getConfidenceKey(value: DecisionOption['confidence'] | undefined): string {
  switch (value) {
    case 'low':
      return 'decision.confidence.low'
    case 'high':
      return 'decision.confidence.high'
    default:
      return 'decision.confidence.medium'
  }
}

function MetricChips({
  market,
  ai,
  t,
}: {
  market: number
  ai: number
  t: TFunction
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm md:justify-end">
      <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-charcoal/8 bg-white/72 px-3 py-1.5 font-semibold text-charcoal/72">
        <span className="h-2.5 w-2.5 rounded-full bg-charcoal shadow-[0_0_0_3px_rgba(255,255,255,0.65)]" />
        {t('decision.market')} {formatPercent(market)}
      </span>
      <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-[#8b5cf6]/18 bg-white/72 px-3 py-1.5 font-semibold text-charcoal/72">
        <span className="relative h-3 w-3 rounded-full border-2 border-[#8b5cf6] bg-white shadow-[0_0_0_4px_rgba(139,92,246,0.12)]">
          <span className="absolute inset-[3px] rounded-full bg-[#8b5cf6]" />
        </span>
        {t('decision.ai')} {formatPercent(ai)}
      </span>
    </div>
  )
}

function ProbabilityAxis({
  market,
  ai,
}: {
  market: number
  ai: number
}) {
  const marketPosition = clampPercent(market)
  const aiPosition = clampPercent(ai)
  const left = Math.min(marketPosition, aiPosition)
  const width = Math.max(Math.abs(aiPosition - marketPosition), 2)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.18em] text-charcoal/52">
        <span>NO</span>
        <span>YES</span>
      </div>

      <div>
        <div className="relative px-1">
          <div className="h-3 rounded-full bg-charcoal/[0.08] shadow-[inset_0_1px_2px_rgba(15,23,42,0.08)]" />
          <div
            className="absolute top-1/2 h-3 -translate-y-1/2 rounded-full bg-gradient-to-r from-[#fb7185]/30 via-[#a855f7]/24 to-[#8b5cf6]/30"
            style={{
              left: `${left}%`,
              width: `${width}%`,
            }}
          />
          <div
            className="absolute top-1/2 z-[1] h-4 w-4 -translate-y-1/2 rounded-full bg-charcoal shadow-[0_0_0_4px_rgba(255,255,255,0.8)]"
            style={{ left: `calc(${marketPosition}% - 8px)` }}
          />
          <div
            className="absolute top-1/2 z-[2] h-5 w-5 -translate-y-1/2 rounded-full border-2 border-[#8b5cf6] bg-white shadow-[0_0_0_5px_rgba(139,92,246,0.12)]"
            style={{ left: `calc(${aiPosition}% - 10px)` }}
          >
            <div className="absolute inset-[4px] rounded-full bg-[#8b5cf6]" />
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between px-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-charcoal/32">
          <span>0%</span>
          <span>100%</span>
        </div>
      </div>
    </div>
  )
}

function InsightBlock({
  option,
  pointEstimate,
  t,
}: {
  option: GroupOption
  pointEstimate: number
  t: TFunction
}) {
  const hasMeta =
    typeof option.fair_low === 'number' ||
    typeof option.fair_high === 'number' ||
    Boolean(option.confidence) ||
    (Array.isArray(option.sources) && option.sources.length > 0) ||
    Boolean(option.rationale)

  if (!hasMeta) {
    return null
  }

  return (
    <div className="mt-5 border-t border-charcoal/6 pt-5">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2 text-xs font-semibold text-charcoal/66">
          {typeof option.fair_low === 'number' && typeof option.fair_high === 'number' && (
            <span className="inline-flex items-center rounded-full border border-charcoal/8 bg-white/70 px-3 py-1.5">
              {t('decision.fairRange')} {formatPercent(option.fair_low)} - {formatPercent(option.fair_high)}
            </span>
          )}
          <span className="inline-flex items-center rounded-full border border-charcoal/8 bg-white/70 px-3 py-1.5">
            {t('decision.midEstimate')} {formatPercent(pointEstimate)}
          </span>
          {option.confidence && (
            <span className="inline-flex items-center rounded-full border border-charcoal/8 bg-white/70 px-3 py-1.5">
              {t('decision.confidence')} {t(getConfidenceKey(option.confidence))}
            </span>
          )}
        </div>

        {option.rationale && (
          <p className="text-sm leading-7 text-charcoal/66">
            {option.rationale}
          </p>
        )}

        {Array.isArray(option.sources) && option.sources.length > 0 && (
          <div className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-charcoal/38">
              {t('decision.sources')}
            </div>
            <div className="flex flex-wrap gap-2">
              {option.sources.slice(0, 4).map((source) => (
                <span
                  key={`${option.name}-${source}`}
                  className="inline-flex items-center rounded-full border border-charcoal/8 bg-white/70 px-3 py-1.5 text-xs font-medium text-charcoal/62"
                >
                  {source}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function MarketCard({
  title,
  subtitle,
  market,
  ai,
  detailOption,
  t,
}: {
  title: string | null
  subtitle?: string | null
  market: number
  ai: number
  detailOption: GroupOption
  t: TFunction
}) {
  return (
    <div className="workspace-subpanel rounded-[24px] p-4 md:p-5">
      <div className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            {subtitle ? (
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-charcoal/40">
                {subtitle}
              </div>
            ) : null}
            {title ? (
              <div className={`${subtitle ? 'mt-2' : ''} text-2xl font-serif font-semibold tracking-[-0.02em] text-charcoal/88 md:text-[2rem]`}>
                {title}
              </div>
            ) : null}
          </div>

          <MetricChips market={market} ai={ai} t={t} />
        </div>

        <div className="rounded-[22px] border border-charcoal/8 bg-white/44 px-4 py-4 md:px-5">
          <ProbabilityAxis market={market} ai={ai} />
          <InsightBlock option={detailOption} pointEstimate={ai} t={t} />
        </div>
      </div>
    </div>
  )
}

interface DecisionCardProps {
  result: string
  eventUrl?: string
  embedded?: boolean
}

export const DecisionCard: React.FC<DecisionCardProps> = ({ result, eventUrl, embedded = false }) => {
  const [expanded, setExpanded] = useState(false)
  const { t } = useTranslation()
  const { decision, detail } = useMemo(() => parseResult(result), [result])
  const { marketCards, hiddenOptionCount } = useMemo(
    () => {
      if (!decision) {
        return { marketCards: [], hiddenOptionCount: 0 }
      }

      let omitted = 0
      const visibleGroups = groupDecisionOptions(decision.options)
        .map((group) => {
          const visibleOptions = group.options.filter((option) => {
            const shouldHide = shouldOmitDeterministicOption(option.market)

            if (shouldHide) {
              omitted += 1
            }

            return !shouldHide
          })

          return {
            ...group,
            options: visibleOptions,
          }
        })
        .filter((group) => group.options.length > 0)

      return {
        marketCards: buildMarketRenderItems(visibleGroups),
        hiddenOptionCount: omitted,
      }
    },
    [decision]
  )

  // Fallback: no structured data, just show markdown
  if (!decision) {
    return (
      <div className={embedded ? 'article-prose' : 'workspace-frame mx-auto rounded-[28px] p-8 md:p-10'}>
        <div className="article-prose">
        <ReactMarkdown>{result}</ReactMarkdown>
        </div>
      </div>
    )
  }

  const risk = riskConfig[decision.risk] || riskConfig.caution
  const RiskIcon = risk.icon

  return (
    <div className={embedded ? 'space-y-5' : 'max-w-3xl mx-auto space-y-5'}>
      {/* Quick Decision Card */}
      <div className={embedded ? 'space-y-6' : 'premium-card rounded-[30px] p-6 md:p-7 space-y-6'}>
        {/* Event Name */}
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <div className="section-label">Decision</div>
            <h2 className="text-2xl font-serif text-charcoal leading-tight md:text-[2rem]">{decision.event}</h2>
            <p className="text-sm text-charcoal/52">
              {t('decision.deadline', { date: decision.deadline })}
            </p>
          </div>
          <div className={`inline-flex items-center gap-2 self-start rounded-full px-3 py-2 ${risk.badge}`}>
            <RiskIcon className="h-4 w-4" />
            <span>{t(risk.labelKey)}</span>
          </div>
        </div>

        {/* Probability Comparison */}
        <div className="grid gap-3">
          {hiddenOptionCount > 0 && (
            <div className="workspace-subpanel rounded-[22px] px-4 py-3 text-sm leading-6 text-charcoal/62">
              {t('decision.omittedCertain', { count: hiddenOptionCount })}
            </div>
          )}

          {marketCards.map((item) => {
            if (item.type === 'binary') {
              return (
                <MarketCard
                  key={item.key}
                  title={item.title}
                  subtitle={item.subtitle}
                  market={item.yesOption.market}
                  ai={item.yesOption.pointEstimate}
                  detailOption={item.yesOption}
                  t={t}
                />
              )
            }

            return (
              <MarketCard
                key={item.key}
                title={item.title}
                subtitle={item.subtitle}
                market={item.option.market}
                ai={item.option.pointEstimate}
                detailOption={item.option}
                t={t}
              />
            )
          })}
        </div>

        {/* Risk + Direction */}
        <div className={`workspace-subpanel rounded-[24px] p-4 ${risk.surface}`}>
          <div className="flex items-start gap-3">
            <div className="mt-0.5 text-lg">{risk.emoji}</div>
            <div>
              <div className="text-sm font-semibold text-charcoal">{t(risk.labelKey)}</div>
              <p className="mt-1 text-sm leading-6 text-charcoal/68">{decision.risk_reason}</p>
            </div>
          </div>
        </div>

        {/* Recommendation */}
        <div className="workspace-subpanel rounded-[24px] px-4 py-4 md:px-5">
          <div className="section-label mb-2">{t('decision.recommendation')}</div>
          <div className="font-semibold text-charcoal text-lg">
            {directionMap[decision.direction] ? t(directionMap[decision.direction]) : decision.direction}
          </div>
          <div className="text-sm text-charcoal/62 mt-2 leading-6">{decision.recommendation}</div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={() => setExpanded(!expanded)}
            className="theme-surface-button flex-1 inline-flex items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-medium transition-colors"
          >
            {expanded ? (
              <>{t('decision.hideDetails')} <ChevronUp className="w-4 h-4" /></>
            ) : (
              <>{t('decision.showDetails')} <ChevronDown className="w-4 h-4" /></>
            )}
          </button>
          {eventUrl && (
            <a
              href={eventUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="theme-contrast-button inline-flex items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-medium transition-colors"
            >
              {t('decision.viewOnPolymarket')} <ExternalLink className="w-4 h-4" />
            </a>
          )}
        </div>
      </div>

      {/* Expandable Detail */}
      {expanded && detail && (
        <div className={embedded ? 'workspace-subpanel rounded-[24px] p-6 md:p-7 animate-fade-in-up' : 'workspace-frame rounded-[28px] p-7 md:p-8 animate-fade-in-up'}>
          <div className="article-prose">
          <ReactMarkdown>{detail}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  )
}
