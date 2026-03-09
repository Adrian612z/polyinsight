import React, { useEffect, useState } from 'react'
import { api } from '../../lib/backend'
import { ChevronLeft, ChevronRight, Gift } from 'lucide-react'

interface UserRow {
  id: string
  email: string | null
  display_name: string | null
  role: string
  credit_balance: number
  referral_code: string
  created_at: string
}

export const AdminUsers: React.FC = () => {
  const [users, setUsers] = useState<UserRow[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [grantModal, setGrantModal] = useState<{ userId: string; name: string } | null>(null)
  const [grantAmount, setGrantAmount] = useState('')
  const [grantDesc, setGrantDesc] = useState('')
  const [granting, setGranting] = useState(false)

  const loadUsers = (p: number) => {
    setLoading(true)
    api.adminUsers(p)
      .then((data) => {
        setUsers(data.users || [])
        setTotalPages(data.totalPages || 1)
      })
      .catch((err) => console.error('Failed to load users:', err))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadUsers(page) }, [page])

  const handleGrant = async () => {
    if (!grantModal || !grantAmount) return
    setGranting(true)
    try {
      await api.adminGrantCredits(grantModal.userId, Math.round(parseFloat(grantAmount) * 100), grantDesc || undefined)
      setGrantModal(null)
      setGrantAmount('')
      setGrantDesc('')
      loadUsers(page)
    } catch (err) {
      console.error('Grant failed:', err)
    } finally {
      setGranting(false)
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-serif text-charcoal">User Management</h1>

      <div className="bg-white border border-charcoal/5 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-charcoal/5 bg-warm-white">
                <th className="text-left px-4 py-3 font-medium text-charcoal/60">User</th>
                <th className="text-left px-4 py-3 font-medium text-charcoal/60">Role</th>
                <th className="text-right px-4 py-3 font-medium text-charcoal/60">Balance</th>
                <th className="text-left px-4 py-3 font-medium text-charcoal/60">Referral Code</th>
                <th className="text-left px-4 py-3 font-medium text-charcoal/60">Joined</th>
                <th className="text-center px-4 py-3 font-medium text-charcoal/60">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-charcoal/5">
                    <td colSpan={6} className="px-4 py-4">
                      <div className="h-4 bg-charcoal/5 rounded animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-charcoal/40">No users found</td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="border-b border-charcoal/5 hover:bg-warm-white/50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-charcoal">{user.display_name || 'N/A'}</div>
                      <div className="text-xs text-charcoal/40">{user.email || user.id.slice(0, 16) + '...'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        user.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-charcoal/5 text-charcoal/60'
                      }`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-charcoal">
                      {(user.credit_balance / 100).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-charcoal/60">{user.referral_code}</td>
                    <td className="px-4 py-3 text-xs text-charcoal/60">
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => setGrantModal({ userId: user.id, name: user.display_name || user.email || user.id.slice(0, 12) })}
                        className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 text-terracotta bg-terracotta/5 hover:bg-terracotta/10 rounded-lg transition-colors"
                      >
                        <Gift className="w-3.5 h-3.5" />
                        Grant
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
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

      {/* Grant Credits Modal */}
      {grantModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/30 backdrop-blur-sm">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl space-y-4">
            <h3 className="text-lg font-serif text-charcoal">Grant Credits</h3>
            <p className="text-sm text-charcoal/60">To: <span className="font-medium text-charcoal">{grantModal.name}</span></p>

            <div>
              <label className="text-xs text-charcoal/60 mb-1 block">Amount (credits)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={grantAmount}
                onChange={(e) => setGrantAmount(e.target.value)}
                placeholder="e.g. 5.00"
                className="w-full px-3 py-2 border border-charcoal/10 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-terracotta"
              />
            </div>

            <div>
              <label className="text-xs text-charcoal/60 mb-1 block">Description (optional)</label>
              <input
                type="text"
                value={grantDesc}
                onChange={(e) => setGrantDesc(e.target.value)}
                placeholder="e.g. Promotional grant"
                className="w-full px-3 py-2 border border-charcoal/10 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-terracotta"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => { setGrantModal(null); setGrantAmount(''); setGrantDesc('') }}
                className="flex-1 px-4 py-2 text-sm text-charcoal/60 bg-charcoal/5 hover:bg-charcoal/10 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleGrant}
                disabled={granting || !grantAmount}
                className="flex-1 px-4 py-2 text-sm text-white bg-terracotta hover:bg-[#C05638] rounded-lg disabled:opacity-50"
              >
                {granting ? 'Granting...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
