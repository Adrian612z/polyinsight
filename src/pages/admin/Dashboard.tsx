import React, { useEffect, useState } from 'react'
import { api } from '../../lib/backend'
import { Users, BarChart3, Coins, Activity } from 'lucide-react'

interface DashboardStats {
  totalUsers: number
  todayNewUsers: number
  totalAnalyses: number
  totalCreditsGranted: number
}

export const AdminDashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.adminDashboard()
      .then((data) => setStats(data))
      .catch((err) => console.error('Failed to load dashboard:', err))
      .finally(() => setLoading(false))
  }, [])

  const cards = stats ? [
    { label: 'Total Users', value: stats.totalUsers, icon: Users, color: 'text-blue-600 bg-blue-50' },
    { label: 'New Today', value: stats.todayNewUsers, icon: Activity, color: 'text-emerald-600 bg-emerald-50' },
    { label: 'Total Analyses', value: stats.totalAnalyses, icon: BarChart3, color: 'text-purple-600 bg-purple-50' },
    { label: 'Credits Granted', value: (stats.totalCreditsGranted / 100).toFixed(2), icon: Coins, color: 'text-terracotta bg-terracotta/10' },
  ] : []

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-serif text-charcoal">Admin Dashboard</h1>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white border border-charcoal/5 rounded-xl p-6 animate-pulse">
              <div className="h-4 bg-charcoal/5 rounded w-1/2 mb-3" />
              <div className="h-8 bg-charcoal/5 rounded w-1/3" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map((card) => {
            const Icon = card.icon
            return (
              <div key={card.label} className="bg-white border border-charcoal/5 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`p-2 rounded-lg ${card.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-sm text-charcoal/60">{card.label}</span>
                </div>
                <div className="text-2xl font-mono font-semibold text-charcoal">{card.value}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
