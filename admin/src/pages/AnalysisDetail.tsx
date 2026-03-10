import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { format } from 'date-fns'
import ReactMarkdown from 'react-markdown'

interface Analysis {
  id: string
  user_id: string
  event_url: string
  analysis_result: string | null
  status: string
  credits_charged: number
  created_at: string
  updated_at: string
}

interface AnalysisUser {
  id: string
  email: string
  display_name: string | null
}

export default function AnalysisDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [user, setUser] = useState<AnalysisUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    api.analysisDetail(id)
      .then((data) => {
        setAnalysis(data.analysis)
        setUser(data.user)
      })
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    )
  }

  if (!analysis) {
    return <div className="text-center py-12 text-gray-400">记录不存在</div>
  }

  const statusColor: Record<string, string> = {
    completed: 'bg-emerald-100 text-emerald-700',
    failed: 'bg-red-100 text-red-700',
    pending: 'bg-amber-100 text-amber-700',
  }

  // Clean step markers from the markdown
  const cleanResult = analysis.analysis_result
    ?.replace(/<!--STEP:\w+-->/g, '')
    ?.trim()

  return (
    <div className="space-y-6">
      <button onClick={() => navigate('/analyses')} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="w-4 h-4" /> 返回分析列表
      </button>

      {/* Info Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-lg font-semibold">分析详情</h2>
          <span className={`px-2.5 py-1 rounded text-xs font-medium ${statusColor[analysis.status] || 'bg-gray-100 text-gray-600'}`}>
            {analysis.status}
          </span>
        </div>

        <dl className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
          <div>
            <dt className="text-gray-500">ID</dt>
            <dd className="font-mono text-xs mt-0.5 text-gray-700">{analysis.id}</dd>
          </div>
          <div>
            <dt className="text-gray-500">事件 URL</dt>
            <dd className="mt-0.5">
              <a
                href={analysis.event_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1 break-all"
              >
                {analysis.event_url}
                <ExternalLink className="w-3 h-3 flex-shrink-0" />
              </a>
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">用户</dt>
            <dd className="mt-0.5">
              <button
                onClick={() => navigate(`/users/${analysis.user_id}`)}
                className="text-indigo-600 hover:text-indigo-700"
              >
                {user?.display_name || user?.email || analysis.user_id}
              </button>
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">消费积分</dt>
            <dd className="mt-0.5 font-mono text-gray-700">{(analysis.credits_charged / 100).toFixed(2)}</dd>
          </div>
          <div>
            <dt className="text-gray-500">创建时间</dt>
            <dd className="mt-0.5 text-gray-700">{format(new Date(analysis.created_at), 'yyyy-MM-dd HH:mm:ss')}</dd>
          </div>
          <div>
            <dt className="text-gray-500">更新时间</dt>
            <dd className="mt-0.5 text-gray-700">{format(new Date(analysis.updated_at), 'yyyy-MM-dd HH:mm:ss')}</dd>
          </div>
        </dl>
      </div>

      {/* Analysis Result */}
      {cleanResult && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold mb-4">分析报告</h3>
          <div className="markdown-body prose prose-sm max-w-none">
            <ReactMarkdown>{cleanResult}</ReactMarkdown>
          </div>
        </div>
      )}

      {!cleanResult && analysis.status === 'pending' && (
        <div className="bg-amber-50 rounded-xl border border-amber-200 p-6 text-center text-amber-700">
          分析正在进行中...
        </div>
      )}

      {!cleanResult && analysis.status === 'failed' && (
        <div className="bg-red-50 rounded-xl border border-red-200 p-6 text-center text-red-700">
          分析失败，未生成报告
        </div>
      )}
    </div>
  )
}
