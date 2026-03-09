import React, { useEffect, useState } from 'react'
import { api } from '../../lib/backend'
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'

interface AnalysisRow {
  id: string
  event_url: string
  status: string
  user_id: string
  credits_charged: number
  created_at: string
}

const statusColors: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  completed: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
  cancelled: 'bg-charcoal/5 text-charcoal/60',
}

export const AdminAnalyses: React.FC = () => {
  const [analyses, setAnalyses] = useState<AnalysisRow[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.adminAnalyses(page)
      .then((data) => {
        setAnalyses(data.analyses || [])
        setTotalPages(data.totalPages || 1)
      })
      .catch((err) => console.error('Failed to load analyses:', err))
      .finally(() => setLoading(false))
  }, [page])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-serif text-charcoal">Analysis Records</h1>

      <div className="bg-white border border-charcoal/5 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-charcoal/5 bg-warm-white">
                <th className="text-left px-4 py-3 font-medium text-charcoal/60">Event URL</th>
                <th className="text-left px-4 py-3 font-medium text-charcoal/60">User</th>
                <th className="text-center px-4 py-3 font-medium text-charcoal/60">Status</th>
                <th className="text-right px-4 py-3 font-medium text-charcoal/60">Credits</th>
                <th className="text-left px-4 py-3 font-medium text-charcoal/60">Date</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-charcoal/5">
                    <td colSpan={5} className="px-4 py-4">
                      <div className="h-4 bg-charcoal/5 rounded animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : analyses.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-charcoal/40">No analyses found</td>
                </tr>
              ) : (
                analyses.map((a) => (
                  <tr key={a.id} className="border-b border-charcoal/5 hover:bg-warm-white/50">
                    <td className="px-4 py-3 max-w-[300px]">
                      <a
                        href={a.event_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-terracotta hover:underline truncate block text-xs"
                      >
                        {a.event_url.replace('https://polymarket.com/', '')}
                        <ExternalLink className="w-3 h-3 inline ml-1" />
                      </a>
                    </td>
                    <td className="px-4 py-3 text-xs text-charcoal/60 font-mono">
                      {a.user_id.startsWith('system:') ? a.user_id : a.user_id.slice(0, 16) + '...'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[a.status] || 'bg-charcoal/5 text-charcoal/60'}`}>
                        {a.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-charcoal/60">
                      {a.credits_charged ? (a.credits_charged / 100).toFixed(2) : '-'}
                    </td>
                    <td className="px-4 py-3 text-xs text-charcoal/60">
                      {new Date(a.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-charcoal/5">
          <span className="text-xs text-charcoal/40">Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1.5 text-charcoal/40 hover:text-charcoal disabled:opacity-30 rounded-lg"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1.5 text-charcoal/40 hover:text-charcoal disabled:opacity-30 rounded-lg"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
