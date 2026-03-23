import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useShallow } from 'zustand/react/shallow'
import { api } from '../lib/backend'
import { useAuthStore } from './authStore'
import i18n from '../i18n'

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
  isOptimistic?: boolean
}

interface AnalysisState {
  inputUrl: string
  sessions: Record<string, AnalysisSession>
  activeSessionId: string | null
}

interface AnalysisActions {
  setUrl: (url: string) => void
  startAnalysis: () => Promise<{ success: boolean; message?: string; recordId?: string; silent?: boolean }>
  cancelAnalysis: (recordId?: string) => Promise<void>
  retrySession: (recordId: string) => Promise<{ success: boolean; message?: string; silent?: boolean }>
  removeSession: (recordId: string) => void
  setActiveSession: (recordId: string | null) => void
  reset: () => void
  stopAllPolling: () => void
}

type AnalysisStore = AnalysisState & AnalysisActions

// --- Constants ---

const POLL_INTERVAL = 3000
const MAX_POLL_TIME = 8 * 60 * 1000       // Keep polling longer than the backend stale-job window.
const MAX_CONSECUTIVE_POLL_ERRORS = 5

// --- Module-level timer + progress tracking ---

const pollTimers = new Map<string, ReturnType<typeof setTimeout>>()
const lastProgress = new Map<string, { result: string | null; time: number }>()
const pollErrorCounts = new Map<string, number>()
const abandonedOptimisticSessions = new Set<string>()

function createOptimisticSessionId() {
  return `optimistic:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`
}

function stopSessionPolling(recordId: string) {
  const timer = pollTimers.get(recordId)
  if (timer) {
    clearTimeout(timer)
    pollTimers.delete(recordId)
  }
  lastProgress.delete(recordId)
  pollErrorCounts.delete(recordId)
}

function getTimeoutMessage(partialResult: string | null): string {
  if (!partialResult) return i18n.t('store.error.failedToStart')
  const stepKeys: string[] = []
  const regex = /<!--STEP:(\w+)-->/g
  let m
  while ((m = regex.exec(partialResult)) !== null) stepKeys.push(m[1])
  if (stepKeys.length === 0) return i18n.t('store.error.failedInit')
  if (stepKeys.length >= 4) return i18n.t('store.error.nearlyComplete')
  const lastStep = i18n.t('store.step.' + stepKeys[stepKeys.length - 1]) || stepKeys[stepKeys.length - 1]
  return i18n.t('store.error.stalled', { step: lastStep })
}

// --- Module-level polling function (uses store directly) ---

