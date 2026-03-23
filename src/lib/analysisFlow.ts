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
  overallStatus: 'pending' | 'completed' | 'failed' | 'cancelled'
  activeStepKey: AnalysisFlowStep['key'] | null
  error: string | null
  steps: AnalysisFlowStep[]
}

export const ANALYSIS_FLOW_STEP_KEYS: AnalysisFlowStep['key'][] = [
  'queued',
  'info',
  'probability',
  'risk',
  'report',
]
