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
}

interface AnalysisActions {
  setUrl: (url: string) => void
  startAnalysis: (userId: string) => Promise<{ success: boolean; message?: string }>
  retry: (userId: string) => Promise<{ success: boolean; message?: string }>
  reset: () => void
}

type AnalysisStore = AnalysisState & AnalysisActions

const initialState: AnalysisState = {
  url: '',
  loading: false,
  result: null,
  error: null,
  canRetry: false,
  currentRecordId: null,
}

export const useAnalysisStore = create<AnalysisStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      setUrl: (url) => set({ url }),

      startAnalysis: async (userId) => {
        const { url, loading } = get()

        // 防止重复提交
        if (loading) {
          return { success: false, message: '分析正在进行中' }
        }

        if (!url) {
          return { success: false, message: '请输入 URL' }
        }

        set({
          loading: true,
          error: null,
          result: null,
          canRetry: false,
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

          // 2. 调用 n8n webhook
          const n8nWebhookUrl = import.meta.env.VITE_N8N_WEBHOOK_URL
          let analysisOutput = ''

          if (n8nWebhookUrl) {
            // 不使用 fetchWithRetry，因为 n8n 工作流执行时间很长
            // 自动重试会导致 n8n 重复执行
            const response = await fetch(n8nWebhookUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                url,
                user_id: userId,
                record_id: record.id,
              }),
            })

            if (!response.ok) {
              const errorText = await response.text()
              throw new Error(`n8n 错误: ${response.status} ${errorText}`)
            }

            const responseText = await response.text()
            console.log('n8n Raw Response:', responseText)

            try {
              const data = JSON.parse(responseText)
              analysisOutput = data.result || data.output || data.markdown || JSON.stringify(data, null, 2)
            } catch {
              analysisOutput = responseText
            }

            if (!analysisOutput.trim()) {
              throw new Error('n8n 返回了空响应。请检查 "Respond to Webhook" 节点配置。')
            }
          } else {
            // 模拟响应
            await new Promise((resolve) => setTimeout(resolve, 2000))
            analysisOutput = `## Analysis for ${url}\n\n**Note: This is a simulated result because VITE_N8N_WEBHOOK_URL is not set.**\n\n- **Market Sentiment**: Bullish\n- **Volume**: High\n- **Prediction**: Yes (65%)`
          }

          // 3. 更新结果
          set({ result: analysisOutput })

          // 4. 更新 Supabase 记录
          await supabase
            .from('analysis_records')
            .update({
              status: 'completed',
              analysis_result: analysisOutput,
            })
            .eq('id', record.id)

          set({ loading: false })
          return { success: true, message: '分析完成！' }

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
          })
          return { success: false, message: errorMsg }
        }
      },

      retry: async (userId) => {
        return get().startAnalysis(userId)
      },

      reset: () => set(initialState),
    }),
    {
      name: 'analysis-storage',
      // 只持久化 url 和 result，不持久化 loading 状态
      partialize: (state) => ({
        url: state.url,
        result: state.result,
        currentRecordId: state.currentRecordId,
      }),
      // 恢复时确保 loading 为 false
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.loading = false
          state.error = null
          state.canRetry = false
        }
      },
    }
  )
)
