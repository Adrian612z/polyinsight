import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '../lib/supabase'
import { api } from '../lib/backend'
import { useAuthStore } from './authStore'

// --- Types ---

export interface AnalysisSession {
  id: string              // record_id from backend
  url: string
  status: 'polling' | 'completed' | 'failed' | 'cancelled'
  result: string | null
  partialResult: string | null
  error: string | null
  canRetry: boolean
  startedAt: number
}

interface AnalysisState {
  inputUrl: string
  sessions: Record<string, AnalysisSession>
  activeSessionId: string | null
}

interface AnalysisActions {
  setUrl: (url: string) => void
  startAnalysis: () => Promise<{ success: boolean; message?: string; recordId?: string }>
  cancelAnalysis: (recordId?: string) => Promise<void>
  retrySession: (recordId: string) => Promise<{ success: boolean; message?: string }>
  removeSession: (recordId: string) => void
  setActiveSession: (recordId: string | null) => void
  reset: () => void
  stopAllPolling: () => void
}

type AnalysisStore = AnalysisState & AnalysisActions

// --- Constants ---

const POLL_INTERVAL = 3000
const MAX_POLL_TIME = 5 * 60 * 1000       // 5 minutes (reduced from 10)
const STALE_THRESHOLD = 90_000             // 90 seconds no progress = stalled

// --- Module-level timer + progress tracking ---

const pollTimers = new Map<string, ReturnType<typeof setTimeout>>()
const lastProgress = new Map<string, { result: string | null; time: number }>()

function stopSessionPolling(recordId: string) {
  const timer = pollTimers.get(recordId)
  if (timer) {
    clearTimeout(timer)
    pollTimers.delete(recordId)
  }
  lastProgress.delete(recordId)
}

const STEP_LABELS: Record<string, string> = {
  info: 'Event Info Extraction',
  probability: 'Probability Analysis',
  risk: 'Risk Control Audit',
  report: 'Report Writer',
}

function getTimeoutMessage(partialResult: string | null): string {
  if (!partialResult) return 'Analysis failed to start. The workflow may be unavailable.'
  const stepKeys: string[] = []
  const regex = /<!--STEP:(\w+)-->/g
  let m
  while ((m = regex.exec(partialResult)) !== null) stepKeys.push(m[1])
  if (stepKeys.length === 0) return 'Analysis failed during initialization.'
  if (stepKeys.length >= 4) return 'Analysis nearly complete but the final report was not generated.'
  const lastStep = STEP_LABELS[stepKeys[stepKeys.length - 1]] || stepKeys[stepKeys.length - 1]
  return `Analysis stalled after "${lastStep}". Partial results are shown below.`
}

// --- Initial state ---

const initialState: AnalysisState = {
  inputUrl: '',
  sessions: {},
  activeSessionId: null,
}

// --- Store ---

