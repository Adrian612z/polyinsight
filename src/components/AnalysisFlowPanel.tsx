import React from 'react'
import ReactMarkdown from 'react-markdown'
import { useTranslation } from 'react-i18next'
import { Check, Circle, Loader2, AlertTriangle, XCircle, Clock3, ChevronDown, ChevronUp } from 'lucide-react'
import type { AnalysisFlowView, AnalysisFlowStep } from '../lib/analysisFlow'

function labelForStep(step: AnalysisFlowStep, t: ReturnType<typeof useTranslation>['t']) {
  switch (step.key) {
    case 'queued':
      return t('analysisFlow.queued', 'Queued')
    case 'info':
      return t('analysisFlow.info', 'Step 1: Event Structure')
    case 'probability':
      return t('analysisFlow.probability', 'Step 2: Probability Analysis')
    case 'risk':
      return t('analysisFlow.risk', 'Step 3: Risk Audit')
    case 'report':
      return t('analysisFlow.report', 'Step 4: Final Report')
    default:
      return step.label
  }
}

function statusLabel(
  status: AnalysisFlowStep['status'],
  t: ReturnType<typeof useTranslation>['t']
) {
  switch (status) {
    case 'completed':
      return t('progress.status.done')
    case 'running':
      return t('progress.status.inProgress')
    case 'failed':
      return t('analysisFlow.failed', 'Failed')
    case 'cancelled':
      return t('analysisFlow.cancelled', 'Cancelled')
    default:
      return t('progress.status.waiting')
  }
}

function statusIcon(step: AnalysisFlowStep) {
  switch (step.status) {
    case 'completed':
      return (
        <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
          <Check className="w-4 h-4 text-emerald-600" />
        </div>
      )
    case 'running':
      return <Loader2 className="w-6 h-6 text-terracotta animate-spin flex-shrink-0" />
    case 'failed':
      return <AlertTriangle className="w-6 h-6 text-red-500 flex-shrink-0" />
    case 'cancelled':
      return <XCircle className="w-6 h-6 text-charcoal/45 flex-shrink-0" />
    default:
      return <Circle className="w-6 h-6 text-charcoal/20 flex-shrink-0" />
  }
}

interface AnalysisFlowPanelProps {
  flow: AnalysisFlowView | null
  title?: string
  compact?: boolean
}

export const AnalysisFlowPanel: React.FC<AnalysisFlowPanelProps> = ({
  flow,
  title,
  compact = false,
}) => {
  const { t } = useTranslation()
  const [openKeys, setOpenKeys] = React.useState<string[]>([])

  React.useEffect(() => {
    if (!flow?.steps?.length) return
    const defaults = flow.steps
      .filter((step) => (step.content || step.error) && (!compact || step.status === 'failed' || step.status === 'running'))
      .map((step) => step.key)
    setOpenKeys(defaults)
  }, [flow, compact])

  if (!flow || !Array.isArray(flow.steps) || flow.steps.length === 0) {
    return null
  }

  return (
    <div className="space-y-3">
      {title ? (
        <div className="flex items-center gap-2 text-sm font-semibold text-charcoal/72">
          <Clock3 className="w-4 h-4 text-charcoal/40" />
          <span>{title}</span>
        </div>
      ) : null}

      {flow.error ? (
        <div className="workspace-subpanel tone-danger-surface rounded-[20px] px-4 py-3 border">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-red-500/90">
            {t('analysisFlow.errorTitle', 'Execution error')}
          </div>
          <div className="mt-1 text-sm text-charcoal/72">{flow.error}</div>
        </div>
      ) : null}

      <div className="space-y-3">
        {flow.steps.map((step) => {
          const canExpand = Boolean(step.content || step.error)
          const isOpen = openKeys.includes(step.key)

          return (
            <div
              key={step.key}
              className={`workspace-subpanel rounded-[22px] overflow-hidden transition-all ${
                step.status === 'completed' ? 'tone-safe-surface' :
                step.status === 'running' ? 'tone-caution-surface' :
                step.status === 'failed' ? 'tone-danger-surface' :
                step.status === 'cancelled' ? 'tone-reject-surface' :
                ''
              }`}
            >
            <button
              type="button"
              onClick={() => {
                if (!canExpand) return
                setOpenKeys((current) =>
                  current.includes(step.key)
                    ? current.filter((key) => key !== step.key)
                    : [...current, step.key]
                )
              }}
              className="w-full px-4 py-3 flex items-center gap-3 text-left"
            >
              {statusIcon(step)}
              <span className="text-sm font-medium text-charcoal">{labelForStep(step, t)}</span>
              {canExpand ? (
                isOpen ? (
                  <ChevronUp className="w-4 h-4 text-charcoal/35" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-charcoal/35" />
                )
              ) : null}
              <span className="text-xs ml-auto text-charcoal/50">
                {statusLabel(step.status, t)}
              </span>
            </button>

            {canExpand && isOpen && (
              <div className="px-4 pb-4 border-t border-charcoal/5">
                {step.error ? (
                  <div className="mt-3 text-sm leading-6 text-red-600">{step.error}</div>
                ) : step.content ? (
                  <div className="article-prose mt-3 max-h-52 overflow-y-auto">
                    <ReactMarkdown>{step.content}</ReactMarkdown>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        )})}
      </div>
    </div>
  )
}
