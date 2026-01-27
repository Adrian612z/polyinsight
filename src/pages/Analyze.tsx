import React, { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { Send, Loader2, AlertCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'

export const Analyze: React.FC = () => {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { session } = useAuthStore()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url) return

    setLoading(true)
    setError(null)
    setResult(null)

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

      // 2. Call n8n webhook
      const n8nWebhookUrl = import.meta.env.VITE_N8N_WEBHOOK_URL
      
      let analysisOutput = ''

      if (n8nWebhookUrl) {
        const response = await fetch(n8nWebhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ 
            url, 
            user_id: session?.user.id, 
            record_id: record.id 
          })
        })
        
        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`n8n error: ${response.status} ${errorText}`)
        }
        
        const responseText = await response.text()
        console.log('n8n Raw Response:', responseText)
        
        try {
          // Try to parse as JSON first
          const data = JSON.parse(responseText)
          analysisOutput = data.result || data.output || data.markdown || JSON.stringify(data, null, 2)
        } catch (e) {
          // If not valid JSON, use the raw text
          analysisOutput = responseText
        }
        
        if (!analysisOutput.trim()) {
          throw new Error('n8n returned an empty response. Please check your "Respond to Webhook" node.')
        }
      } else {
        // Simulation mode
        await new Promise(resolve => setTimeout(resolve, 2000))
        analysisOutput = `## Analysis for ${url}\n\n**Note: This is a simulated result because VITE_N8N_WEBHOOK_URL is not set.**\n\n- **Market Sentiment**: Bullish\n- **Volume**: High\n- **Prediction**: Yes (65%)`
      }
      
      setResult(analysisOutput)

      // Update record with result
      // Note: If n8n updates the record directly via Supabase, we might not need this update.
      // But for this flow, we update it here.
      await supabase
        .from('analysis_records')
        .update({ 
          status: 'completed',
          analysis_result: analysisOutput 
        })
        .eq('id', record.id)

    } catch (err: any) {
      console.error('Analysis error:', err)
      if (err instanceof TypeError && err.message === 'Failed to fetch') {
        setError('网络连接或跨域(CORS)错误。请确保你的 n8n Webhook 节点已开启 "Respond to Webhook" 并在节点设置或 n8n 环境中允许了跨域请求。')
      } else {
        setError(err.message || '分析 URL 失败')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Analyze Polymarket Event</h1>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="url" className="block text-sm font-medium text-gray-700 mb-1">
              Event URL
            </label>
            <div className="flex space-x-2">
              <input
                type="url"
                id="url"
                required
                placeholder="https://polymarket.com/event/..."
                className="flex-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-4 py-2 border"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {loading ? <Loader2 className="animate-spin h-5 w-5" /> : <Send className="h-5 w-5" />}
                <span className="ml-2">{loading ? 'Analyzing...' : 'Analyze'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-400 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <AlertCircle className="h-5 w-5 text-red-400" />
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        </div>
      )}

      {result && (
        <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Analysis Result</h2>
          <div className="prose prose-blue max-w-none">
            <ReactMarkdown>{result}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  )
}
