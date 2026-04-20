import { useEffect, useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  BarChart3,
  Coins,
  Filter,
  MousePointerClick,
  SearchCheck,
  UserPlus,
  Wallet,
} from 'lucide-react'
import { api } from '../lib/api'
import StatCard from '../components/StatCard'

type GroupBy = 'source_platform' | 'source_type' | 'campaign_code'

interface GrowthSummary {
  visits: number
  uniqueVisitors: number
  registrations: number
  firstAnalyses: number
  payers: number
  approvedOrders: number
  revenueTokens: number
}

interface GrowthSeriesPoint {
  date: string
  visits: number
  registrations: number
  firstAnalyses: number
  payers: number
  approvedOrders: number
  revenueTokens: number
}

interface GrowthBreakdownRow {
  key: string
  label: string
  visits: number
  newVisitorVisits: number
  uniqueVisitors: number
  registrations: number
  firstAnalyses: number
  payers: number
  approvedOrders: number
  revenueTokens: number
  visitToRegisterRate: number
  registerToFirstAnalysisRate: number
  registerToPayRate: number
}

interface GrowthResponse {
  summary: GrowthSummary
  series: GrowthSeriesPoint[]
  breakdown: GrowthBreakdownRow[]
}

const dayOptions = [
  { value: 7, label: '近 7 天' },
  { value: 30, label: '近 30 天' },
  { value: 90, label: '近 90 天' },
]

const groupOptions: Array<{ value: GroupBy; label: string }> = [
  { value: 'source_platform', label: '按来源平台' },
  { value: 'source_type', label: '按来源类型' },
  { value: 'campaign_code', label: '按活动代码' },
]

function formatRate(value: number): string {
  return `${(value * 100).toFixed(value >= 0.1 ? 1 : 2)}%`
}

function formatTokens(value: number): string {
  return value.toFixed(value >= 100 ? 0 : 2)
}

function fmtDate(value: string): string {
  return value.slice(5)
}

export default function Growth() {
  const [days, setDays] = useState(30)
  const [groupBy, setGroupBy] = useState<GroupBy>('source_platform')
  const [data, setData] = useState<GrowthResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.growth(days, groupBy)
      .then(setData)
      .finally(() => setLoading(false))
  }, [days, groupBy])

  const chartData = useMemo(
    () => (data?.series || []).map((item) => ({
      ...item,
      revenueTokens: Number(item.revenueTokens || 0),
    })),
    [data],
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    )
  }

  const summary = data?.summary
  const breakdown = data?.breakdown || []

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">增长分析</h1>
          <p className="text-sm text-gray-500 mt-1">
            追踪访问、注册、首个分析和充值，按来源平台、来源类型或活动代码拆分漏斗。
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <select
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
          >
            {dayOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>

          <select
            value={groupBy}
            onChange={(event) => setGroupBy(event.target.value as GroupBy)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
          >
            {groupOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="访问会话" value={summary?.visits || 0} icon={MousePointerClick} color="bg-indigo-500" />
        <StatCard title="独立访客" value={summary?.uniqueVisitors || 0} icon={Filter} color="bg-slate-500" />
        <StatCard title="注册用户" value={summary?.registrations || 0} icon={UserPlus} color="bg-emerald-500" />
        <StatCard title="首个分析" value={summary?.firstAnalyses || 0} icon={SearchCheck} color="bg-cyan-500" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard title="充值用户" value={summary?.payers || 0} icon={Wallet} color="bg-amber-500" />
        <StatCard title="通过订单" value={summary?.approvedOrders || 0} icon={BarChart3} color="bg-violet-500" />
        <StatCard
          title="收入（Token）"
          value={formatTokens(summary?.revenueTokens || 0)}
          icon={Coins}
          color="bg-rose-500"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">访问与注册趋势</h3>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip labelFormatter={(value: string | number) => `日期: ${value}`} />
              <Legend />
              <Area type="monotone" dataKey="visits" name="访问" stroke="#6366f1" fill="#e0e7ff" strokeWidth={2} />
              <Area type="monotone" dataKey="registrations" name="注册" stroke="#10b981" fill="#d1fae5" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">首个分析、充值与收入</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 11 }} />
              <YAxis yAxisId="left" allowDecimals={false} tick={{ fontSize: 11 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
              <Tooltip labelFormatter={(value: string | number) => `日期: ${value}`} />
              <Legend />
              <Bar yAxisId="left" dataKey="firstAnalyses" name="首个分析" fill="#06b6d4" radius={[2, 2, 0, 0]} />
              <Bar yAxisId="left" dataKey="payers" name="充值用户" fill="#f59e0b" radius={[2, 2, 0, 0]} />
              <Bar yAxisId="right" dataKey="revenueTokens" name="收入" fill="#ef4444" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">来源拆分漏斗</h3>
          <p className="text-xs text-gray-500 mt-1">
            当前维度：{groupOptions.find((option) => option.value === groupBy)?.label}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-3 font-medium text-gray-600">来源</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">访问</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">新访客访问</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">访客</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">注册</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">首个分析</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">充值用户</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">订单</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">收入</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">访转注</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">注转分析</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">注转付费</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.length === 0 ? (
                <tr>
                  <td colSpan={12} className="text-center py-12 text-gray-400">暂无增长数据</td>
                </tr>
              ) : (
                breakdown.map((row) => (
                  <tr key={row.key || row.label} className="border-b border-gray-50 hover:bg-gray-50/60">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{row.label}</div>
                      <div className="text-xs text-gray-400">{row.key || '—'}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-700">{row.visits}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-700">{row.newVisitorVisits}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-700">{row.uniqueVisitors}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-700">{row.registrations}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-700">{row.firstAnalyses}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-700">{row.payers}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-700">{row.approvedOrders}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-700">{formatTokens(row.revenueTokens)}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-700">{formatRate(row.visitToRegisterRate)}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-700">{formatRate(row.registerToFirstAnalysisRate)}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-700">{formatRate(row.registerToPayRate)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
