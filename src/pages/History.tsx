import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/backend'
import { useAuthStore } from '../store/authStore'
import { useAnalysisStore } from '../store/analysisStore'
import { format } from 'date-fns'
import { ExternalLink, ChevronLeft, ChevronRight, Inbox, Clock, Trash2 } from 'lucide-react'
import { DecisionCard, parseResult, riskConfig } from '../components/DecisionCard'
import { SkeletonList } from '../components/Skeleton'
import { useToast } from '../components/Toast'

interface AnalysisRecord {
  id: string
  event_url: string
  analysis_result: string | null
  status: 'pending' | 'completed' | 'failed'
  created_at: string
}

const PAGE_SIZE = 10

export const History: React.FC = () => {
  const { t } = useTranslation()
  const [records, setRecords] = useState<AnalysisRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const { privyUserId } = useAuthStore()
  const statusConfig = {
    completed: { label: t('history.status.completed'), className: 'text-terracotta bg-terracotta/5' },
    pending: { label: t('history.status.pending'), className: 'text-charcoal/60 bg-charcoal/5' },
    failed: { label: t('history.status.failed'), className: 'text-red-600 bg-red-50' },
  }
  // Re-fetch when any session completes
  const completedCount = useAnalysisStore((s) => Object.values(s.sessions).filter(ss => ss.status === 'completed').length)
  const [selectedRecord, setSelectedRecord] = useState<AnalysisRecord | null>(null)
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())
  const toast = useToast()

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  const deleteRecord = async (record: AnalysisRecord, e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (deletingIds.has(record.id)) return

    setDeletingIds((prev) => new Set(prev).add(record.id))
    try {
      await api.deleteAnalysis(record.id)

      setRecords((prev) => prev.filter((r) => r.id !== record.id))
      setTotalCount((prev) => prev - 1)
      if (selectedRecord?.id === record.id) setSelectedRecord(null)
      toast.success(t('history.toast.deleted'))
    } catch (err) {
      console.error('Delete failed:', err)
      toast.error(t('history.toast.deleteFailed'))
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev)
        next.delete(record.id)
        return next
      })
    }
  }

  useEffect(() => {
    const fetchRecords = async () => {
      if (!privyUserId) return

      setLoading(true)
      try {
        const res = await api.getAnalysisHistory(currentPage, PAGE_SIZE)
        setTotalCount(res.total || 0)
        setRecords(res.records || [])
      } catch (err) {
        console.error('Error fetching records:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchRecords()
  }, [privyUserId, currentPage, completedCount])

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page)
      setSelectedRecord(null)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 h-[calc(100vh-160px)] animate-fade-in-up">
      {/* List Column - Minimalist */}
      <div className="lg:col-span-1 bg-white border border-charcoal/5 rounded-lg overflow-hidden flex flex-col">
        <div className="p-4 border-b border-charcoal/5 bg-warm-white/50">
          <h2 className="font-serif text-lg text-charcoal flex items-center gap-2">
            <Clock className="w-4 h-4 text-charcoal/40" />
            {t('history.title')}
          </h2>
          <p className="text-xs text-charcoal/40 mt-1 pl-6">{t('history.records', { count: totalCount })}</p>
        </div>

        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="p-4"><SkeletonList count={5} /></div>
          ) : records.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-charcoal/40">
              <Inbox className="w-8 h-8 mb-2 opacity-50" />
              <p className="text-sm">{t('history.empty')}</p>
            </div>
          ) : (
            <div className="divide-y divide-charcoal/5">
              {records.map((record) => {
                const status = statusConfig[record.status]
                const isSelected = selectedRecord?.id === record.id
                return (
                  <div
                    key={record.id}
                    onClick={() => setSelectedRecord(record)}
                    className={`p-4 cursor-pointer transition-colors duration-200 group ${
                      isSelected
                        ? 'bg-sand/30 border-l-4 border-terracotta pl-[13px]' // compensalte padding for border
                        : 'hover:bg-warm-white border-l-4 border-transparent'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <p className={`text-sm font-medium truncate pr-4 ${isSelected ? 'text-charcoal' : 'text-charcoal/80'}`} title={record.event_url}>
                        {record.event_url.replace('https://polymarket.com/event/', '')}
                      </p>
                    </div>
                    <div className="flex justify-between items-center mt-2">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wider ${status.className}`}>
                          {status.label}
                        </span>
                        {record.status === 'completed' && record.analysis_result && (() => {
                          const { decision } = parseResult(record.analysis_result)
                          if (!decision) return null
                          const rc = riskConfig[decision.risk]
                          if (!rc) return null
                          return <span className="text-xs" title={t(rc.descKey)}>{rc.emoji}</span>
                        })()}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => deleteRecord(record, e)}
                          disabled={deletingIds.has(record.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded text-charcoal/30 hover:text-red-500 hover:bg-red-50 transition-all disabled:opacity-50"
                          title="Delete record"
                        >
                          <Trash2 size={12} />
                        </button>
                        <span className="text-[10px] text-charcoal/40 font-mono">
                          {format(new Date(record.created_at), 'MM/dd HH:mm')}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-3 border-t border-charcoal/5 flex items-center justify-center bg-warm-white/50">
            <div className="flex items-center space-x-2">
              <button
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1}
                className="p-1.5 rounded hover:bg-charcoal/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-charcoal/60"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs text-charcoal/60 font-mono">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded hover:bg-charcoal/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-charcoal/60"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Column - Paper-like */}
      <div className="lg:col-span-2 bg-white border border-charcoal/5 rounded-lg overflow-hidden flex flex-col shadow-sm">
        {selectedRecord ? (
          <>
            <div className="p-6 border-b border-charcoal/5 flex justify-between items-start bg-warm-white/30">
              <div>
                <h3 className="font-serif text-xl text-charcoal mb-1">{t('history.report.title')}</h3>
                <p className="text-xs text-charcoal/40 font-mono">
                  {t('history.report.generated', { date: format(new Date(selectedRecord.created_at), 'yyyy-MM-dd HH:mm') })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => deleteRecord(selectedRecord)}
                  disabled={deletingIds.has(selectedRecord.id)}
                  className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-charcoal/40 border border-charcoal/10 rounded hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  <Trash2 size={12} className="mr-1.5" /> {t('history.report.delete')}
                </button>
                <a
                  href={selectedRecord.event_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-terracotta border border-terracotta/20 rounded hover:bg-terracotta hover:text-white transition-colors"
                >
                  {t('history.report.viewSource')} <ExternalLink size={12} className="ml-1.5" />
                </a>
              </div>
            </div>
            
            <div className="p-8 overflow-y-auto flex-1">
              {selectedRecord.analysis_result ? (
                <DecisionCard result={selectedRecord.analysis_result} eventUrl={selectedRecord.event_url} />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-charcoal/30">
                  <Clock className="w-12 h-12 mb-3 opacity-20" />
                  <p className="text-sm font-serif italic">{t('history.report.pendingText')}</p>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-charcoal/30 bg-warm-white/10">
            <div className="w-16 h-16 border border-charcoal/10 rounded-full flex items-center justify-center mb-4">
              <Inbox className="w-8 h-8 opacity-40" />
            </div>
            <p className="text-sm font-serif">{t('history.report.selectPrompt')}</p>
          </div>
        )}
      </div>
    </div>
  )
}

