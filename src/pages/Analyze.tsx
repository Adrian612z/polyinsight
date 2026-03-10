import React, { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Send, Loader2, AlertCircle, RefreshCw, Sparkles, X, StopCircle, ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import { DecisionCard } from '../components/DecisionCard'
import { ProgressiveResult } from '../components/ProgressiveResult'
import { useAuthStore } from '../store/authStore'
import { useAnalysisStore, useSessionList, type AnalysisSession } from '../store/analysisStore'
import { useToast } from '../components/Toast'

export const Analyze: React.FC = () => {
  const { t } = useTranslation()
  const { privyUserId } = useAuthStore()
  const { inputUrl, setUrl, activeSessionId, setActiveSession, startAnalysis, cancelAnalysis, retrySession, removeSession } = useAnalysisStore()
  const sessions = useSessionList()
  const toast = useToast()
  const location = useLocation()
  const prevSessionStatuses = useRef<Record<string, string>>({})

  // Prefill URL from Discovery page navigation
  useEffect(() => {
    const state = location.state as { prefillUrl?: string } | null
    if (state?.prefillUrl) {
      setUrl(state.prefillUrl)
      window.history.replaceState({}, '', location.pathname)
    }
  }, [location.state, setUrl, location.pathname])

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
    if (res.success) {
      toast.info(res.message || t('analyze.toast.started'))
    } else if (res.message) {
      toast.error(res.message)
    }
  }

  return (
    <div
      className={
        `max-w-4xl mx-auto animate-fade-in-up transition-all duration-700 ` +
        (isIdle ? 'pt-[18vh] md:pt-[22vh]' : 'pt-2')
      }
    >
      <div className="space-y-8">
        {/* Input Section */}
        <div className="space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-4xl font-serif text-charcoal transition-all duration-700">
              {t('analyze.title')}
            </h1>
            <p className="text-charcoal/60 font-light">{t('analyze.subtitle')}</p>
          </div>

          <form onSubmit={handleSubmit} className="max-w-2xl mx-auto">
            <div className="relative group">
              <input
                type="url"
                id="url"
                required
                placeholder={t('analyze.placeholder')}
                className={`block w-full py-4 bg-white border border-charcoal/10 rounded-lg text-charcoal placeholder-charcoal/30 shadow-sm focus:outline-none focus:ring-1 focus:ring-terracotta focus:border-terracotta transition-all duration-200 ${inputUrl ? 'px-6 pr-[7.5rem]' : 'px-6 pr-24'}`}
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
                className="absolute right-2 top-2 bottom-2 px-6 font-medium rounded-md transition-colors duration-200 flex items-center bg-terracotta hover:bg-[#C05638] text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="h-5 w-5" />
              </button>
            </div>
          </form>
        </div>

        {/* Session Cards */}
        {sessions.length > 0 && (
          <div className="space-y-4 max-w-2xl mx-auto">
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

function extractSlug(url: string): string {
  const match = url.match(/polymarket\.com\/event\/([^/?#]+)/)
  return match ? match[1].replace(/-/g, ' ').slice(0, 50) : url.slice(0, 50)
}

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

  return (
    <div className={`border rounded-xl overflow-hidden transition-all duration-300 animate-fade-in-up ${
      isPolling ? 'border-terracotta/20 bg-white shadow-sm' :
      isCompleted ? 'border-emerald-200 bg-white' :
      isFailed ? 'border-red-200 bg-white' :
      'border-charcoal/10 bg-charcoal/[0.02]'
    }`}>
      {/* Header - always visible */}
      <button
        onClick={onToggle}
        className="w-full px-5 py-4 flex items-center gap-3 text-left hover:bg-charcoal/[0.02] transition-colors"
      >
        {/* Status indicator */}
        {isPolling && <Loader2 className="w-5 h-5 text-terracotta animate-spin flex-shrink-0" />}
        {isCompleted && (
          <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
          </div>
        )}
        {isFailed && <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />}
        {isCancelled && <StopCircle className="w-5 h-5 text-charcoal/30 flex-shrink-0" />}

        {/* URL slug */}
        <span className="text-sm text-charcoal truncate flex-1">
          {extractSlug(session.url)}
        </span>

        {/* Step progress / status */}
        <span className={`text-xs font-medium whitespace-nowrap ${
          isPolling ? 'text-terracotta' :
          isCompleted ? 'text-emerald-600' :
          isFailed ? 'text-red-400' :
          'text-charcoal/40'
        }`}>
          {isPolling && t('analyze.status.step', { done, total })}
          {isCompleted && t('analyze.status.done')}
          {isFailed && t('analyze.status.failed')}
          {isCancelled && t('analyze.status.cancelled')}
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
              {session.partialResult ? (
                <ProgressiveResult partialResult={session.partialResult} />
              ) : (
                <div className="text-center py-6">
                  <Sparkles className="h-6 w-6 text-terracotta animate-pulse mx-auto" />
                  <div className="mt-3 text-sm text-charcoal/60 font-light">
                    {t('analyze.gathering')}
                  </div>
                </div>
              )}
              <div className="flex justify-center">
                <button
                  onClick={(e) => { e.stopPropagation(); onCancel() }}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-charcoal/50 bg-white border border-charcoal/10 rounded-lg hover:border-red-300 hover:text-red-500 transition-all"
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
              <DecisionCard result={session.result} eventUrl={session.url} />
              <div className="flex justify-center">
                <button
                  onClick={(e) => { e.stopPropagation(); onRemove() }}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs text-charcoal/40 hover:text-charcoal/60 transition-colors"
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
              <div className="bg-red-50 border border-red-100 rounded-lg p-4 flex items-start gap-3">
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
                  <ProgressiveResult partialResult={session.partialResult} stalled />
                </div>
              )}
              <div className="flex justify-center">
                <button
                  onClick={(e) => { e.stopPropagation(); onRemove() }}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs text-charcoal/40 hover:text-charcoal/60 transition-colors"
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
              <div className="text-center text-sm text-charcoal/40">{t('analyze.cancelled')}</div>
              {session.partialResult && (
                <div className="opacity-50">
                  <ProgressiveResult partialResult={session.partialResult} />
                </div>
              )}
              <div className="flex justify-center">
                <button
                  onClick={(e) => { e.stopPropagation(); onRemove() }}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs text-charcoal/40 hover:text-charcoal/60 transition-colors"
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
