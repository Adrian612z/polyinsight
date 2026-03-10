import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import StatCard from '../components/StatCard'
import { Users, UserPlus, FileSearch, FilePlus, TrendingUp, TrendingDown } from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

interface Stats {
  totalUsers: number
  todayUsers: number
  totalAnalyses: number
  todayAnalyses: number
  totalTopup: number
  totalSpent: number
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
  const fmtDate = (d: string) => d.slice(5) // MM-DD

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">仪表盘</h1>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard title="总用户数" value={stats?.totalUsers || 0} icon={Users} color="bg-indigo-500" />
        <StatCard title="今日新增" value={stats?.todayUsers || 0} icon={UserPlus} color="bg-emerald-500" />
        <StatCard title="总分析数" value={stats?.totalAnalyses || 0} icon={FileSearch} color="bg-violet-500" />
        <StatCard title="今日分析" value={stats?.todayAnalyses || 0} icon={FilePlus} color="bg-cyan-500" />
        <StatCard title="总充值" value={fmtCredit(stats?.totalTopup || 0)} icon={TrendingUp} color="bg-amber-500" />
        <StatCard title="总消费" value={fmtCredit(stats?.totalSpent || 0)} icon={TrendingDown} color="bg-rose-500" />
      </div>

      {/* Charts */}
      {charts && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* User Growth */}
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

          {/* Analysis Stats */}
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

          {/* Credit Flow */}
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
