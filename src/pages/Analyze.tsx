import React, { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Send, Loader2, AlertCircle, RefreshCw, Sparkles, X, StopCircle, ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import { DecisionCard } from '../components/DecisionCard'
import { AnalysisFlowPanel } from '../components/AnalysisFlowPanel'
import { useAuthStore } from '../store/authStore'
import { useAnalysisStore, useSessionList, type AnalysisSession } from '../store/analysisStore'
import { useToast } from '../components/Toast'
import { formatPolymarketSlugLabel } from '../lib/polymarket'

export const Analyze: React.FC = () => {
  const { t, i18n } = useTranslation()
  const { privyUserId } = useAuthStore()
  const { inputUrl, setUrl, activeSessionId, setActiveSession, startAnalysis, cancelAnalysis, retrySession, removeSession } = useAnalysisStore()
  const sessions = useSessionList()
  const toast = useToast()
  const location = useLocation()
  const prevSessionStatuses = useRef<Record<string, string>>({})
  const workspaceChips = i18n.language === 'zh'
    ? ['多会话并行', '逐步结果流式展示', '历史与重试保留']
    : ['Multi-session runs', 'Progressive result streaming', 'History and retry preserved']
  const workspaceLabel = i18n.language === 'zh' ? '分析工作台' : 'Analysis workspace'

  // Prefill URL from Discovery page navigation
  useEffect(() => {
    const state = location.state as { prefillUrl?: string } | null
    if (state?.prefillUrl) {
      setUrl(state.prefillUrl)
      window.history.replaceState({}, '', location.pathname)
    }
  }, [location.state, setUrl, location.pathname])

  useEffect(() => {
    const pendingUrl = sessionStorage.getItem('polyinsight-pending-url')
    if (pendingUrl) {
      setUrl(pendingUrl)
      sessionStorage.removeItem('polyinsight-pending-url')
    }
  }, [setUrl])

  // Toast on completion
  useEffect(() => {
    for (const s of sessions) {
      const prev = prevSessionStatuses.current[s.id]
      if (prev === 'polling' && s.status === 'completed') {
        toast.success(t('analyze.toast.completed'))
      }
      prevSessionStatuses.current[s.id] = s.status
    }
  }, [sessions, toast])

  const isIdle = sessions.length === 0

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!privyUserId) return

    const res = await startAnalysis()
    if (res.success && !res.silent) {
      toast.info(res.message || t('analyze.toast.started'))
    } else if (res.message) {
      toast.error(res.message)
    }
  }

  return (
    <div
      className={
        `max-w-6xl mx-auto animate-fade-in-up transition-all duration-700 ` +
        (isIdle ? 'pt-[18vh] md:pt-[22vh]' : 'pt-2')
      }
    >
      <div className="space-y-8">
        {/* Input Section */}
        <div className="space-y-6">
          <div className="workspace-frame rounded-[34px] px-5 py-6 md:px-7 md:py-7">
            <div className="text-center space-y-4">
              <div className="workspace-subpanel inline-flex items-center gap-2 rounded-full px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-charcoal/48">
                <Sparkles className="h-3.5 w-3.5 text-terracotta" />
                <span>{workspaceLabel}</span>
              </div>
              <h1 className="text-4xl font-serif text-charcoal transition-all duration-700 md:text-5xl">
                {t('analyze.title')}
              </h1>
              <p className="mx-auto max-w-2xl text-charcoal/60 font-light leading-7">
                {t('analyze.subtitle')}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="mx-auto mt-6 max-w-3xl">
              <div className="relative group">
                <input
                  type="url"
                  id="url"
                  required
                  placeholder={t('analyze.placeholder')}
                  className={`workspace-subpanel block w-full rounded-[24px] py-4 text-charcoal placeholder-charcoal/30 outline-none transition-all duration-200 focus:border-terracotta/40 focus:ring-2 focus:ring-terracotta/12 ${inputUrl ? 'px-6 pr-[7.5rem]' : 'px-6 pr-24'}`}
                  value={inputUrl}
                  onChange={(e) => setUrl(e.target.value)}
                />
                {inputUrl && (
                  <button
                    type="button"
                    onClick={() => setUrl('')}
                    className="absolute right-[5.5rem] top-1/2 -translate-y-1/2 p-1 text-charcoal/30 hover:text-charcoal/60 transition-colors"
                    aria-label="Clear URL"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
                <button
                  type="submit"
                  className="absolute right-2 top-2 bottom-2 px-6 font-medium rounded-[18px] transition-colors duration-200 flex items-center bg-charcoal hover:bg-[#182335] text-white disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_16px_32px_rgba(16,24,38,0.18)]"
                >
                  <Send className="h-5 w-5" />
                </button>
              </div>
            </form>

            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {workspaceChips.map((item) => (
                <span key={item} className="signal-chip rounded-full px-3 py-1.5 text-xs font-semibold text-charcoal/58">
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Session Cards */}
        {sessions.length > 0 && (
          <div className="space-y-5 max-w-4xl mx-auto">
            {sessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                isExpanded={session.id === activeSessionId}
                onToggle={() => setActiveSession(session.id === activeSessionId ? null : session.id)}
                onCancel={() => cancelAnalysis(session.id)}
                onRetry={() => retrySession(session.id)}
                onRemove={() => removeSession(session.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// --- Session Card Component ---

function countSteps(partialResult: string | null): { done: number; total: number } {
  const total = 4
  if (!partialResult) return { done: 0, total }
  const matches = partialResult.match(/<!--STEP:\w+-->/g)
  if (!matches) return { done: 0, total }
  const unique = new Set(matches)
  return { done: Math.min(unique.size, total), total }
}

interface SessionCardProps {
  session: AnalysisSession
  isExpanded: boolean
  onToggle: () => void
  onCancel: () => void
  onRetry: () => void
  onRemove: () => void
}

const SessionCard: React.FC<SessionCardProps> = ({
  session, isExpanded, onToggle, onCancel, onRetry, onRemove,
}) => {
  const { t } = useTranslation()
  const { done, total } = countSteps(session.partialResult)
  const isPolling = session.status === 'polling'
  const isCompleted = session.status === 'completed'
  const isFailed = session.status === 'failed'
  const isCancelled = session.status === 'cancelled'
  const statusLabel =
    isPolling ? t('analyze.status.step', { done, total }) :
    isCompleted ? t('analyze.status.done') :
    isFailed ? t('analyze.status.failed') :
    t('analyze.status.cancelled')
  const statusTone =
    isPolling ? 'tone-caution-badge' :
    isCompleted ? 'tone-safe-badge' :
    isFailed ? 'tone-danger-badge' :
    'tone-reject-badge'

  return (
    <div className="premium-card rounded-[28px] overflow-hidden transition-all duration-300 animate-fade-in-up">
      {/* Header - always visible */}
      <button
        onClick={onToggle}
        className="w-full px-5 py-5 flex items-center gap-4 text-left transition-colors"
      >
        {/* Status indicator */}
        {isCompleted && (
          <div className="w-10 h-10 rounded-2xl tone-safe-surface flex items-center justify-center flex-shrink-0 border">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
          </div>
        )}
        {isPolling && <div className="w-10 h-10 rounded-2xl tone-caution-surface flex items-center justify-center flex-shrink-0 border"><Loader2 className="w-5 h-5 text-terracotta animate-spin" /></div>}
        {isFailed && <div className="w-10 h-10 rounded-2xl tone-danger-surface flex items-center justify-center flex-shrink-0 border"><AlertCircle className="w-5 h-5 text-red-400" /></div>}
        {isCancelled && <div className="w-10 h-10 rounded-2xl tone-reject-surface flex items-center justify-center flex-shrink-0 border"><StopCircle className="w-5 h-5 text-charcoal/40" /></div>}

        {/* URL slug */}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-charcoal truncate">{formatPolymarketSlugLabel(session.url)}</div>
          <div className="mt-1 text-xs text-charcoal/42 font-mono truncate">{session.url}</div>
        </div>

        <span className={`hidden md:inline-flex whitespace-nowrap ${statusTone}`}>
          {statusLabel}
        </span>

        {/* Expand chevron */}
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-charcoal/30 flex-shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-charcoal/30 flex-shrink-0" />
        )}
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-5 pb-5 border-t border-charcoal/5">
          {/* Polling: show progress */}
          {isPolling && (
            <div className="pt-4 space-y-4">
              {session.flow ? (
                <AnalysisFlowPanel flow={session.flow} />
              ) : (
                <div className="workspace-subpanel rounded-[24px] text-center py-8">
                  <Sparkles className="h-6 w-6 text-terracotta animate-pulse mx-auto" />
                  <div className="mt-3 text-sm text-charcoal/60 font-light">
                    {t('analyze.gathering')}
                  </div>
                </div>
              )}
              <div className="flex justify-center">
                <button
                  onClick={(e) => { e.stopPropagation(); onCancel() }}
                  className="theme-surface-button inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium transition-all hover:text-red-500"
                >
                  <StopCircle className="h-4 w-4" />
                  {t('analyze.cancel')}
                </button>
              </div>
            </div>
          )}

          {/* Completed: show result */}
          {isCompleted && session.result && (
            <div className="pt-4 space-y-4">
              <AnalysisFlowPanel flow={session.flow} title={t('analysisFlow.panelTitle', 'Analysis flow')} compact />
              <DecisionCard result={session.result} eventUrl={session.url} />
              <div className="flex justify-center">
                <button
                  onClick={(e) => { e.stopPropagation(); onRemove() }}
                  className="theme-surface-button inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t('analyze.dismiss')}
                </button>
              </div>
            </div>
          )}

          {/* Failed: show error + partial results */}
          {isFailed && (
            <div className="pt-4 space-y-4">
              <div className="workspace-subpanel tone-danger-surface rounded-[24px] p-4 flex items-start gap-3 border">
                <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-red-600">{t('analyze.failed.title')}</h3>
                  <p className="text-sm text-charcoal/70 mt-1">{session.error}</p>
                  {session.canRetry && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onRetry() }}
                      className="mt-3 inline-flex items-center text-sm font-medium text-terracotta hover:text-[#C05638] underline decoration-terracotta/30 hover:decoration-terracotta transition-all"
                    >
                      <RefreshCw className="h-4 w-4 mr-1.5" />
                      {t('analyze.failed.tryAgain')}
                    </button>
                  )}
                </div>
              </div>
              {session.partialResult && (
                <div className="opacity-60">
                  <p className="text-xs text-charcoal/40 mb-2">{t('analyze.failed.partialResults')}</p>
                  <AnalysisFlowPanel flow={session.flow} />
                </div>
              )}
              <div className="flex justify-center">
                <button
                  onClick={(e) => { e.stopPropagation(); onRemove() }}
                  className="theme-surface-button inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t('analyze.dismiss')}
                </button>
              </div>
            </div>
          )}

          {/* Cancelled */}
          {isCancelled && (
            <div className="pt-4 space-y-4">
              <div className="workspace-subpanel rounded-[24px] text-center py-6 text-sm text-charcoal/48">{t('analyze.cancelled')}</div>
              {session.partialResult && (
                <div className="opacity-50">
                  <AnalysisFlowPanel flow={session.flow} />
                </div>
              )}
              <div className="flex justify-center">
                <button
                  onClick={(e) => { e.stopPropagation(); onRemove() }}
                  className="theme-surface-button inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t('analyze.dismiss')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
