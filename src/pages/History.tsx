import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import { format } from 'date-fns'
import { FileText, ExternalLink, Calendar } from 'lucide-react'
import ReactMarkdown from 'react-markdown'

interface AnalysisRecord {
  id: string
  event_url: string
  analysis_result: string | null
  status: 'pending' | 'completed' | 'failed'
  created_at: string
}

export const History: React.FC = () => {
  const [records, setRecords] = useState<AnalysisRecord[]>([])
  const [loading, setLoading] = useState(true)
  const { session } = useAuthStore()
  const [selectedRecord, setSelectedRecord] = useState<AnalysisRecord | null>(null)

  useEffect(() => {
    const fetchRecords = async () => {
      if (!session?.user.id) return

      try {
        const { data, error } = await supabase
          .from('analysis_records')
          .select('*')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false })

        if (error) throw error
        setRecords(data || [])
      } catch (err) {
        console.error('Error fetching records:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchRecords()
  }, [session?.user.id])

  if (loading) {
    return <div className="text-center py-12">Loading history...</div>
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-140px)]">
      <div className="lg:col-span-1 bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <h2 className="font-semibold text-gray-700">Analysis History</h2>
        </div>
        <div className="overflow-y-auto flex-1 p-2 space-y-2">
          {records.length === 0 ? (
            <div className="text-center text-gray-500 py-8">No records found</div>
          ) : (
            records.map((record) => (
              <div
                key={record.id}
                onClick={() => setSelectedRecord(record)}
                className={`p-3 rounded-md cursor-pointer transition-colors border ${
                  selectedRecord?.id === record.id
                    ? 'bg-blue-50 border-blue-200'
                    : 'hover:bg-gray-50 border-transparent'
                }`}
              >
                <div className="flex justify-between items-start mb-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    record.status === 'completed' ? 'bg-green-100 text-green-800' :
                    record.status === 'failed' ? 'bg-red-100 text-red-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {record.status}
                  </span>
                  <span className="text-xs text-gray-500 flex items-center">
                    <Calendar size={12} className="mr-1" />
                    {format(new Date(record.created_at), 'MMM d, HH:mm')}
                  </span>
                </div>
                <p className="text-sm font-medium text-gray-900 truncate" title={record.event_url}>
                  {record.event_url}
                </p>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="lg:col-span-2 bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden flex flex-col">
        {selectedRecord ? (
          <>
            <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
              <h3 className="font-semibold text-gray-700 flex items-center">
                <FileText size={18} className="mr-2 text-blue-600" />
                Report Details
              </h3>
              <a 
                href={selectedRecord.event_url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:text-blue-800 flex items-center"
              >
                Open Link <ExternalLink size={14} className="ml-1" />
              </a>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {selectedRecord.analysis_result ? (
                <div className="prose prose-blue max-w-none">
                  <ReactMarkdown>{selectedRecord.analysis_result}</ReactMarkdown>
                </div>
              ) : (
                <div className="text-center text-gray-500 py-12">
                  No analysis result available for this record.
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400 bg-gray-50">
            Select a record to view details
          </div>
        )}
      </div>
    </div>
  )
}
