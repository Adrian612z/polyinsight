import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import { format } from 'date-fns'
import { FileText, ExternalLink, Calendar, ChevronLeft, ChevronRight, Clock, Inbox } from 'lucide-react'
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
  completed: { label: '已完成', className: 'bg-green-100 text-green-700' },
  pending: { label: '处理中', className: 'bg-yellow-100 text-yellow-700' },
  failed: { label: '失败', className: 'bg-red-100 text-red-700' },
}

export const History: React.FC = () => {
  const [records, setRecords] = useState<AnalysisRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const { session } = useAuthStore()
  const [selectedRecord, setSelectedRecord] = useState<AnalysisRecord | null>(null)

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  useEffect(() => {
    const fetchRecords = async () => {
      if (!session?.user.id) return

      setLoading(true)
      try {
        const { count } = await supabase
          .from('analysis_records')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', session.user.id)

        setTotalCount(count || 0)

        const from = (currentPage - 1) * PAGE_SIZE
        const to = from + PAGE_SIZE - 1

        const { data, error } = await supabase
          .from('analysis_records')
          .select('*')
          .eq('user_id', session.user.id)
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
  }, [session?.user.id, currentPage])

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page)
      setSelectedRecord(null)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-160px)] animate-fade-in-up">
      {/* 左侧列表 */}
      <div className="lg:col-span-1 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md rounded-2xl shadow-sm border border-gray-200/50 dark:border-gray-700/50 overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-lg flex items-center justify-center">
              <Clock className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900 dark:text-white">分析历史</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">{totalCount} 条记录</p>
            </div>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-3 space-y-2">
          {loading ? (
            <SkeletonList count={5} />
          ) : records.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400 dark:text-gray-500">
              <Inbox className="w-12 h-12 mb-3" />
              <p className="text-sm">暂无分析记录</p>
            </div>
          ) : (
            records.map((record) => {
              const status = statusConfig[record.status]
              return (
                <div
                  key={record.id}
                  onClick={() => setSelectedRecord(record)}
                  className={`p-3 rounded-xl cursor-pointer transition-all duration-200 border ${
                    selectedRecord?.id === record.id
                      ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-700 shadow-sm'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-700 border-transparent hover:border-gray-200 dark:hover:border-gray-600'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${status.className}`}>
                      {status.label}
                    </span>
                    <span className="text-xs text-gray-400 dark:text-gray-500 flex items-center">
                      <Calendar size={12} className="mr-1" />
                      {format(new Date(record.created_at), 'MM/dd HH:mm')}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate" title={record.event_url}>
                    {record.event_url.replace('https://polymarket.com/event/', '')}
                  </p>
                </div>
              )
            })
          )}
        </div>

        {/* 分页控件 */}
        {totalPages > 1 && (
          <div className="p-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-center">
            <div className="flex items-center space-x-1">
              <button
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-gray-600 dark:text-gray-400"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="px-3 py-1 text-sm text-gray-600 dark:text-gray-400 font-medium">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-gray-600 dark:text-gray-400"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 右侧详情 */}
      <div className="lg:col-span-2 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md rounded-2xl shadow-sm border border-gray-200/50 dark:border-gray-700/50 overflow-hidden flex flex-col">
        {selectedRecord ? (
          <>
            <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-indigo-100 dark:bg-indigo-900/50 rounded-lg flex items-center justify-center">
                  <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">分析报告</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {format(new Date(selectedRecord.created_at), 'yyyy年MM月dd日 HH:mm')}
                  </p>
                </div>
              </div>
              <a
                href={selectedRecord.event_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
              >
                查看原文 <ExternalLink size={14} className="ml-1.5" />
              </a>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {selectedRecord.analysis_result ? (
                <div className="prose prose-indigo dark:prose-invert max-w-none prose-headings:text-gray-900 dark:prose-headings:text-white prose-p:text-gray-600 dark:prose-p:text-gray-300 prose-strong:text-gray-900 dark:prose-strong:text-white prose-li:text-gray-600 dark:prose-li:text-gray-300">
                  <ReactMarkdown>{selectedRecord.analysis_result}</ReactMarkdown>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400 dark:text-gray-500">
                  <FileText className="w-12 h-12 mb-3" />
                  <p className="text-sm">该记录暂无分析结果</p>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500 bg-gray-50/50 dark:bg-gray-900/50">
            <FileText className="w-16 h-16 mb-4 text-gray-300 dark:text-gray-600" />
            <p className="text-gray-500 dark:text-gray-400">选择一条记录查看详情</p>
          </div>
        )}
      </div>
    </div>
  )
}
