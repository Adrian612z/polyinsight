import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import { useAnalysisStore } from '../store/analysisStore'
import { format } from 'date-fns'
import { ExternalLink, ChevronLeft, ChevronRight, Inbox, Clock } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { SkeletonList } from '../components/Skeleton'

interface AnalysisRecord {
  id: string
  event_url: string
  analysis_result: string | null
  status: 'pending' | 'completed' | 'failed'
  created_at: string
}

const PAGE_SIZE = 10

const statusConfig = {
  completed: { label: 'Completed', className: 'text-terracotta bg-terracotta/5' },
  pending: { label: 'Processing', className: 'text-charcoal/60 bg-charcoal/5' },
  failed: { label: 'Failed', className: 'text-red-600 bg-red-50' },
}

export const History: React.FC = () => {
  const [records, setRecords] = useState<AnalysisRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const { privyUserId } = useAuthStore()
  const { currentRecordId, pollingStatus } = useAnalysisStore()
  const [selectedRecord, setSelectedRecord] = useState<AnalysisRecord | null>(null)

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  useEffect(() => {
    const fetchRecords = async () => {
      if (!privyUserId) return

      setLoading(true)
      try {
        const { count } = await supabase
          .from('analysis_records')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', privyUserId)

        setTotalCount(count || 0)

        const from = (currentPage - 1) * PAGE_SIZE
        const to = from + PAGE_SIZE - 1

        const { data, error } = await supabase
          .from('analysis_records')
          .select('*')
          .eq('user_id', privyUserId)
          .order('created_at', { ascending: false })
          .range(from, to)

        if (error) throw error
        setRecords(data || [])
      } catch (err) {
        console.error('Error fetching records:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchRecords()
  }, [privyUserId, currentPage, currentRecordId, pollingStatus])

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
            History
          </h2>
          <p className="text-xs text-charcoal/40 mt-1 pl-6">{totalCount} records</p>
        </div>

        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="p-4"><SkeletonList count={5} /></div>
          ) : records.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-charcoal/40">
              <Inbox className="w-8 h-8 mb-2 opacity-50" />
              <p className="text-sm">No records found</p>
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
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wider ${status.className}`}>
                        {status.label}
                      </span>
                      <span className="text-[10px] text-charcoal/40 font-mono">
                        {format(new Date(record.created_at), 'MM/dd HH:mm')}
                      </span>
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
                <h3 className="font-serif text-xl text-charcoal mb-1">Analysis Report</h3>
                <p className="text-xs text-charcoal/40 font-mono">
                  Generated on {format(new Date(selectedRecord.created_at), 'yyyy-MM-dd HH:mm')}
                </p>
              </div>
              <a
                href={selectedRecord.event_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-terracotta border border-terracotta/20 rounded hover:bg-terracotta hover:text-white transition-colors"
              >
                View Source <ExternalLink size={12} className="ml-1.5" />
              </a>
            </div>
            
            <div className="p-8 overflow-y-auto flex-1">
              {selectedRecord.analysis_result ? (
                <div className="prose prose-stone max-w-none prose-headings:font-serif prose-headings:font-normal prose-h2:text-charcoal prose-p:text-charcoal/80 prose-a:text-terracotta hover:prose-a:text-[#C05638]">
                  <ReactMarkdown>{selectedRecord.analysis_result}</ReactMarkdown>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-charcoal/30">
                  <Clock className="w-12 h-12 mb-3 opacity-20" />
                  <p className="text-sm font-serif italic">Analysis pending or failed...</p>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-charcoal/30 bg-warm-white/10">
            <div className="w-16 h-16 border border-charcoal/10 rounded-full flex items-center justify-center mb-4">
              <Inbox className="w-8 h-8 opacity-40" />
            </div>
            <p className="text-sm font-serif">Select a record to view details</p>
          </div>
        )}
      </div>
    </div>
  )
}

