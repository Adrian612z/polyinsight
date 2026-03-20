import React from 'react'
import ReactMarkdown from 'react-markdown'
import { useTranslation } from 'react-i18next'
import { Check, Loader2, Circle, AlertTriangle } from 'lucide-react'

const ALL_STEPS = ['info', 'probability', 'risk', 'report']

function parseSteps(partialResult: string): Map<string, string> {
  const steps = new Map<string, string>()
  const regex = /<!--STEP:(\w+)-->/g
  let match
  const markers: { key: string; index: number; len: number }[] = []

  while ((match = regex.exec(partialResult)) !== null) {
    markers.push({ key: match[1], index: match.index, len: match[0].length })
  }

  for (let i = 0; i < markers.length; i++) {
    const start = markers[i].index + markers[i].len
    const end = i + 1 < markers.length ? markers[i + 1].index : partialResult.length
    steps.set(markers[i].key, partialResult.slice(start, end).trim())
  }

  return steps
}

interface ProgressiveResultProps {
  partialResult: string
  stalled?: boolean
}

export const ProgressiveResult: React.FC<ProgressiveResultProps> = ({ partialResult, stalled }) => {
  const { t } = useTranslation()
  const completedSteps = parseSteps(partialResult)
  const completedKeys = Array.from(completedSteps.keys())
  const currentStepIndex = completedKeys.length

  return (
    <div className="max-w-2xl mx-auto space-y-3">
      {ALL_STEPS.map((stepKey, index) => {
        const content = completedSteps.get(stepKey)
        const isDone = content !== undefined
        const isInProgress = index === currentStepIndex

        return (
          <div
            key={stepKey}
            className={`rounded-2xl overflow-hidden transition-all duration-300 workspace-subpanel ${
              isDone ? 'tone-safe-surface' :
              isInProgress ? (stalled ? 'tone-caution-surface' : 'tone-caution-surface') :
              ''
            }`}
          >
            {/* Step Header */}
            <div className="px-4 py-3 flex items-center gap-3">
              {isDone ? (
                <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                  <Check className="w-4 h-4 text-emerald-600" />
                </div>
              ) : isInProgress ? (
                stalled ? (
                  <AlertTriangle className="w-6 h-6 text-amber-500 flex-shrink-0" />
                ) : (
                  <Loader2 className="w-6 h-6 text-terracotta animate-spin flex-shrink-0" />
                )
              ) : (
                <Circle className="w-6 h-6 text-charcoal/20 flex-shrink-0" />
              )}
              <span className={`text-sm font-medium ${
                isDone ? 'text-charcoal' :
                isInProgress ? (stalled ? 'text-amber-600' : 'text-terracotta') :
                'text-charcoal/40'
              }`}>
                {t('progress.' + stepKey)}
              </span>
              <span className={`text-xs ml-auto ${
                isDone ? 'text-emerald-600' :
                isInProgress ? (stalled ? 'text-amber-500' : 'text-terracotta animate-pulse') :
                'text-charcoal/30'
              }`}>
                {isDone ? t('progress.status.done') : isInProgress ? (stalled ? t('progress.status.stalled') : t('progress.status.inProgress')) : t('progress.status.waiting')}
              </span>
            </div>

            {/* Step Content (only for completed steps) */}
            {isDone && content && (
              <div className="px-4 pb-4 border-t border-charcoal/5">
                <div className="article-prose mt-3 max-h-52 overflow-y-auto">
                  <ReactMarkdown>{content}</ReactMarkdown>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
