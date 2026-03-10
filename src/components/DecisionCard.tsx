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
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    text: 'text-emerald-700',
    badge: 'bg-emerald-100 text-emerald-800',
    descKey: 'decision.risk.safe.desc',
  },
  caution: {
    labelKey: 'decision.risk.caution.label',
    emoji: '🟡',
    icon: Shield,
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-700',
    badge: 'bg-amber-100 text-amber-800',
    descKey: 'decision.risk.caution.desc',
  },
  danger: {
    labelKey: 'decision.risk.danger.label',
    emoji: '🔴',
    icon: ShieldAlert,
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-600',
    badge: 'bg-red-100 text-red-700',
    descKey: 'decision.risk.danger.desc',
  },
  reject: {
    labelKey: 'decision.risk.reject.label',
    emoji: '⚫',
    icon: ShieldX,
    bg: 'bg-gray-100',
    border: 'border-gray-300',
    text: 'text-gray-700',
    badge: 'bg-gray-200 text-gray-800',
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
      <div className="prose prose-lg prose-stone mx-auto bg-white p-8 md:p-12 border border-charcoal/5 rounded-lg shadow-sm">
        <ReactMarkdown>{result}</ReactMarkdown>
      </div>
    )
  }

  const risk = riskConfig[decision.risk] || riskConfig.caution

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Quick Decision Card */}
      <div className={`${risk.bg} border ${risk.border} rounded-xl p-6 space-y-5`}>
        {/* Event Name */}
        <div>
          <h2 className="text-xl font-serif text-charcoal leading-tight">{decision.event}</h2>
          <p className="text-xs text-charcoal/50 mt-1">
            {t('decision.deadline', { date: decision.deadline })}
          </p>
        </div>

        {/* Probability Comparison */}
        <div className="space-y-2">
          {decision.options.map((opt) => {
            const diff = opt.ai - opt.market
            const diffLabel = diff > 0 ? t('decision.undervalued', { diff: Math.abs(diff) }) : diff < 0 ? t('decision.overvalued', { diff: Math.abs(diff) }) : t('decision.even')
            return (
              <div key={opt.name} className="flex items-center justify-between bg-white/60 rounded-lg px-4 py-2.5">
                <span className="font-medium text-charcoal text-sm">{opt.name}</span>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-charcoal/60">
                    {t('decision.market')} <span className="font-mono font-semibold text-charcoal">{opt.market}%</span>
                  </span>
                  <span className="text-charcoal/30">→</span>
                  <span className="text-charcoal/60">
                    {t('decision.ai')} <span className="font-mono font-semibold text-charcoal">{opt.ai}%</span>
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    diff > 0 ? 'bg-emerald-100 text-emerald-700' :
                    diff < 0 ? 'bg-red-100 text-red-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {diffLabel}
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        {/* Risk + Direction */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-lg">{risk.emoji}</span>
            <span className={`text-sm font-medium px-2.5 py-1 rounded-full ${risk.badge}`}>
              {t(risk.labelKey)}
            </span>
            <span className="text-sm text-charcoal/60">— {decision.risk_reason}</span>
          </div>
        </div>

        {/* Recommendation */}
        <div className="bg-white/80 rounded-lg px-4 py-3 border border-charcoal/5">
          <div className="text-sm text-charcoal/60 mb-1">{t('decision.recommendation')}</div>
          <div className="font-medium text-charcoal">{directionMap[decision.direction] ? t(directionMap[decision.direction]) : decision.direction}</div>
          <div className="text-sm text-charcoal/60 mt-1">{decision.recommendation}</div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-charcoal/70 bg-white/60 hover:bg-white border border-charcoal/10 rounded-lg transition-colors"
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
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-terracotta hover:bg-[#C05638] rounded-lg transition-colors"
            >
              {t('decision.viewOnPolymarket')} <ExternalLink className="w-4 h-4" />
            </a>
          )}
        </div>
      </div>

      {/* Expandable Detail */}
      {expanded && detail && (
        <div className="prose prose-stone max-w-none bg-white p-8 border border-charcoal/5 rounded-lg shadow-sm animate-fade-in-up prose-headings:font-serif prose-headings:font-normal prose-h2:text-charcoal prose-p:text-charcoal/80 prose-a:text-terracotta">
          <ReactMarkdown>{detail}</ReactMarkdown>
        </div>
      )}
    </div>
  )
}
