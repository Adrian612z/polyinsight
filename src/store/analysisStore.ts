import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '../lib/supabase'
import { api } from '../lib/backend'
import { useAuthStore } from './authStore'

interface AnalysisState {
  url: string
  loading: boolean
  result: string | null
  partialResult: string | null
  error: string | null
  canRetry: boolean
  currentRecordId: string | null
  pollingStatus: 'idle' | 'polling' | 'completed' | 'failed' | 'cancelled'
}

interface AnalysisActions {
  setUrl: (url: string) => void
  startAnalysis: () => Promise<{ success: boolean; message?: string }>
  cancelAnalysis: () => Promise<void>
  retry: () => Promise<{ success: boolean; message?: string }>
  reset: () => void
  stopPolling: () => void
}

type AnalysisStore = AnalysisState & AnalysisActions

const initialState: AnalysisState = {
  url: '',
  loading: false,
  result: null,
  partialResult: null,
  error: null,
  canRetry: false,
  currentRecordId: null,
  pollingStatus: 'idle',
}

const POLL_INTERVAL = 3000
const MAX_POLL_TIME = 10 * 60 * 1000

let pollTimer: ReturnType<typeof setTimeout> | null = null
let pollStartTime: number = 0

export const useAnalysisStore = create<AnalysisStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      setUrl: (url) => {
        const prev = get()
        if (url !== prev.url) {
          set({ url, result: null, partialResult: null, error: null, canRetry: false })
        } else {
          set({ url })
        }
      },

      stopPolling: () => {
        if (pollTimer) {
          clearTimeout(pollTimer)
          pollTimer = null
        }
        set({ pollingStatus: 'idle' })
      },

      cancelAnalysis: async () => {
        const { currentRecordId } = get()

        if (pollTimer) {
          clearTimeout(pollTimer)
          pollTimer = null
        }

        set({
          loading: false,
          pollingStatus: 'cancelled',
          error: null,
        })

        if (currentRecordId) {
          try {
            await supabase
              .from('analysis_records')
              .update({ status: 'cancelled' })
              .eq('id', currentRecordId)
          } catch (err) {
            console.error('Failed to cancel analysis record:', err)
          }
        }
      },

      startAnalysis: async () => {
        const { url, loading } = get()

        if (loading) {
          return { success: false, message: 'Analysis in progress' }
        }

        if (!url) {
          return { success: false, message: 'Please enter a URL' }
        }

        get().stopPolling()

        set({
          loading: true,
          error: null,
          result: null,
          partialResult: null,
          canRetry: false,
          pollingStatus: 'idle',
        })

        try {
          // Call backend API - handles credit deduction + n8n trigger
          const res = await api.createAnalysis(url)

          const recordId = res.record_id
          set({ currentRecordId: recordId })

          // Update credit balance in auth store
          if (typeof res.remaining_balance === 'number') {
            useAuthStore.getState().setCreditBalance(res.remaining_balance)
          }

          // Start polling Supabase for result
          set({ pollingStatus: 'polling' })
          pollStartTime = Date.now()

          const pollForResult = async () => {
            const { currentRecordId, pollingStatus } = get()

            if (pollingStatus !== 'polling' || !currentRecordId) {
              return
            }

            if (Date.now() - pollStartTime > MAX_POLL_TIME) {
              set({
                loading: false,
                error: 'Analysis timed out. Check History for results later.',
                canRetry: true,
                pollingStatus: 'failed',
              })
              return
            }

            try {
              const { data, error } = await supabase
                .from('analysis_records')
                .select('status, analysis_result')
                .eq('id', currentRecordId)
                .single()

              if (error) throw error

              if (data.status === 'completed' && data.analysis_result) {
                set({
                  loading: false,
                  result: data.analysis_result,
                  partialResult: null,
                  pollingStatus: 'completed',
                })
                return
              } else if (data.status === 'failed') {
                set({
                  loading: false,
                  error: 'Analysis failed. Please retry.',
                  partialResult: null,
                  canRetry: true,
                  pollingStatus: 'failed',
                })
                return
              }

              if (data.analysis_result) {
                set({ partialResult: data.analysis_result })
              }

              pollTimer = setTimeout(pollForResult, POLL_INTERVAL)
            } catch (err) {
              console.error('Polling error:', err)
              pollTimer = setTimeout(pollForResult, POLL_INTERVAL)
            }
          }

          pollTimer = setTimeout(pollForResult, 2000)

          return { success: true, message: 'Analysis started...' }
        } catch (err: unknown) {
          console.error('Analysis error:', err)

          const error = err as Error & { status?: number; code?: string }
          let errorMsg = error.message || 'Request failed'

          if (error.status === 402) {
            errorMsg = 'Insufficient credits. Please top up to continue.'
          }

          set({
            loading: false,
            error: errorMsg,
            canRetry: error.status !== 402,
            pollingStatus: 'failed',
          })
          return { success: false, message: errorMsg }
        }
      },

      retry: async () => {
        return get().startAnalysis()
      },

      reset: () => {
        get().stopPolling()
        set(initialState)
      },
    }),
    {
      name: 'analysis-storage',
      partialize: (state) => ({
        url: state.url,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.loading = false
          state.error = null
          state.canRetry = false
          state.pollingStatus = 'idle'
        }
      },
    }
  )
)
