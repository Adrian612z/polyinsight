import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import StatCard from '../components/StatCard'
import {
  Users, UserPlus, FileSearch, FilePlus,
  Wallet, ShieldCheck, Gift, TrendingDown, Link2, UserCheck,
} from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

interface Stats {
  totalUsers: number
  todayUsers: number
  totalAnalyses: number
  todayAnalyses: number
  userTopup: number
  adminGrant: number
  signupBonus: number
  analysisSpent: number
  referralCommission: number
  referralCount: number
  activeReferrers: number
}

interface Charts {
  userGrowth: { date: string; count: number }[]
  analysisStats: { date: string; completed: number; failed: number; pending: number }[]
  creditFlow: { date: string; income: number; spent: number }[]
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [charts, setCharts] = useState<Charts | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([api.dashboard(), api.dashboardCharts()])
      .then(([s, c]) => {
        setStats(s)
        setCharts(c)
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    )
  }

  const fmtCredit = (v: number) => (v / 100).toFixed(2)
  const fmtDate = (d: string) => d.slice(5)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">仪表盘</h1>

      {/* Row 1: User & Analysis */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="总用户数" value={stats?.totalUsers || 0} icon={Users} color="bg-indigo-500" />
        <StatCard title="今日新增" value={stats?.todayUsers || 0} icon={UserPlus} color="bg-emerald-500" />
        <StatCard title="总分析数" value={stats?.totalAnalyses || 0} icon={FileSearch} color="bg-violet-500" />
        <StatCard title="今日分析" value={stats?.todayAnalyses || 0} icon={FilePlus} color="bg-cyan-500" />
      </div>

      {/* Row 2: Credit Breakdown */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 mb-3">积分统计</h2>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard title="用户付费" value={fmtCredit(stats?.userTopup || 0)} subtitle="仅真实支付" icon={Wallet} color="bg-emerald-500" />
          <StatCard title="管理充值" value={fmtCredit(stats?.adminGrant || 0)} subtitle="后台手动充值" icon={ShieldCheck} color="bg-slate-500" />
          <StatCard title="注册奖励" value={fmtCredit(stats?.signupBonus || 0)} subtitle="新用户注册" icon={Gift} color="bg-blue-500" />
          <StatCard title="分析消费" value={fmtCredit(stats?.analysisSpent || 0)} subtitle="用户分析支出" icon={TrendingDown} color="bg-rose-500" />
          <StatCard title="推荐佣金" value={fmtCredit(stats?.referralCommission || 0)} subtitle="邀请返佣" icon={Link2} color="bg-purple-500" />
        </div>
      </div>

      {/* Row 3: Referral */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 mb-3">邀请统计</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="被邀请用户" value={stats?.referralCount || 0} subtitle="通过邀请链接注册" icon={UserCheck} color="bg-amber-500" />
          <StatCard title="活跃邀请人" value={stats?.activeReferrers || 0} subtitle="至少邀请1人" icon={Link2} color="bg-teal-500" />
        </div>
      </div>

      {/* Charts */}
      {charts && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">用户增长（30天）</h3>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={charts.userGrowth}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip labelFormatter={(v) => `日期: ${v}`} />
                <Area type="monotone" dataKey="count" name="新用户" stroke="#6366f1" fill="#eef2ff" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">分析统计（30天）</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={charts.analysisStats}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip labelFormatter={(v) => `日期: ${v}`} />
                <Legend />
                <Bar dataKey="completed" name="完成" fill="#10b981" radius={[2, 2, 0, 0]} />
                <Bar dataKey="failed" name="失败" fill="#ef4444" radius={[2, 2, 0, 0]} />
                <Bar dataKey="pending" name="进行中" fill="#f59e0b" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 lg:col-span-2">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">积分流动（30天）</h3>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={charts.creditFlow.map(d => ({ ...d, income: d.income / 100, spent: d.spent / 100 }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip labelFormatter={(v) => `日期: ${v}`} />
                <Legend />
                <Area type="monotone" dataKey="income" name="收入" stroke="#10b981" fill="#d1fae5" strokeWidth={2} />
                <Area type="monotone" dataKey="spent" name="支出" stroke="#ef4444" fill="#fee2e2" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}
