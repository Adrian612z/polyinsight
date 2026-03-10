import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import Pagination from '../components/Pagination'
import { format } from 'date-fns'

interface Transaction {
  id: string
  user_id: string
  amount: number
  type: string
  description: string
  reference_id: string | null
  balance_after: number
  created_at: string
}

const typeLabel: Record<string, string> = {
  signup_bonus: '注册奖励',
  analysis_spend: '分析消费',
  referral_commission: '推荐佣金',
  admin_grant: '管理员充值',
  topup: '充值',
  refund: '退款',
}

const typeColor: Record<string, string> = {
  signup_bonus: 'bg-blue-100 text-blue-700',
  analysis_spend: 'bg-red-100 text-red-700',
  referral_commission: 'bg-purple-100 text-purple-700',
  admin_grant: 'bg-emerald-100 text-emerald-700',
  topup: 'bg-emerald-100 text-emerald-700',
  refund: 'bg-amber-100 text-amber-700',
}

export default function Transactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [type, setType] = useState('')
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.transactions(page, type)
      setTransactions(data.transactions)
      setPages(data.pages)
      setTotal(data.total)
    } finally {
      setLoading(false)
    }
  }, [page, type])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">交易记录</h1>
        <select
          value={type}
          onChange={(e) => { setType(e.target.value); setPage(1) }}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
        >
          <option value="">全部类型</option>
          <option value="signup_bonus">注册奖励</option>
          <option value="analysis_spend">分析消费</option>
          <option value="referral_commission">推荐佣金</option>
          <option value="admin_grant">管理员充值</option>
          <option value="topup">充值</option>
          <option value="refund">退款</option>
        </select>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-3 font-medium text-gray-600">用户 ID</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">类型</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">金额</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">描述</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">余额</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">时间</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-12 text-gray-400">加载中...</td></tr>
              ) : transactions.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-gray-400">暂无数据</td></tr>
              ) : (
                transactions.map((t) => (
                  <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-3">
                      <button
                        onClick={() => navigate(`/users/${t.user_id}`)}
                        className="font-mono text-xs text-indigo-600 hover:text-indigo-700 truncate block max-w-[180px]"
                      >
                        {t.user_id}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${typeColor[t.type] || 'bg-gray-100 text-gray-600'}`}>
                        {typeLabel[t.type] || t.type}
                      </span>
                    </td>
                    <td className={`px-4 py-3 text-right font-mono ${t.amount > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {t.amount > 0 ? '+' : ''}{(t.amount / 100).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-gray-500 max-w-xs truncate">{t.description}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-700">{(t.balance_after / 100).toFixed(2)}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {format(new Date(t.created_at), 'yyyy-MM-dd HH:mm')}
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
