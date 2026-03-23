type FlowRecordStatus = 'pending' | 'completed' | 'failed' | 'cancelled'
type FlowJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | null

export type AnalysisFlowStepStatus =
  | 'waiting'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface AnalysisFlowStep {
  key: 'queued' | 'info' | 'probability' | 'risk' | 'report'
  label: string
  status: AnalysisFlowStepStatus
  content: string | null
  error: string | null
}

export interface AnalysisFlowView {
  overallStatus: FlowRecordStatus
  activeStepKey: AnalysisFlowStep['key'] | null
  error: string | null
  steps: AnalysisFlowStep[]
}

const FLOW_STEP_ORDER: Array<AnalysisFlowStep['key']> = ['queued', 'info', 'probability', 'risk', 'report']

const FLOW_LABELS: Record<AnalysisFlowStep['key'], string> = {
  queued: 'Queued',
  info: 'Step 1: Event Structure',
  probability: 'Step 2: Probability Analysis',
  risk: 'Step 3: Risk Audit',
  report: 'Step 4: Final Report',
}

const LEGACY_STEP_PLACEHOLDER =
  '该记录创建于旧版本，当时未保留此步骤的原始内容。目前只能查看最终报告。'

function parseStepMarkers(analysisResult: string | null): Map<string, string> {
  if (!analysisResult) return new Map()

  const steps = new Map<string, string>()
  const regex = /<!--STEP:(\w+)-->/g
  const markers: Array<{ key: string; index: number; len: number }> = []
  let match: RegExpExecArray | null

  while ((match = regex.exec(analysisResult)) !== null) {
    markers.push({ key: match[1], index: match.index, len: match[0].length })
  }

  for (let index = 0; index < markers.length; index += 1) {
    const start = markers[index].index + markers[index].len
    const end = index + 1 < markers.length ? markers[index + 1].index : analysisResult.length
    steps.set(markers[index].key, analysisResult.slice(start, end).trim())
  }

  return steps
}

export function buildAnalysisFlowView(input: {
  recordStatus: FlowRecordStatus
  analysisResult: string | null
  jobStatus?: FlowJobStatus
  jobError?: string | null
}): AnalysisFlowView {
  const { recordStatus, analysisResult } = input
  const jobStatus = input.jobStatus || null
  const jobError = input.jobError?.trim() || null
  const parsed = parseStepMarkers(analysisResult)

  const reportContent = parsed.get('report')
    || (recordStatus === 'completed' && analysisResult ? analysisResult.trim() : null)

  const markerContent: Record<'info' | 'probability' | 'risk' | 'report', string | null> = {
    info: parsed.get('info') || null,
    probability: parsed.get('probability') || null,
    risk: parsed.get('risk') || null,
    report: reportContent,
  }

  const completedAnalysisSteps = (['info', 'probability', 'risk', 'report'] as const).filter(
    (key) => markerContent[key]
  )
  const hasOnlyFinalReport =
    recordStatus === 'completed' &&
    Boolean(reportContent) &&
    !markerContent.info &&
    !markerContent.probability &&
    !markerContent.risk

  const nextStep = (['info', 'probability', 'risk', 'report'] as const).find(
    (key) => !markerContent[key]
  ) || null

  const steps: AnalysisFlowStep[] = FLOW_STEP_ORDER.map((key) => ({
    key,
    label: FLOW_LABELS[key],
    status: 'waiting',
    content: null,
    error: null,
  }))

  const queuedStep = steps[0]
  if (jobStatus === 'queued' && completedAnalysisSteps.length === 0 && recordStatus === 'pending') {
    queuedStep.status = 'running'
  } else if (recordStatus === 'failed' && completedAnalysisSteps.length === 0 && jobStatus === 'failed') {
    queuedStep.status = 'failed'
    queuedStep.error = jobError
  } else if (recordStatus === 'cancelled' && completedAnalysisSteps.length === 0 && jobStatus === 'cancelled') {
    queuedStep.status = 'cancelled'
    queuedStep.error = jobError
  } else if (jobStatus || completedAnalysisSteps.length > 0 || recordStatus !== 'pending') {
    queuedStep.status = 'completed'
  }

  for (const step of steps.slice(1)) {
    const key = step.key as 'info' | 'probability' | 'risk' | 'report'
    step.content = markerContent[key]
    if (markerContent[key]) {
      step.status = 'completed'
    } else if (hasOnlyFinalReport && key !== 'report') {
      step.content = LEGACY_STEP_PLACEHOLDER
      step.status = 'completed'
    }
  }

  if (recordStatus === 'pending') {
    if (jobStatus === 'running' && nextStep) {
      const target = steps.find((step) => step.key === nextStep)
      if (target) target.status = 'running'
    }
  } else if (recordStatus === 'failed') {
    const failedKey = nextStep || 'report'
    const target = steps.find((step) => step.key === failedKey)
    if (target && target.status !== 'completed') {
      target.status = 'failed'
      target.error = jobError || 'Analysis failed'
    }
  } else if (recordStatus === 'cancelled') {
    const cancelledKey = nextStep || 'report'
    const target = steps.find((step) => step.key === cancelledKey)
    if (target && target.status !== 'completed') {
      target.status = 'cancelled'
      target.error = jobError || 'Analysis cancelled'
    }
  } else if (recordStatus === 'completed') {
    for (const step of steps.slice(1)) {
      if (step.status !== 'completed') {
        step.status = 'completed'
      }
    }
  }

  return {
    overallStatus: recordStatus,
    activeStepKey: steps.find((step) => step.status === 'running')?.key || null,
    error: recordStatus === 'failed' || recordStatus === 'cancelled' ? jobError : null,
    steps,
  }
}