export const useAnalysisStore = create<AnalysisStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      setUrl: (url) => set({ inputUrl: url }),

      setActiveSession: (recordId) => set({ activeSessionId: recordId }),

      stopAllPolling: () => {
        for (const [id] of pollTimers) {
          stopSessionPolling(id)
        }
      },

      removeSession: (recordId) => {
        stopSessionPolling(recordId)
        const { sessions, activeSessionId } = get()
        const next = { ...sessions }
        delete next[recordId]
        set({
          sessions: next,
          activeSessionId: activeSessionId === recordId ? null : activeSessionId,
        })
      },

      cancelAnalysis: async (recordId?) => {
        const { sessions, activeSessionId } = get()
        const targetId = recordId || activeSessionId
        if (!targetId || !sessions[targetId]) return

        stopSessionPolling(targetId)

        set({
          sessions: {
            ...get().sessions,
            [targetId]: {
              ...sessions[targetId],
              status: 'cancelled',
              error: null,
            },
          },
        })

        try {
          await supabase
            .from('analysis_records')
            .update({ status: 'cancelled' })
            .eq('id', targetId)
        } catch (err) {
          console.error('Failed to cancel analysis record:', err)
        }
      },

      startAnalysis: async () => {
        const { inputUrl } = get()

        if (!inputUrl) {
          return { success: false, message: 'Please enter a URL' }
        }

        // Clear input immediately so user can type next URL
        set({ inputUrl: '' })

        try {
          const res = await api.createAnalysis(inputUrl)
          const recordId = res.record_id

          // Update credit balance
          if (typeof res.remaining_balance === 'number') {
            useAuthStore.getState().setCreditBalance(res.remaining_balance)
          }

          // Create new session
          const session: AnalysisSession = {
            id: recordId,
            url: inputUrl,
            status: 'polling',
            result: null,
            partialResult: null,
            error: null,
            canRetry: false,
            startedAt: Date.now(),
          }

          set({
            sessions: { ...get().sessions, [recordId]: session },
            activeSessionId: recordId,
          })

          // Start polling for this session
          lastProgress.set(recordId, { result: null, time: Date.now() })

          const pollForResult = async () => {
            const { sessions } = get()
            const s = sessions[recordId]
            if (!s || s.status !== 'polling') return

            const elapsed = Date.now() - s.startedAt

            // Timeout check
            if (elapsed > MAX_POLL_TIME) {
              stopSessionPolling(recordId)
              set({
                sessions: {
                  ...get().sessions,
                  [recordId]: {
                    ...s,
                    status: 'failed',
                    error: getTimeoutMessage(s.partialResult),
                    canRetry: true,
                  },
                },
              })
              return
            }

            // Staleness check
            const progress = lastProgress.get(recordId)
            if (progress && s.partialResult && elapsed > 30_000) {
              if (Date.now() - progress.time > STALE_THRESHOLD) {
                stopSessionPolling(recordId)
                set({
                  sessions: {
                    ...get().sessions,
                    [recordId]: {
                      ...s,
                      status: 'failed',
                      error: getTimeoutMessage(s.partialResult),
                      canRetry: true,
                    },
                  },
                })
                return
              }
            }

            try {
              const { data, error } = await supabase
                .from('analysis_records')
                .select('status, analysis_result')
                .eq('id', recordId)
                .single()

              if (error) throw error

              if (data.status === 'completed' && data.analysis_result) {
                stopSessionPolling(recordId)
                set({
                  sessions: {
                    ...get().sessions,
                    [recordId]: {
                      ...s,
                      status: 'completed',
                      result: data.analysis_result,
                      partialResult: null,
                    },
                  },
                })
                return
              }

              if (data.status === 'failed') {
                stopSessionPolling(recordId)
                set({
                  sessions: {
                    ...get().sessions,
                    [recordId]: {
                      ...s,
                      status: 'failed',
                      error: getTimeoutMessage(s.partialResult),
                      canRetry: true,
                    },
                  },
                })
                return
              }

              // Update partial result + progress tracking
              if (data.analysis_result) {
                const prev = lastProgress.get(recordId)
                if (!prev || prev.result !== data.analysis_result) {
                  lastProgress.set(recordId, { result: data.analysis_result, time: Date.now() })
                }
                set({
                  sessions: {
                    ...get().sessions,
                    [recordId]: { ...get().sessions[recordId], partialResult: data.analysis_result },
                  },
                })
              }

              pollTimers.set(recordId, setTimeout(pollForResult, POLL_INTERVAL))
            } catch (err) {
              console.error('Polling error:', err)
              pollTimers.set(recordId, setTimeout(pollForResult, POLL_INTERVAL))
            }
          }

          pollTimers.set(recordId, setTimeout(pollForResult, 2000))

          return { success: true, message: 'Analysis started...', recordId }
        } catch (err: unknown) {
          console.error('Analysis error:', err)
          // Restore URL on failure so user doesn't lose it
          set({ inputUrl: inputUrl })

          const error = err as Error & { status?: number; code?: string }
          let errorMsg = error.message || 'Request failed'
          if (error.status === 402) {
            errorMsg = 'Insufficient credits. Please top up to continue.'
          }

          return { success: false, message: errorMsg }
        }
      },

      retrySession: async (recordId) => {
        const { sessions } = get()
        const session = sessions[recordId]
        if (!session) return { success: false, message: 'Session not found' }

        // Set the URL back and start a new analysis
        set({ inputUrl: session.url })

        // Remove the old session
        get().removeSession(recordId)

        return get().startAnalysis()
      },

      reset: () => {
        get().stopAllPolling()
        set(initialState)
      },
    }),
    {
      name: 'analysis-storage',
      partialize: (state) => ({
        inputUrl: state.inputUrl,
      }),
      merge: (persisted, current) => {
        const p = (persisted || {}) as Record<string, unknown>
        // Migrate old format: { url: "..." } → { inputUrl: "..." }
        const inputUrl = (typeof p.inputUrl === 'string' ? p.inputUrl : '') ||
                         (typeof p.url === 'string' ? p.url : '') ||
                         (current as AnalysisStore).inputUrl
        return {
          ...(current as AnalysisStore),
          inputUrl,
          sessions: {},
          activeSessionId: null,
        }
      },
    }
  )
)

// --- Convenience hooks for components ---

/** Get derived compat state for simpler components */
export function useActiveSession(): AnalysisSession | null {
  return useAnalysisStore((s) => s.activeSessionId ? s.sessions[s.activeSessionId] : null)
}

/** Get all sessions as a sorted array (polling first, then by startedAt desc) */
export function useSessionList(): AnalysisSession[] {
  return useAnalysisStore((s) => {
    const list = Object.values(s.sessions)
    list.sort((a, b) => {
      if (a.status === 'polling' && b.status !== 'polling') return -1
      if (b.status === 'polling' && a.status !== 'polling') return 1
      return b.startedAt - a.startedAt
    })
    return list
  })
}

/** Check if any session is actively polling */
export function useHasActivePolling(): boolean {
  return useAnalysisStore((s) => Object.values(s.sessions).some(ss => ss.status === 'polling'))
}
