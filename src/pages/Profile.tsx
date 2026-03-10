import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../store/authStore'
import { api } from '../lib/backend'
import { Copy, Check, Users, History } from 'lucide-react'
import { useToast } from '../components/Toast'

interface ReferralInfo {
  referralCode: string
  referralLink: string
  invitedCount: number
  totalCommission: number
}

interface CreditTx {
  id: string
  amount: number
  type: string
  description: string | null
  balance_after: number
  created_at: string
}

export const Profile: React.FC = () => {
  const { t } = useTranslation()
  const { displayName, creditBalance, referralCode } = useAuthStore()
  const toast = useToast()
  const typeLabels: Record<string, string> = {
    signup_bonus: t('profile.txType.signup_bonus'),
    analysis_spend: t('profile.txType.analysis_spend'),
    referral_commission: t('profile.txType.referral_commission'),
    admin_grant: t('profile.txType.admin_grant'),
    topup: t('profile.txType.topup'),
    refund: t('profile.txType.refund'),
  }
  const [referralInfo, setReferralInfo] = useState<ReferralInfo | null>(null)
  const [creditHistory, setCreditHistory] = useState<CreditTx[]>([])
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.getReferralInfo().catch(() => null),
      api.getCreditHistory().catch(() => ({ transactions: [] })),
    ]).then(([refInfo, creditData]) => {
      if (refInfo) setReferralInfo(refInfo)
      setCreditHistory(creditData?.transactions || [])
    }).finally(() => setLoading(false))
  }, [])

  const handleCopyLink = () => {
    const link = referralInfo?.referralLink || `${window.location.origin}/?ref=${referralCode}`
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true)
      toast.success(t('profile.referral.copied'))
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-fade-in-up">
      <h1 className="text-3xl font-serif text-charcoal">{t('profile.title')}</h1>

      {/* User Info */}
      <div className="bg-white border border-charcoal/5 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-charcoal/50">{t('profile.displayName')}</div>
            <div className="text-lg font-medium text-charcoal">{displayName || t('profile.anonymous')}</div>
          </div>
          <div className="text-right">
            <div className="text-sm text-charcoal/50">{t('profile.creditBalance')}</div>
            <div className="text-2xl font-mono font-semibold text-terracotta">
              {(creditBalance / 100).toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      {/* Referral Section */}
      <div className="bg-white border border-charcoal/5 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-terracotta" />
          <h2 className="text-lg font-serif text-charcoal">{t('profile.referral.title')}</h2>
        </div>
        <p className="text-sm text-charcoal/60">
          {t('profile.referral.description')}
        </p>

        {loading ? (
          <div className="h-12 bg-charcoal/5 rounded-lg animate-pulse" />
        ) : (
          <>
            <div className="flex gap-2">
              <div className="flex-1 px-4 py-3 bg-warm-white border border-charcoal/10 rounded-lg font-mono text-sm text-charcoal/70 truncate">
                {referralInfo?.referralLink || `${window.location.origin}/?ref=${referralCode}`}
              </div>
              <button
                onClick={handleCopyLink}
                className="px-4 py-3 bg-terracotta hover:bg-[#C05638] text-white rounded-lg transition-colors"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>

            {referralInfo && (
              <div className="grid grid-cols-2 gap-4 pt-2">
                <div className="bg-warm-white rounded-lg px-4 py-3">
                  <div className="text-xs text-charcoal/50">{t('profile.referral.friendsInvited')}</div>
                  <div className="text-xl font-mono font-semibold text-charcoal">{referralInfo.invitedCount}</div>
                </div>
                <div className="bg-warm-white rounded-lg px-4 py-3">
                  <div className="text-xs text-charcoal/50">{t('profile.referral.totalCommission')}</div>
                  <div className="text-xl font-mono font-semibold text-terracotta">
                    {(referralInfo.totalCommission / 100).toFixed(2)}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Credit History */}
      <div className="bg-white border border-charcoal/5 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-terracotta" />
          <h2 className="text-lg font-serif text-charcoal">{t('profile.creditHistory.title')}</h2>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-charcoal/5 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : creditHistory.length === 0 ? (
          <p className="text-sm text-charcoal/40 py-4 text-center">{t('profile.creditHistory.empty')}</p>
        ) : (
          <div className="space-y-1">
            {creditHistory.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-warm-white">
                <div>
                  <div className="text-sm font-medium text-charcoal">
                    {typeLabels[tx.type] || tx.type}
                  </div>
                  <div className="text-xs text-charcoal/40">
                    {tx.description || new Date(tx.created_at).toLocaleDateString()}
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-sm font-mono font-semibold ${tx.amount > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {tx.amount > 0 ? '+' : ''}{(tx.amount / 100).toFixed(2)}
                  </div>
                  <div className="text-xs text-charcoal/40 font-mono">
                    bal: {(tx.balance_after / 100).toFixed(2)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
