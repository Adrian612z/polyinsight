import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import Pagination from '../components/Pagination'
import { Search, Gift } from 'lucide-react'
import { format } from 'date-fns'

interface User {
  id: string
  email: string
  display_name: string | null
  role: string
  credit_balance: number
  referral_code: string
  created_at: string
}

export default function Users() {
  const [users, setUsers] = useState<User[]>([])
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('')
  const [loading, setLoading] = useState(true)

  // Grant credits modal
  const [grantTarget, setGrantTarget] = useState<User | null>(null)
  const [grantAmount, setGrantAmount] = useState('')
  const [grantDesc, setGrantDesc] = useState('')
  const [granting, setGranting] = useState(false)

  const navigate = useNavigate()

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.users(page, search, role)
      setUsers(data.users)
      setPages(data.pages)
      setTotal(data.total)
    } finally {
      setLoading(false)
    }
  }, [page, search, role])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    fetchUsers()
  }

  const handleGrant = async () => {
    if (!grantTarget || !grantAmount) return
    setGranting(true)
    try {
      const amount = Math.round(parseFloat(grantAmount) * 100)
      await api.grantCredits(grantTarget.id, amount, grantDesc || `Admin grant`)
      setGrantTarget(null)
      setGrantAmount('')
      setGrantDesc('')
      fetchUsers()
    } finally {
      setGranting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">用户管理</h1>
      </div>

      {/* Search & Filter */}
      <div className="flex gap-3 items-center">
        <form onSubmit={handleSearch} className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索邮箱或昵称..."
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
          />
        </form>
        <select
          value={role}
          onChange={(e) => { setRole(e.target.value); setPage(1) }}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
        >
          <option value="">全部角色</option>
          <option value="user">用户</option>
          <option value="admin">管理员</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-3 font-medium text-gray-600">用户</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">角色</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">积分</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">推荐码</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">注册时间</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-12 text-gray-400">加载中...</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-gray-400">暂无数据</td></tr>
              ) : (
                users.map((u) => (
                  <tr
                    key={u.id}
                    className="border-b border-gray-50 hover:bg-gray-50/50 cursor-pointer"
                    onClick={() => navigate(`/users/${u.id}`)}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{u.display_name || '-'}</div>
                      <div className="text-xs text-gray-400">{u.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-700">
                      {(u.credit_balance / 100).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{u.referral_code}</td>
                    <td className="px-4 py-3 text-gray-500">
                      {format(new Date(u.created_at), 'yyyy-MM-dd HH:mm')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={(e) => { e.stopPropagation(); setGrantTarget(u) }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                      >
                        <Gift className="w-3.5 h-3.5" />
                        充值
                      </button>
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

      {/* Grant Credits Modal */}
      {grantTarget && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={() => setGrantTarget(null)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-1">充值积分</h3>
            <p className="text-sm text-gray-500 mb-4">
              为 {grantTarget.display_name || grantTarget.email} 充值
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">积分数量</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={grantAmount}
                  onChange={(e) => setGrantAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="例如: 10.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">备注（可选）</label>
                <input
                  type="text"
                  value={grantDesc}
                  onChange={(e) => setGrantDesc(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="充值原因"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setGrantTarget(null)}
                  className="flex-1 py-2 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  onClick={handleGrant}
                  disabled={granting || !grantAmount}
                  className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                >
                  {granting ? '处理中...' : '确认充值'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
