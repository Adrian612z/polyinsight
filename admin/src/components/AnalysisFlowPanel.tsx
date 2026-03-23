import React from 'react'
import ReactMarkdown from 'react-markdown'
import { Check, Circle, Loader2, AlertTriangle, XCircle, Clock3, ChevronDown, ChevronUp } from 'lucide-react'

interface AnalysisFlowStep {
  key: 'queued' | 'info' | 'probability' | 'risk' | 'report'
  label: string
  status: 'waiting' | 'running' | 'completed' | 'failed' | 'cancelled'
  content: string | null
  error: string | null
}

interface AnalysisFlowView {
  overallStatus: 'pending' | 'completed' | 'failed' | 'cancelled'
  activeStepKey: AnalysisFlowStep['key'] | null
  error: string | null
  steps: AnalysisFlowStep[]
}

function stepLabel(step: AnalysisFlowStep) {
  switch (step.key) {
    case 'queued':
      return '排队中'
    case 'info':
      return 'Step 1: 结构提取'
    case 'probability':
      return 'Step 2: 概率分析'
    case 'risk':
      return 'Step 3: 风险审计'
    case 'report':
      return 'Step 4: 最终报告'
    default:
      return step.label
  }
}

function statusIcon(step: AnalysisFlowStep) {
  switch (step.status) {
    case 'completed':
      return <Check className="w-4 h-4 text-emerald-600" />
    case 'running':
      return <Loader2 className="w-4 h-4 text-amber-600 animate-spin" />
    case 'failed':
      return <AlertTriangle className="w-4 h-4 text-red-500" />
    case 'cancelled':
      return <XCircle className="w-4 h-4 text-gray-500" />
    default:
      return <Circle className="w-4 h-4 text-gray-300" />
  }
}

function statusText(status: AnalysisFlowStep['status']) {
  switch (status) {
    case 'completed':
      return '完成'
    case 'running':
      return '进行中'
    case 'failed':
      return '失败'
    case 'cancelled':
      return '已取消'
    default:
      return '等待中'
  }
}

export function AnalysisFlowPanel({ flow }: { flow: AnalysisFlowView | null | undefined }) {
  const [openKeys, setOpenKeys] = React.useState<string[]>([])

  React.useEffect(() => {
    if (!flow?.steps?.length) return
    const defaults = flow.steps
      .filter((step) => step.status === 'running' || step.status === 'failed' || step.key === 'report')
      .filter((step) => step.content || step.error)
      .map((step) => step.key)
    setOpenKeys(defaults)
  }, [flow])

  if (!flow?.steps?.length) return null

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
        <Clock3 className="w-4 h-4 text-gray-400" />
        <span>执行流程</span>
      </div>

      {flow.error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {flow.error}
        </div>
      )}

      <div className="space-y-3">
        {flow.steps.map((step) => {
          const canExpand = Boolean(step.content || step.error)
          const isOpen = openKeys.includes(step.key)

          return (
          <div key={step.key} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
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
              className="w-full px-4 py-3 flex items-center gap-3 bg-gray-50 text-left"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white border border-gray-200">
                {statusIcon(step)}
              </div>
              <div className="text-sm font-medium text-gray-900">{stepLabel(step)}</div>
              {canExpand ? (
                isOpen ? (
                  <ChevronUp className="w-4 h-4 text-gray-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                )
              ) : null}
              <div className="ml-auto text-xs text-gray-500">{statusText(step.status)}</div>
            </button>

            {canExpand && isOpen && (
              <div className="px-4 py-4">
                {step.error ? (
                  <div className="text-sm leading-6 text-red-600">{step.error}</div>
                ) : step.content ? (
                  <div className="prose prose-sm max-w-none max-h-64 overflow-y-auto">
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
