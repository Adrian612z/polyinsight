import React, { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { Send, Loader2, AlertCircle, RefreshCw, Sparkles } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import { fetchWithRetry, parseErrorMessage } from '../lib/api'
import { useToast } from '../components/Toast'

export const Analyze: React.FC = () => {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [canRetry, setCanRetry] = useState(false)
  const { session } = useAuthStore()
  const toast = useToast()

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!url) return

    setLoading(true)
    setError(null)
    setResult(null)
    setCanRetry(false)

    try {
      // 1. Create a record in Supabase with 'pending' status
      const { data: record, error: dbError } = await supabase
        .from('analysis_records')
        .insert({
          event_url: url,
          status: 'pending',
          user_id: session?.user.id
        })
        .select()
        .single()

      if (dbError) throw dbError

      // 2. Call n8n webhook with retry
      const n8nWebhookUrl = import.meta.env.VITE_N8N_WEBHOOK_URL

      let analysisOutput = ''

      if (n8nWebhookUrl) {
        const response = await fetchWithRetry(
          n8nWebhookUrl,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              url,
              user_id: session?.user.id,
              record_id: record.id
            })
          },
          3,
          1000
        )

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
        await new Promise(resolve => setTimeout(resolve, 2000))
        analysisOutput = `## Analysis for ${url}\n\n**Note: This is a simulated result because VITE_N8N_WEBHOOK_URL is not set.**\n\n- **Market Sentiment**: Bullish\n- **Volume**: High\n- **Prediction**: Yes (65%)`
      }

      setResult(analysisOutput)

      await supabase
        .from('analysis_records')
        .update({
          status: 'completed',
          analysis_result: analysisOutput
        })
        .eq('id', record.id)

      toast.success('分析完成！')

    } catch (err: unknown) {
      console.error('Analysis error:', err)
      const errorMsg = parseErrorMessage(err)
      setError(errorMsg)
      setCanRetry(true)
      toast.error(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  const handleRetry = () => {
    handleSubmit()
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in-up">
      {/* 输入卡片 */}
      <div className="group bg-white/70 dark:bg-gray-800/70 backdrop-blur-md p-6 rounded-2xl shadow-sm border border-gray-200/50 dark:border-gray-700/50 transition-all duration-300 hover:shadow-lg hover:shadow-indigo-500/10 hover:border-indigo-200/50 dark:hover:border-indigo-700/50">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-xl flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">分析 Polymarket 事件</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">输入事件 URL，AI 将为您生成分析报告</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="url" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              事件 URL
            </label>
            <div className="flex gap-3">
              <input
                type="url"
                id="url"
                required
                placeholder="https://polymarket.com/event/..."
                className="flex-1 block w-full rounded-xl border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm px-4 py-3 border transition-all duration-200 hover:border-gray-300 dark:hover:border-gray-500 dark:placeholder-gray-400"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center px-5 py-3 text-sm font-medium rounded-xl text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] shadow-sm hover:shadow-md"
              >
                {loading ? (
                  <Loader2 className="animate-spin h-5 w-5" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
                <span className="ml-2">{loading ? '分析中...' : '开始分析'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-2xl p-4 animate-shake">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 bg-red-100 dark:bg-red-900/50 rounded-xl flex items-center justify-center">
              <AlertCircle className="h-5 w-5 text-red-500" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-medium text-red-800 dark:text-red-300">分析失败</h3>
              <p className="text-sm text-red-600 dark:text-red-400 mt-1">{error}</p>
              {canRetry && (
                <button
                  onClick={handleRetry}
                  disabled={loading}
                  className="mt-3 inline-flex items-center px-4 py-2 text-sm font-medium text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/50 rounded-xl hover:bg-red-200 dark:hover:bg-red-900 transition-all duration-200 disabled:opacity-50"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  重试
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 结果展示 */}
      {result && (
        <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-md p-6 rounded-2xl shadow-sm border border-gray-200/50 dark:border-gray-700/50 animate-fade-in-up">
          <div className="flex items-center gap-3 mb-4 pb-4 border-b border-gray-100 dark:border-gray-700">
            <div className="w-8 h-8 bg-green-100 dark:bg-green-900/50 rounded-lg flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-green-600 dark:text-green-400" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">分析结果</h2>
          </div>
          <div className="prose prose-indigo dark:prose-invert max-w-none prose-headings:text-gray-900 dark:prose-headings:text-white prose-p:text-gray-600 dark:prose-p:text-gray-300 prose-strong:text-gray-900 dark:prose-strong:text-white prose-li:text-gray-600 dark:prose-li:text-gray-300">
            <ReactMarkdown>{result}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  )
}