function startPollingForSession(recordId: string) {
  if (pollTimers.has(recordId)) return // already polling

  const s = useAnalysisStore.getState().sessions[recordId]
  if (!s || s.status !== 'polling') return

  lastProgress.set(recordId, { result: s.partialResult, time: Date.now() })

  const poll = async () => {
    const sessions = useAnalysisStore.getState().sessions
    const session = sessions[recordId]
    if (!session || session.status !== 'polling') return

    const elapsed = Date.now() - session.startedAt

    // Timeout check
    if (elapsed > MAX_POLL_TIME) {
      stopSessionPolling(recordId)
      useAnalysisStore.setState({
        sessions: {
          ...useAnalysisStore.getState().sessions,
          [recordId]: {
            ...session,
            status: 'failed' as const,
            error: getTimeoutMessage(session.partialResult),
            canRetry: true,
          },
        },
      })
      return
    }

    try {
      const data = await api.pollAnalysis(recordId)
      pollErrorCounts.delete(recordId)

      if (data.status === 'completed' && data.analysis_result) {
        stopSessionPolling(recordId)
        useAnalysisStore.setState({
          sessions: {
            ...useAnalysisStore.getState().sessions,
            [recordId]: {
              ...session,
              status: 'completed' as const,
              result: data.analysis_result,
              partialResult: null,
            },
          },
        })
        return
      }

      if (data.status === 'failed') {
        stopSessionPolling(recordId)
        useAnalysisStore.setState({
          sessions: {
            ...useAnalysisStore.getState().sessions,
            [recordId]: {
              ...session,
              status: 'failed' as const,
              error: getTimeoutMessage(session.partialResult),
              canRetry: true,
            },
          },
        })
        return
      }

      if (data.status === 'cancelled') {
        stopSessionPolling(recordId)
        useAnalysisStore.setState({
          sessions: {
            ...useAnalysisStore.getState().sessions,
            [recordId]: {
              ...session,
              status: 'cancelled' as const,
              error: null,
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
        useAnalysisStore.setState({
          sessions: {
            ...useAnalysisStore.getState().sessions,
            [recordId]: { ...useAnalysisStore.getState().sessions[recordId], partialResult: data.analysis_result },
          },
        })
      }

      pollTimers.set(recordId, setTimeout(poll, POLL_INTERVAL))
    } catch (err) {
      console.error('Polling error:', err)
      const nextErrorCount = (pollErrorCounts.get(recordId) || 0) + 1
      pollErrorCounts.set(recordId, nextErrorCount)

      if (nextErrorCount >= MAX_CONSECUTIVE_POLL_ERRORS) {
        stopSessionPolling(recordId)
        useAnalysisStore.setState({
          sessions: {
            ...useAnalysisStore.getState().sessions,
            [recordId]: {
              ...session,
              status: 'failed' as const,
              error: i18n.t('store.error.backendUnavailable'),
              canRetry: true,
            },
          },
        })
        return
      }

      pollTimers.set(recordId, setTimeout(poll, POLL_INTERVAL))
    }
  }

  pollTimers.set(recordId, setTimeout(poll, 2000))
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
        if (sessions[recordId]?.isOptimistic) {
          abandonedOptimisticSessions.add(recordId)
        }
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

        if (sessions[targetId].isOptimistic) {
          abandonedOptimisticSessions.add(targetId)
        }

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

        if (sessions[targetId].isOptimistic) {
          return
        }

        try {
          await api.cancelAnalysis(targetId)
        } catch (err) {
          console.error('Failed to cancel analysis record:', err)
        }
      },

      startAnalysis: async () => {
        const { inputUrl, sessions } = get()
        const submittedUrl = inputUrl.trim()

        if (!submittedUrl) {
          return { success: false, message: i18n.t('store.error.noUrl') }
        }

        const optimisticId = createOptimisticSessionId()
        const startedAt = Date.now()
        const optimisticSession: AnalysisSession = {
          id: optimisticId,
          url: submittedUrl,
          status: 'polling',
          result: null,
          partialResult: null,
          error: null,
          canRetry: false,
          startedAt,
          isOptimistic: true,
        }

        set({
          inputUrl: '',
          sessions: { ...sessions, [optimisticId]: optimisticSession },
          activeSessionId: optimisticId,
        })

        try {
          const res = await api.createAnalysis(submittedUrl, i18n.language)
          const recordId = res.record_id

          // Update credit balance
          if (typeof res.remaining_balance === 'number') {
            useAuthStore.getState().setCreditBalance(res.remaining_balance)
          }

          if (abandonedOptimisticSessions.has(optimisticId)) {
            abandonedOptimisticSessions.delete(optimisticId)
            try {
              await api.cancelAnalysis(recordId)
            } catch (cancelErr) {
              console.error('Failed to cancel analysis record after local abort:', cancelErr)
            }
            return { success: true, recordId, silent: true }
          }

          const currentState = get()
          const nextSessions = { ...currentState.sessions }
          const currentOptimisticSession = nextSessions[optimisticId]
          if (currentOptimisticSession) {
            delete nextSessions[optimisticId]
          }

          const session: AnalysisSession = {
            ...(currentOptimisticSession || optimisticSession),
            id: recordId,
            url: submittedUrl,
            status: 'polling',
            result: null,
            partialResult: null,
            error: null,
            canRetry: false,
            startedAt,
            isOptimistic: false,
          }

          set({
            sessions: { ...nextSessions, [recordId]: session },
            activeSessionId: currentState.activeSessionId === optimisticId ? recordId : currentState.activeSessionId,
          })

          // Start polling
          startPollingForSession(recordId)

          return { success: true, message: 'Analysis started...', recordId }
        } catch (err: unknown) {
          console.error('Analysis error:', err)
          const currentState = get()
          const nextSessions = { ...currentState.sessions }
          delete nextSessions[optimisticId]
          abandonedOptimisticSessions.delete(optimisticId)

          set({
            inputUrl: currentState.inputUrl || submittedUrl,
            sessions: nextSessions,
            activeSessionId: currentState.activeSessionId === optimisticId ? null : currentState.activeSessionId,
          })

          const error = err as Error & { status?: number; code?: string }
          let errorMsg = error.message || 'Request failed'
          if (error.status === 402) {
            errorMsg = i18n.t('store.error.insufficient')
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
        sessions: Object.fromEntries(
          Object.entries(state.sessions).filter(([, session]) => !session.isOptimistic)
        ),
        activeSessionId: state.activeSessionId && !state.sessions[state.activeSessionId]?.isOptimistic
          ? state.activeSessionId
          : null,
      }),
      merge: (persisted, current) => {
        const p = (persisted || {}) as Record<string, unknown>
        // Migrate old format: { url: "..." } → { inputUrl: "..." }
        const inputUrl = (typeof p.inputUrl === 'string' ? p.inputUrl : '') ||
                         (typeof p.url === 'string' ? p.url : '') ||
                         (current as AnalysisStore).inputUrl
        // Restore sessions safely
        const sessions = (p.sessions && typeof p.sessions === 'object' && !Array.isArray(p.sessions))
          ? p.sessions as Record<string, AnalysisSession>
          : {}
        const activeSessionId = (typeof p.activeSessionId === 'string') ? p.activeSessionId : null
        return {
          ...(current as AnalysisStore),
          inputUrl,
          sessions,
          activeSessionId,
        }
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return
        // Resume polling for any sessions that were in-progress before refresh
        for (const session of Object.values(state.sessions)) {
          if (session.status === 'polling') {
            startPollingForSession(session.id)
          }
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
  return useAnalysisStore(
    useShallow((s) => {
      const list = Object.values(s.sessions)
      list.sort((a, b) => {
        if (a.status === 'polling' && b.status !== 'polling') return -1
        if (b.status === 'polling' && a.status !== 'polling') return 1
        return b.startedAt - a.startedAt
      })
      return list
    })
  )
}

/** Check if any session is actively polling */
export function useHasActivePolling(): boolean {
  return useAnalysisStore((s) => Object.values(s.sessions).some(ss => ss.status === 'polling'))
}
