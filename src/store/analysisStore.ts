import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '../lib/supabase'
import { parseErrorMessage } from '../lib/api'

interface AnalysisState {
  url: string
  loading: boolean
  result: string | null
  error: string | null
  canRetry: boolean
  currentRecordId: string | null
  pollingStatus: 'idle' | 'polling' | 'completed' | 'failed' | 'cancelled'
}

interface AnalysisActions {
  setUrl: (url: string) => void
  startAnalysis: (userId: string) => Promise<{ success: boolean; message?: string }>
  cancelAnalysis: () => Promise<void>
  retry: (userId: string) => Promise<{ success: boolean; message?: string }>
  reset: () => void
  stopPolling: () => void
}

type AnalysisStore = AnalysisState & AnalysisActions

const initialState: AnalysisState = {
  url: '',
  loading: false,
  result: null,
  error: null,
  canRetry: false,
  currentRecordId: null,
  pollingStatus: 'idle',
}

// 轮询间隔（毫秒）
const POLL_INTERVAL = 3000
// 最大轮询时间（10 分钟）
const MAX_POLL_TIME = 10 * 60 * 1000

// 存储轮询定时器，用于清理
let pollTimer: ReturnType<typeof setTimeout> | null = null
let pollStartTime: number = 0

export const useAnalysisStore = create<AnalysisStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      setUrl: (url) => set({ url }),

      stopPolling: () => {
        if (pollTimer) {
          clearTimeout(pollTimer)
          pollTimer = null
        }
        set({ pollingStatus: 'idle' })
      },

      cancelAnalysis: async () => {
        const { currentRecordId } = get()
        
        // 1. 立即停止前端轮询
        if (pollTimer) {
          clearTimeout(pollTimer)
          pollTimer = null
        }

        set({ 
          loading: false, 
          pollingStatus: 'cancelled',
          error: null 
        })

        // 2. 如果有记录ID，更新数据库状态
        if (currentRecordId) {
          try {
            await supabase
              .from('analysis_records')
              .update({ status: 'cancelled' }) // 注意：需确保 Supabase 的 Check 约束或枚举类型允许 'cancelled'
              .eq('id', currentRecordId)
          } catch (err) {
            console.error('Failed to cancel analysis record:', err)
          }
        }
      },

      startAnalysis: async (userId) => {
        const { url, loading } = get()

        // 防止重复提交
        if (loading) {
          return { success: false, message: '分析正在进行中' }
        }

        if (!url) {
          return { success: false, message: '请输入 URL' }
        }

        // 停止之前的轮询
        get().stopPolling()

        set({
          loading: true,
          error: null,
          result: null,
          canRetry: false,
          pollingStatus: 'idle',
        })

        try {
          // 1. 创建 Supabase 记录
          const { data: record, error: dbError } = await supabase
            .from('analysis_records')
            .insert({
              event_url: url,
              status: 'pending',
              user_id: userId,
            })
            .select()
            .single()

          if (dbError) throw dbError

          set({ currentRecordId: record.id })

          // 2. 触发 n8n webhook（不等待响应）
          const n8nWebhookUrl = import.meta.env.VITE_N8N_WEBHOOK_URL

          if (n8nWebhookUrl) {
            // 使用 fetch 但不等待响应体，只确保请求发出
            fetch(n8nWebhookUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                url,
                user_id: userId,
                record_id: record.id,
              }),
            }).catch((err) => {
              // 只记录错误，不中断流程
              console.error('n8n webhook trigger error:', err)
            })

            // 3. 开始轮询 Supabase 等待结果
            set({ pollingStatus: 'polling' })
            pollStartTime = Date.now()

            const pollForResult = async () => {
              const { currentRecordId, pollingStatus } = get()

              // 检查是否应该停止轮询
              if (pollingStatus !== 'polling' || !currentRecordId) {
                return
              }

              // 检查是否超时
              if (Date.now() - pollStartTime > MAX_POLL_TIME) {
                set({
                  loading: false,
                  error: '分析超时，请稍后在历史记录中查看结果',
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
                  // 分析完成
                  set({
                    loading: false,
                    result: data.analysis_result,
                    pollingStatus: 'completed',
                  })
                  return
                } else if (data.status === 'failed') {
                  // 分析失败
                  set({
                    loading: false,
                    error: '分析失败，请重试',
                    canRetry: true,
                    pollingStatus: 'failed',
                  })
                  return
                }

                // 继续轮询
                pollTimer = setTimeout(pollForResult, POLL_INTERVAL)
              } catch (err) {
                console.error('Polling error:', err)
                // 轮询出错，继续尝试
                pollTimer = setTimeout(pollForResult, POLL_INTERVAL)
              }
            }

            // 延迟一点开始轮询，给 n8n 一些启动时间
            pollTimer = setTimeout(pollForResult, 2000)

            return { success: true, message: '分析已开始，请稍候...' }
          } else {
            // 模拟响应（开发模式）
            await new Promise((resolve) => setTimeout(resolve, 2000))
            const analysisOutput = `## Analysis for ${url}\n\n**Note: This is a simulated result because VITE_N8N_WEBHOOK_URL is not set.**\n\n- **Market Sentiment**: Bullish\n- **Volume**: High\n- **Prediction**: Yes (65%)`

            set({ result: analysisOutput })

            await supabase
              .from('analysis_records')
              .update({
                status: 'completed',
                analysis_result: analysisOutput,
              })
              .eq('id', record.id)

            set({ loading: false, pollingStatus: 'completed' })
            return { success: true, message: '分析完成！' }
          }
        } catch (err: unknown) {
          console.error('Analysis error:', err)
          const errorMsg = parseErrorMessage(err)

          // 更新失败状态到数据库
          const { currentRecordId } = get()
          if (currentRecordId) {
            await supabase
              .from('analysis_records')
              .update({ status: 'failed' })
              .eq('id', currentRecordId)
          }

          set({
            loading: false,
            error: errorMsg,
            canRetry: true,
            pollingStatus: 'failed',
          })
          return { success: false, message: errorMsg }
        }
      },

      retry: async (userId) => {
        return get().startAnalysis(userId)
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
        result: state.result,
        currentRecordId: state.currentRecordId,
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
