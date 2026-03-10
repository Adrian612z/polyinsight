import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import Pagination from '../components/Pagination'
import { Search } from 'lucide-react'
import { format } from 'date-fns'

interface Analysis {
  id: string
  user_id: string
  event_url: string
  status: string
  credits_charged: number
  created_at: string
}

export default function Analyses() {
  const [analyses, setAnalyses] = useState<Analysis[]>([])
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.analyses(page, search, status)
      setAnalyses(data.analyses)
      setPages(data.pages)
      setTotal(data.total)
    } finally {
      setLoading(false)
    }
  }, [page, search, status])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    fetchData()
  }

  const statusColor: Record<string, string> = {
    completed: 'bg-emerald-100 text-emerald-700',
    failed: 'bg-red-100 text-red-700',
    pending: 'bg-amber-100 text-amber-700',
    cancelled: 'bg-gray-100 text-gray-600',
  }

  const statusLabel: Record<string, string> = {
    completed: '完成',
    failed: '失败',
    pending: '进行中',
    cancelled: '已取消',
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">分析记录</h1>

      {/* Search & Filter */}
      <div className="flex gap-3 items-center">
        <form onSubmit={handleSearch} className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索事件URL或用户ID..."
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
          />
        </form>
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1) }}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
        >
          <option value="">全部状态</option>
          <option value="completed">完成</option>
          <option value="pending">进行中</option>
          <option value="failed">失败</option>
          <option value="cancelled">已取消</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-3 font-medium text-gray-600">事件 URL</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">用户 ID</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">状态</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">积分</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">时间</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="text-center py-12 text-gray-400">加载中...</td></tr>
              ) : analyses.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-12 text-gray-400">暂无数据</td></tr>
              ) : (
                analyses.map((a) => (
                  <tr
                    key={a.id}
                    className="border-b border-gray-50 hover:bg-gray-50/50 cursor-pointer"
                    onClick={() => navigate(`/analyses/${a.id}`)}
                  >
                    <td className="px-4 py-3 max-w-sm truncate text-indigo-600 hover:text-indigo-700">
                      {a.event_url}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500 max-w-[200px] truncate">
                      {a.user_id}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColor[a.status] || 'bg-gray-100 text-gray-600'}`}>
                        {statusLabel[a.status] || a.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-700">
                      {(a.credits_charged / 100).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {format(new Date(a.created_at), 'yyyy-MM-dd HH:mm')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 border-t border-gray-100">
          <Pagination page={page} pages={pages} total={total} onPageChange={setPage} />
        </div>
      </div>
    </div>
  )
}
