import React, { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { Send, Loader2, AlertCircle, RefreshCw, Sparkles, X, Plus } from 'lucide-react'
import { DecisionCard } from '../components/DecisionCard'
import { ProgressiveResult } from '../components/ProgressiveResult'
import { useAuthStore } from '../store/authStore'
import { useAnalysisStore } from '../store/analysisStore'
import { useToast } from '../components/Toast'

export const Analyze: React.FC = () => {
  const { privyUserId } = useAuthStore()
  const { url, setUrl, loading, result, partialResult, error, canRetry, pollingStatus, startAnalysis, retry, reset } = useAnalysisStore()
  const toast = useToast()
  const location = useLocation()
  const prevPollingStatus = useRef(pollingStatus)

  // Prefill URL from Discovery page navigation
  useEffect(() => {
    const state = location.state as { prefillUrl?: string } | null
    if (state?.prefillUrl) {
      setUrl(state.prefillUrl)
      window.history.replaceState({}, '', location.pathname)
    }
  }, [location.state, setUrl, location.pathname])

  const isIdle = !loading && !result && !error

  useEffect(() => {
    if (prevPollingStatus.current === 'polling' && pollingStatus === 'completed') {
      toast.success('Analysis completed!')
    }
    prevPollingStatus.current = pollingStatus
  }, [pollingStatus, toast])

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!privyUserId) return

    const res = await startAnalysis()
    if (res.success) {
      toast.info(res.message || 'Analysis started...')
    } else if (res.message) {
      toast.error(res.message)
    }
  }

  const handleRetry = async () => {
    if (!privyUserId) return

    const res = await retry()
    if (res.success) {
      toast.success(res.message || 'Analysis completed!')
    } else if (res.message) {
      toast.error(res.message)
    }
  }

  const handleNewAnalysis = () => {
    reset()
  }

  return (
    <div
      className={
        `max-w-4xl mx-auto animate-fade-in-up transition-all duration-700 ` +
        (isIdle ? 'pt-[18vh] md:pt-[22vh]' : 'pt-2')
      }
    >
      <div className="space-y-12">
        {/* Input Section - Minimalist */}
        <div className="space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-4xl font-serif text-charcoal transition-all duration-700">
              Analyze Event
            </h1>
            <p className="text-charcoal/60 font-light">Paste a Polymarket event URL to get started.</p>
          </div>

          <form onSubmit={handleSubmit} className="max-w-2xl mx-auto">
            <div className="relative group">
              <input
                type="url"
                id="url"
                required
                placeholder="https://polymarket.com/event/..."
                className={`block w-full py-4 bg-white border border-charcoal/10 rounded-lg text-charcoal placeholder-charcoal/30 shadow-sm focus:outline-none focus:ring-1 focus:ring-terracotta focus:border-terracotta transition-all duration-200 ${url ? 'px-6 pr-[7.5rem]' : 'px-6 pr-24'}`}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              {url && !loading && (
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
                disabled={loading}
                className={`absolute right-2 top-2 bottom-2 px-6 font-medium rounded-md transition-colors duration-200 flex items-center ${
                  loading
                    ? 'bg-charcoal/5 text-charcoal/40 cursor-default'
                    : 'bg-terracotta hover:bg-[#C05638] text-white disabled:opacity-50 disabled:cursor-not-allowed'
                }`}
              >
                {loading ? (
                  <>
                    <Loader2 className="animate-spin h-5 w-5 mr-2" />
                    Analyzing...
                  </>
                ) : (
                  <Send className="h-5 w-5" />
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Progressive Analysis / Waiting Section */}
        {loading && (
          partialResult ? (
            <ProgressiveResult partialResult={partialResult} />
          ) : (
            <div className="max-w-2xl mx-auto text-center py-10">
              <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-terracotta/10">
                <Sparkles className="h-6 w-6 text-terracotta animate-pulse" />
              </div>
              <div className="mt-4 space-y-1">
                <div className="text-lg font-serif text-charcoal">Analyzing...</div>
                <div className="text-sm text-charcoal/60 font-light">
                  Gathering market sentiment and related news. This may take a moment.
                </div>
              </div>
            </div>
          )
        )}

      {/* Error State */}
      {error && (
        <div className="max-w-2xl mx-auto bg-terracotta/5 border border-terracotta/20 rounded-lg p-4 animate-shake flex items-start gap-4">
          <AlertCircle className="h-5 w-5 text-terracotta flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-medium text-terracotta">Analysis Failed</h3>
            <p className="text-sm text-charcoal/70 mt-1">{error}</p>
            {canRetry && (
              <button
                onClick={handleRetry}
                disabled={loading}
                className="mt-3 inline-flex items-center text-sm font-medium text-terracotta hover:text-[#C05638] underline decoration-terracotta/30 hover:decoration-terracotta transition-all"
              >
                <RefreshCw className="h-4 w-4 mr-1.5" />
                Try again
              </button>
            )}
          </div>
        </div>
      )}

      {/* Result Display - Decision Card */}
      {result && (
        <>
          <DecisionCard result={result} eventUrl={url} />
          <div className="flex justify-center pt-2 pb-8">
            <button
              onClick={handleNewAnalysis}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-charcoal/70 bg-white border border-charcoal/10 rounded-lg hover:border-terracotta/30 hover:text-terracotta transition-all"
            >
              <Plus className="h-4 w-4" />
              Analyze Another Event
            </button>
          </div>
        </>
      )}
      </div>
    </div>
  )
}
