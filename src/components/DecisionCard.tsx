import React, { useState, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronUp, ExternalLink, ShieldCheck, Shield, ShieldAlert, ShieldX } from 'lucide-react'

interface DecisionOption {
  name: string
  market: number
  ai: number
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

interface DecisionCardProps {
  result: string
  eventUrl?: string
}

export const DecisionCard: React.FC<DecisionCardProps> = ({ result, eventUrl }) => {
  const [expanded, setExpanded] = useState(false)
  const { t } = useTranslation()
  const { decision, detail } = useMemo(() => parseResult(result), [result])

  // Fallback: no structured data, just show markdown
  if (!decision) {
    return (
      <div className="workspace-frame mx-auto rounded-[28px] p-8 md:p-10">
        <div className="article-prose">
        <ReactMarkdown>{result}</ReactMarkdown>
        </div>
      </div>
    )
  }

  const risk = riskConfig[decision.risk] || riskConfig.caution
  const RiskIcon = risk.icon

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Quick Decision Card */}
      <div className="premium-card rounded-[30px] p-6 md:p-7 space-y-6">
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
          {decision.options.map((opt) => {
            const diff = opt.ai - opt.market
            const diffLabel = diff > 0 ? t('decision.undervalued', { diff: Math.abs(diff) }) : diff < 0 ? t('decision.overvalued', { diff: Math.abs(diff) }) : t('decision.even')
            return (
              <div key={opt.name} className="workspace-subpanel rounded-[24px] p-4 md:p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold uppercase tracking-[0.18em] text-charcoal/40">{opt.name}</div>
                    <div className="mt-3 flex items-end gap-3">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-charcoal/40">{t('decision.market')}</div>
                        <div className="mt-1 text-2xl font-semibold text-charcoal">{opt.market}%</div>
                      </div>
                      <div className="pb-1 text-charcoal/20">→</div>
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-charcoal/40">{t('decision.ai')}</div>
                        <div className="mt-1 text-2xl font-semibold text-charcoal">{opt.ai}%</div>
                      </div>
                    </div>
                  </div>
                  <span className={`inline-flex self-start rounded-full px-3 py-1.5 text-xs font-semibold ${
                    diff > 0 ? 'tone-safe-badge' :
                    diff < 0 ? 'tone-danger-badge' :
                    'tone-reject-badge'
                  }`}>
                    {diffLabel}
                  </span>
                </div>
              </div>
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
        <div className="workspace-frame rounded-[28px] p-7 md:p-8 animate-fade-in-up">
          <div className="article-prose">
          <ReactMarkdown>{detail}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  )
}
