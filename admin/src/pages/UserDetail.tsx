import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { ArrowLeft, Save, Gift, Link2, Users as UsersIcon } from 'lucide-react'
import { format } from 'date-fns'

interface User {
  id: string
  email: string
  display_name: string | null
  role: string
  credit_balance: number
  referral_code: string
  referred_by: string | null
  created_at: string
  updated_at: string
}

interface Analysis {
  id: string
  event_url: string
  status: string
  credits_charged: number
  created_at: string
}

interface Transaction {
  id: string
  amount: number
  type: string
  description: string
  balance_after: number
  created_at: string
}

export default function UserDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [user, setUser] = useState<User | null>(null)
  const [analyses, setAnalyses] = useState<Analysis[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [invitedUsers, setInvitedUsers] = useState<{ id: string; email: string; display_name: string | null; credit_balance: number; created_at: string }[]>([])
  const [referrer, setReferrer] = useState<{ id: string; email: string; display_name: string | null; referral_code: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [editRole, setEditRole] = useState('')
  const [saving, setSaving] = useState(false)
  const [grantAmount, setGrantAmount] = useState('')
  const [grantDesc, setGrantDesc] = useState('')
  const [granting, setGranting] = useState(false)
  const [tab, setTab] = useState<'analyses' | 'transactions' | 'referrals'>('analyses')

  useEffect(() => {
    if (!id) return
    setLoading(true)
    api.userDetail(id).then((data) => {
      setUser(data.user)
      setEditRole(data.user.role)
      setAnalyses(data.analyses || [])
      setTransactions(data.transactions || [])
      setInvitedUsers(data.invitedUsers || [])
      setReferrer(data.referrer || null)
    }).finally(() => setLoading(false))
  }, [id])

  const handleSaveRole = async () => {
    if (!id || editRole === user?.role) return
    setSaving(true)
    try {
      const data = await api.updateUser(id, { role: editRole })
      setUser(data.user)
    } finally {
      setSaving(false)
    }
  }

  const handleGrant = async () => {
    if (!id || !grantAmount) return
    setGranting(true)
    try {
      const amount = Math.round(parseFloat(grantAmount) * 100)
      await api.grantCredits(id, amount, grantDesc || 'Admin grant')
      // Refresh
      const data = await api.userDetail(id)
      setUser(data.user)
      setTransactions(data.transactions || [])
      setGrantAmount('')
      setGrantDesc('')
    } finally {
      setGranting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) {
    return <div className="text-center py-12 text-gray-400">用户不存在</div>
  }

  const statusColor: Record<string, string> = {
    completed: 'bg-emerald-100 text-emerald-700',
    failed: 'bg-red-100 text-red-700',
    pending: 'bg-amber-100 text-amber-700',
  }

  const typeLabel: Record<string, string> = {
    signup_bonus: '注册奖励',
    analysis_spend: '分析消费',
    referral_commission: '推荐佣金',
    admin_grant: '管理员充值',
    topup: '充值',
    refund: '退款',
  }

  return (
    <div className="space-y-6">
      <button onClick={() => navigate('/users')} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="w-4 h-4" /> 返回用户列表
      </button>

      {/* User Info */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold mb-4">用户信息</h2>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-gray-500">ID</dt>
              <dd className="font-mono text-xs mt-0.5 text-gray-700 break-all">{user.id}</dd>
            </div>
            <div>
              <dt className="text-gray-500">邮箱</dt>
              <dd className="mt-0.5 text-gray-700">{user.email || '-'}</dd>
            </div>
            <div>
              <dt className="text-gray-500">昵称</dt>
              <dd className="mt-0.5 text-gray-700">{user.display_name || '-'}</dd>
            </div>
            <div>
              <dt className="text-gray-500">推荐码</dt>
              <dd className="mt-0.5 font-mono text-gray-700">{user.referral_code}</dd>
            </div>
            <div>
              <dt className="text-gray-500">推荐人</dt>
              <dd className="mt-0.5">
                {referrer ? (
                  <button
                    onClick={() => navigate(`/users/${referrer.id}`)}
                    className="text-indigo-600 hover:text-indigo-700 text-sm"
                  >
                    {referrer.display_name || referrer.email} ({referrer.referral_code})
                  </button>
                ) : (
                  <span className="text-gray-400 text-sm">无</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">已邀请</dt>
              <dd className="mt-0.5 text-sm font-medium text-gray-700">{invitedUsers.length} 人</dd>
            </div>
            <div>
              <dt className="text-gray-500">注册时间</dt>
              <dd className="mt-0.5 text-gray-700">{format(new Date(user.created_at), 'yyyy-MM-dd HH:mm:ss')}</dd>
            </div>
            <div>
              <dt className="text-gray-500">角色</dt>
              <dd className="mt-1 flex items-center gap-2">
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  className="border border-gray-200 rounded-lg px-2 py-1 text-sm"
                >
                  <option value="user">user</option>
                  <option value="admin">admin</option>
                </select>
                {editRole !== user.role && (
                  <button
                    onClick={handleSaveRole}
                    disabled={saving}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-600 text-white rounded-lg text-xs hover:bg-indigo-700 disabled:opacity-50"
                  >
                    <Save className="w-3 h-3" />
                    {saving ? '保存中...' : '保存'}
                  </button>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">积分余额</dt>
              <dd className="mt-0.5 text-xl font-bold text-indigo-600">
                {(user.credit_balance / 100).toFixed(2)}
              </dd>
            </div>
          </dl>
        </div>

        {/* Grant Credits */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Gift className="w-5 h-5 text-emerald-500" /> 充值积分
          </h3>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">数量</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={grantAmount}
                onChange={(e) => setGrantAmount(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="10.00"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
              <input
                type="text"
                value={grantDesc}
                onChange={(e) => setGrantDesc(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="可选"
              />
            </div>
            <button
              onClick={handleGrant}
              disabled={granting || !grantAmount}
              className="w-full py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
            >
              {granting ? '处理中...' : '确认充值'}
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex border-b border-gray-100">
          <button
            onClick={() => setTab('analyses')}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              tab === 'analyses' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            分析记录 ({analyses.length})
          </button>
          <button
            onClick={() => setTab('transactions')}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              tab === 'transactions' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            交易记录 ({transactions.length})
          </button>
          <button
            onClick={() => setTab('referrals')}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              tab === 'referrals' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            邀请记录 ({invitedUsers.length})
          </button>
        </div>

        {tab === 'analyses' && (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">事件 URL</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">状态</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">积分</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">时间</th>
              </tr>
            </thead>
            <tbody>
              {analyses.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-8 text-gray-400">暂无记录</td></tr>
              ) : analyses.map((a) => (
                <tr
                  key={a.id}
                  className="border-t border-gray-50 hover:bg-gray-50/50 cursor-pointer"
                  onClick={() => navigate(`/analyses/${a.id}`)}
                >
                  <td className="px-4 py-2.5 truncate max-w-xs">{a.event_url}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColor[a.status] || 'bg-gray-100 text-gray-600'}`}>
                      {a.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono">{(a.credits_charged / 100).toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-gray-500">{format(new Date(a.created_at), 'MM-dd HH:mm')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === 'transactions' && (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">类型</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">金额</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">描述</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">余额</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">时间</th>
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-gray-400">暂无记录</td></tr>
              ) : transactions.map((t) => (
                <tr key={t.id} className="border-t border-gray-50">
                  <td className="px-4 py-2.5">
                    <span className="text-xs font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                      {typeLabel[t.type] || t.type}
                    </span>
                  </td>
                  <td className={`px-4 py-2.5 text-right font-mono ${t.amount > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {t.amount > 0 ? '+' : ''}{(t.amount / 100).toFixed(2)}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 truncate max-w-xs">{t.description}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-gray-700">{(t.balance_after / 100).toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-gray-500">{format(new Date(t.created_at), 'MM-dd HH:mm')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === 'referrals' && (
          <div>
            {referrer && (
              <div className="px-4 py-3 bg-blue-50 border-b border-blue-100 flex items-center gap-2 text-sm">
                <Link2 className="w-4 h-4 text-blue-500" />
                <span className="text-blue-700">
                  此用户由
                  <button onClick={() => navigate(`/users/${referrer.id}`)} className="font-medium underline mx-1">
                    {referrer.display_name || referrer.email}
                  </button>
                  邀请注册（推荐码: {referrer.referral_code}）
                </span>
              </div>
            )}
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">被邀请人</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600">积分余额</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">注册时间</th>
                </tr>
              </thead>
              <tbody>
                {invitedUsers.length === 0 ? (
                  <tr><td colSpan={3} className="text-center py-8 text-gray-400">尚未邀请任何用户</td></tr>
                ) : invitedUsers.map((u) => (
                  <tr
                    key={u.id}
                    className="border-t border-gray-50 hover:bg-gray-50/50 cursor-pointer"
                    onClick={() => navigate(`/users/${u.id}`)}
                  >
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-gray-900">{u.display_name || '-'}</div>
                      <div className="text-xs text-gray-400">{u.email}</div>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-gray-700">{(u.credit_balance / 100).toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-gray-500">{format(new Date(u.created_at), 'yyyy-MM-dd HH:mm')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Referral Link Info */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
          <UsersIcon className="w-4 h-4" /> 邀请链接
        </h3>
        <code className="text-xs bg-gray-50 px-3 py-2 rounded-lg block text-gray-600 break-all">
          https://polyinsight.online/?ref={user.referral_code}
        </code>
      </div>
    </div>
  )
}
