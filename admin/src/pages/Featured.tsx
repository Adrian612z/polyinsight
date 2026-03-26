import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { Plus, Trash2, Star, ExternalLink } from 'lucide-react'
import { format } from 'date-fns'

interface FeaturedAnalysis {
  id: string
  event_slug: string
  event_title: string
  category: string | null
  polymarket_url: string
  analysis_record_id: string | null
  decision_data: any
  mispricing_score: number | null
  is_active: boolean
  expires_at: string | null
  created_at: string
}

type BatchAction = 'hide' | 'delete'

export default function Featured() {
  const [items, setItems] = useState<FeaturedAnalysis[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [form, setForm] = useState({
    url: '',
    lang: 'zh' as 'zh' | 'en',
  })
  const [adding, setAdding] = useState(false)
  const [batchAction, setBatchAction] = useState<BatchAction | null>(null)
  const [itemActionId, setItemActionId] = useState<string | null>(null)
  const [queueNotice, setQueueNotice] = useState<string | null>(null)
  const selectAllRef = useRef<HTMLInputElement | null>(null)

  const fetchData = async () => {
    setLoading(true)
    try {
      const data = await api.featured()
      const nextItems = data.featured || []
      const nextIds = new Set(nextItems.map((item: FeaturedAnalysis) => item.id))

      setItems(nextItems)
      setSelectedIds((current) => current.filter((id) => nextIds.has(id)))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void fetchData() }, [])

  const allSelected = items.length > 0 && selectedIds.length === items.length
  const someSelected = selectedIds.length > 0 && !allSelected
  const controlsDisabled = loading || adding || batchAction !== null || itemActionId !== null

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected
    }
  }, [someSelected])

  const toggleSelected = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((selectedId) => selectedId !== id) : [...current, id]
    )
  }

  const toggleSelectAll = () => {
    setSelectedIds((current) => (current.length === items.length ? [] : items.map((item) => item.id)))
  }

  const handleAdd = async () => {
    if (!form.url.trim()) return
    setAdding(true)
    try {
      await api.queueFeatured(form.url.trim(), form.lang)
      setShowAdd(false)
      setForm({ url: '', lang: 'zh' })
      setQueueNotice('已提交到 Code 引擎分析队列，分析完成后会自动加入下方推荐列表。')
      await fetchData()
    } finally {
      setAdding(false)
    }
  }

  const handleToggle = async (item: FeaturedAnalysis) => {
    setItemActionId(item.id)
    try {
      await api.updateFeatured(item.id, { is_active: !item.is_active })
      await fetchData()
    } finally {
      setItemActionId(null)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除？')) return
    setItemActionId(id)
    try {
      await api.removeFeatured(id)
      setSelectedIds((current) => current.filter((selectedId) => selectedId !== id))
      await fetchData()
    } finally {
      setItemActionId(null)
    }
  }

  const handleBatchAction = async (action: BatchAction) => {
    if (selectedIds.length === 0) return
    if (action === 'delete' && !confirm(`确定删除选中的 ${selectedIds.length} 条推荐？`)) return

    setBatchAction(action)
    try {
      await api.batchFeatured(action, selectedIds)
      setSelectedIds([])
      await fetchData()
    } finally {
      setBatchAction(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">推荐管理</h1>
        <button
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
        >
          <Plus className="w-4 h-4" /> 添加推荐
        </button>
      </div>

      {queueNotice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {queueNotice}
        </div>
      )}

      {/* List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-gray-400">加载中...</div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 text-gray-400">暂无推荐</div>
        ) : (
          <div>
            <div className="border-b border-gray-100 bg-gray-50/80 px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <label className="inline-flex items-center gap-3 text-sm font-medium text-gray-700 select-none">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  disabled={controlsDisabled}
                  aria-label="全选推荐"
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                />
                <span>全选</span>
                <span className="text-xs font-normal text-gray-500">
                  {selectedIds.length > 0 ? `已选 ${selectedIds.length} / ${items.length}` : `共 ${items.length} 条推荐`}
                </span>
              </label>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => handleBatchAction('hide')}
                  disabled={selectedIds.length === 0 || controlsDisabled}
                  className="inline-flex items-center rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {batchAction === 'hide' ? '隐藏中...' : '批量隐藏'}
                </button>
                <button
                  onClick={() => handleBatchAction('delete')}
                  disabled={selectedIds.length === 0 || controlsDisabled}
                  className="inline-flex items-center rounded-lg bg-red-50 px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {batchAction === 'delete' ? '删除中...' : '批量删除'}
                </button>
              </div>
            </div>

            <div className="divide-y divide-gray-50">
            {items.map((item) => (
              <div
                key={item.id}
                className={`p-4 flex items-start gap-4 transition-colors ${
                  selectedIds.includes(item.id) ? 'bg-indigo-50/40' : 'hover:bg-gray-50/50'
                }`}
              >
                <div className="pt-1">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(item.id)}
                    onChange={() => toggleSelected(item.id)}
                    disabled={controlsDisabled}
                    aria-label={`选择推荐 ${item.event_title}`}
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
                <div className={`p-2 rounded-lg ${item.is_active ? 'bg-amber-100' : 'bg-gray-100'}`}>
                  <Star className={`w-5 h-5 ${item.is_active ? 'text-amber-500' : 'text-gray-400'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-gray-900 truncate">{item.event_title}</h3>
                    {!item.is_active && (
                      <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">已隐藏</span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                    <span>slug: {item.event_slug}</span>
                    {item.category && <span>分类: {item.category}</span>}
                    {item.mispricing_score != null && <span>错价分: {item.mispricing_score}</span>}
                    <span>{format(new Date(item.created_at), 'yyyy-MM-dd')}</span>
                  </div>
                  {item.polymarket_url && (
                    <a href={item.polymarket_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-600 mt-1">
                      Polymarket <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggle(item)}
                    disabled={controlsDisabled}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                      item.is_active
                        ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    } disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    {itemActionId === item.id ? '处理中...' : item.is_active ? '隐藏' : '显示'}
                  </button>
                  <button
                    onClick={() => handleDelete(item.id)}
                    disabled={controlsDisabled}
                    className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
            </div>
          </div>
        )}
      </div>

      {/* Add Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">手动添加推荐事件</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Polymarket URL *</label>
                <input
                  type="url"
                  value={form.url}
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="https://polymarket.com/event/..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">分析语言</label>
                <select
                  value={form.lang}
                  onChange={(e) => setForm({ ...form, lang: e.target.value === 'en' ? 'en' : 'zh' })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                >
                  <option value="zh">中文</option>
                  <option value="en">English</option>
                </select>
              </div>
              <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm leading-6 text-gray-600">
                提交后会使用 Code 引擎分析这个事件。分析完成后，系统会自动把结果写入推荐列表；如果事件已存在，会更新原有推荐。
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setShowAdd(false)} className="flex-1 py-2 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50">
                  取消
                </button>
                <button
                  onClick={handleAdd}
                  disabled={adding || !form.url.trim()}
                  className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                >
                  {adding ? '提交中...' : '提交分析'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
