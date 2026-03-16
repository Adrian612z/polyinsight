import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/backend'
import { fetchAndCacheHistoryPage, getCachedHistoryPage, setCachedHistoryPage } from '../lib/pageCache'
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
  const pageLabel = t('history.records', { count: totalCount })

  const deleteRecord = async (record: AnalysisRecord, e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (deletingIds.has(record.id)) return

    setDeletingIds((prev) => new Set(prev).add(record.id))
    try {
      await api.deleteAnalysis(record.id)

      const nextRecords = records.filter((r) => r.id !== record.id)
      const nextTotal = Math.max(0, totalCount - 1)

      setRecords(nextRecords)
      setTotalCount(nextTotal)
      if (privyUserId) {
        setCachedHistoryPage(privyUserId, currentPage, PAGE_SIZE, {
          records: nextRecords,
          total: nextTotal,
          page: currentPage,
        })
      }
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
    if (!privyUserId) {
      setLoading(false)
      return
    }

    let cancelled = false
    const cached = getCachedHistoryPage(privyUserId, currentPage, PAGE_SIZE)

    if (cached) {
      setRecords(cached.records)
      setTotalCount(cached.total)
      setLoading(false)
    } else {
      setLoading(true)
    }

    void fetchAndCacheHistoryPage(privyUserId, currentPage, PAGE_SIZE)
      .then((res) => {
        if (cancelled) return
        setTotalCount(res.total)
        setRecords(res.records)
        setLoading(false)
      })
      .catch((err) => {
        console.error('Error fetching records:', err)
        if (cancelled || cached) return
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [privyUserId, currentPage, completedCount])

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page)
      setSelectedRecord(null)
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_minmax(0,1fr)] xl:grid-cols-[380px_minmax(0,1fr)] min-h-[calc(100vh-160px)] animate-fade-in-up">
      {/* List Column - Minimalist */}
      <div className="workspace-frame rounded-[30px] overflow-hidden flex flex-col min-h-[520px]">
        <div className="p-5 border-b border-charcoal/5">
          <div className="section-label mb-2">History</div>
          <h2 className="font-serif text-2xl text-charcoal flex items-center gap-3">
            <Clock className="w-4 h-4 text-charcoal/40" />
            {t('history.title')}
          </h2>
          <p className="text-sm text-charcoal/48 mt-2 pl-7">{pageLabel}</p>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-3">
          {loading ? (
            <SkeletonList count={5} />
          ) : records.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-charcoal/40">
              <Inbox className="w-8 h-8 mb-2 opacity-50" />
              <p className="text-sm">{t('history.empty')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {records.map((record) => {
                const status = statusConfig[record.status]
                const isSelected = selectedRecord?.id === record.id
                return (
                  <div
                    key={record.id}
                    onClick={() => setSelectedRecord(record)}
                    className={`workspace-list-item rounded-[22px] p-4 cursor-pointer group ${
                      isSelected ? 'workspace-list-item-active' : ''
                    }`}
                  >
                    <div className="flex justify-between items-start gap-4 mb-3">
                      <p className={`text-sm font-semibold truncate pr-4 ${isSelected ? 'text-charcoal' : 'text-charcoal/82'}`} title={record.event_url}>
                        {record.event_url.replace('https://polymarket.com/event/', '')}
                      </p>
                      <span className={`shrink-0 ${record.status === 'completed' ? 'tone-safe-badge' : record.status === 'pending' ? 'tone-caution-badge' : 'tone-danger-badge'}`}>
                        {status.label}
                      </span>
                    </div>
                    <div className="flex justify-between items-center mt-2">
                      <div className="flex items-center gap-1.5">
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
                          className="opacity-0 group-hover:opacity-100 p-2 rounded-full text-charcoal/30 hover:text-red-500 transition-all disabled:opacity-50"
                          title={t('history.report.delete')}
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
          <div className="p-4 border-t border-charcoal/5 flex items-center justify-center">
            <div className="flex items-center space-x-2">
              <button
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1}
                className="theme-surface-button p-2 rounded-full disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-charcoal/60"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs text-charcoal/60 font-mono">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="theme-surface-button p-2 rounded-full disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-charcoal/60"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Column - Paper-like */}
      <div className="premium-card rounded-[30px] overflow-hidden flex flex-col min-h-[520px]">
        {selectedRecord ? (
          <>
            <div className="p-6 border-b border-charcoal/5 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="section-label mb-2">{t('history.report.title')}</div>
                <h3 className="font-serif text-2xl text-charcoal mb-1">{selectedRecord.event_url.replace('https://polymarket.com/event/', '')}</h3>
                <p className="text-xs text-charcoal/40 font-mono">
                  {t('history.report.generated', { date: format(new Date(selectedRecord.created_at), 'yyyy-MM-dd HH:mm') })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => deleteRecord(selectedRecord)}
                  disabled={deletingIds.has(selectedRecord.id)}
                  className="theme-surface-button inline-flex items-center rounded-full px-3.5 py-2 text-xs font-medium transition-colors disabled:opacity-50 hover:text-red-500"
                >
                  <Trash2 size={12} className="mr-1.5" /> {t('history.report.delete')}
                </button>
                <a
                  href={selectedRecord.event_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="theme-contrast-button inline-flex items-center rounded-full px-3.5 py-2 text-xs font-medium transition-colors"
                >
                  {t('history.report.viewSource')} <ExternalLink size={12} className="ml-1.5" />
                </a>
              </div>
            </div>
            
            <div className="p-6 md:p-8 overflow-y-auto flex-1">
              {selectedRecord.analysis_result ? (
                <DecisionCard result={selectedRecord.analysis_result} eventUrl={selectedRecord.event_url} />
              ) : (
                <div className="workspace-subpanel rounded-[24px] flex flex-col items-center justify-center h-full text-charcoal/30 py-16">
                  <Clock className="w-12 h-12 mb-3 opacity-20" />
                  <p className="text-sm font-serif italic">{t('history.report.pendingText')}</p>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-charcoal/30 px-6">
            <div className="workspace-subpanel w-full max-w-md rounded-[28px] py-14 flex flex-col items-center justify-center">
            <div className="w-16 h-16 border border-charcoal/10 rounded-full flex items-center justify-center mb-4">
              <Inbox className="w-8 h-8 opacity-40" />
            </div>
            <p className="text-sm font-serif">{t('history.report.selectPrompt')}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
