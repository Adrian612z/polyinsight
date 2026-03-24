import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarCheck2, Check, Coins, Copy, Flame, Gift, History, Pencil, Sparkles, Users, X } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { api } from '../lib/backend'
import { fetchAndCacheProfileData, getCachedProfileData } from '../lib/pageCache'
import { useToast } from '../components/Toast'

interface InvitedUser {
  id: string
  email: string | null
  display_name: string | null
  created_at: string
}

interface CommissionRecord {
  id: string
  amount: number
  description: string | null
  balance_after: number
  created_at: string
  reference_id: string | null
}

interface ReferralInfo {
  referralCode: string
  referralLink: string
  invitedCount: number
  totalCommission: number
  invitedUsers: InvitedUser[]
  commissionRecords: CommissionRecord[]
}

interface CreditTx {
  id: string
  amount: number
  type: string
  description: string | null
  balance_after: number
  created_at: string
}

interface CheckInStatus {
  streak: number
  checkedInToday: boolean
  lastCheckInOn: string | null
  nextRewardIn: number
  rewardAmount: number
  cycle: number
}

export const Profile: React.FC = () => {
  const { t, i18n } = useTranslation()
  const { displayName, creditBalance, referralCode, privyUserId, setCreditBalance, setDisplayName } = useAuthStore()
  const toast = useToast()
  const typeLabels: Record<string, string> = {
    signup_bonus: t('profile.txType.signup_bonus'),
    analysis_spend: t('profile.txType.analysis_spend'),
    referral_commission: t('profile.txType.referral_commission'),
    admin_grant: t('profile.txType.admin_grant'),
    topup: t('profile.txType.topup'),
    refund: t('profile.txType.refund'),
    daily_checkin_bonus: t('profile.txType.daily_checkin_bonus'),
  }
  const [referralInfo, setReferralInfo] = useState<ReferralInfo | null>(null)
  const [creditHistory, setCreditHistory] = useState<CreditTx[]>([])
  const [checkInStatus, setCheckInStatus] = useState<CheckInStatus | null>(null)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(true)
  const [checkingIn, setCheckingIn] = useState(false)
  const [referralModal, setReferralModal] = useState<'invited' | 'commissions' | null>(null)
  const [editingDisplayName, setEditingDisplayName] = useState(false)
  const [displayNameInput, setDisplayNameInput] = useState('')
  const [savingDisplayName, setSavingDisplayName] = useState(false)

  useEffect(() => {
    if (!privyUserId) {
      setLoading(false)
      return
    }

    let cancelled = false
    const cached = getCachedProfileData(privyUserId)

    if (cached) {
      setReferralInfo(cached.referralInfo)
      setCreditHistory(cached.creditHistory)
      setCheckInStatus(cached.checkInStatus || null)
      setLoading(false)
    } else {
      setLoading(true)
    }

    void fetchAndCacheProfileData(privyUserId)
      .then((nextData) => {
        if (cancelled) return
        setReferralInfo(nextData.referralInfo)
        setCreditHistory(nextData.creditHistory)
        setCheckInStatus(nextData.checkInStatus || null)
        setLoading(false)
      })
      .catch(() => {
        if (cancelled || cached) return
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [privyUserId])

  useEffect(() => {
    if (editingDisplayName) return
    setDisplayNameInput(displayName || '')
  }, [displayName, editingDisplayName])

  const handleCopyLink = () => {
    const link = referralInfo?.referralLink || `${window.location.origin}/?ref=${referralCode}`
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true)
      toast.success(t('profile.referral.copied'))
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const handleCheckIn = async () => {
    if (!privyUserId || checkingIn || checkInStatus?.checkedInToday) return

    setCheckingIn(true)
    try {
      const result = await api.checkIn()
      setCreditBalance(result.balance)

      const nextData = await fetchAndCacheProfileData(privyUserId)
      setReferralInfo(nextData.referralInfo)
      setCreditHistory(nextData.creditHistory)
      setCheckInStatus(nextData.checkInStatus || null)

      if (result.rewarded) {
        toast.success(t('profile.checkIn.toast.rewarded', {
          amount: (result.rewardAmount / 100).toFixed(0),
        }))
      } else {
        toast.success(t('profile.checkIn.toast.saved', {
          days: result.status.nextRewardIn,
        }))
      }
    } catch (err: unknown) {
      const codedError = err as { code?: string }
      if (codedError?.code === 'ALREADY_CHECKED_IN') {
        const status = await api.getCheckInStatus().catch(() => null)
        if (status) setCheckInStatus(status)
        toast.info(t('profile.checkIn.toast.alreadyDone'))
      } else {
        toast.error(t('profile.checkIn.toast.failed'))
      }
    } finally {
      setCheckingIn(false)
    }
  }

  const handleSaveDisplayName = async () => {
    const nextDisplayName = displayNameInput.trim()
    if (!nextDisplayName || nextDisplayName === displayName) {
      setEditingDisplayName(false)
      setDisplayNameInput(displayName || '')
      return
    }

    setSavingDisplayName(true)
    try {
      const result = await api.updateMe({ displayName: nextDisplayName })
      const updatedDisplayName = result?.user?.display_name || nextDisplayName
      setDisplayName(updatedDisplayName)
      setDisplayNameInput(updatedDisplayName)
      setEditingDisplayName(false)
      toast.success(t('profile.displayName.toast.saved'))
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      toast.error(message || t('profile.displayName.toast.failed'))
    } finally {
      setSavingDisplayName(false)
    }
  }

  const formatReferralPerson = (person: InvitedUser) => {
    return person.display_name || person.email || `${person.id.slice(0, 10)}...`
  }

  const formatRecordTime = (value: string) =>
    new Date(value).toLocaleString(i18n.language === 'zh' ? 'zh-CN' : 'en-US')

  const invitedUsers = referralInfo?.invitedUsers || []
  const commissionRecords = referralInfo?.commissionRecords || []

  return (
    <>
      <div className="max-w-5xl mx-auto space-y-6 animate-fade-in-up">
        <div className="workspace-frame rounded-[32px] p-6 md:p-8">
          <div className="section-label mb-3">{t('profile.title')}</div>
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
            <div className="workspace-subpanel rounded-[26px] p-5">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-terracotta/20 to-[#8b7bff]/20 text-terracotta">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm text-charcoal/48">{t('profile.displayName')}</div>
                    <button
                      type="button"
                      onClick={() => {
                        setDisplayNameInput(displayName || '')
                        setEditingDisplayName(true)
                      }}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-charcoal/42 transition hover:bg-charcoal/5 hover:text-charcoal"
                      aria-label={t('profile.displayName.edit')}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </div>
                  {editingDisplayName ? (
                    <div className="mt-3 space-y-3">
                      <input
                        type="text"
                        value={displayNameInput}
                        maxLength={40}
                        onChange={(event) => setDisplayNameInput(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            void handleSaveDisplayName()
                          }
                          if (event.key === 'Escape') {
                            setEditingDisplayName(false)
                            setDisplayNameInput(displayName || '')
                          }
                        }}
                        placeholder={t('profile.displayName.placeholder')}
                        className="w-full rounded-2xl border border-charcoal/10 bg-white/75 px-4 py-3 text-base text-charcoal outline-none transition focus:border-terracotta/40 focus:ring-2 focus:ring-terracotta/12"
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void handleSaveDisplayName()}
                          disabled={savingDisplayName || !displayNameInput.trim() || displayNameInput.trim() === displayName}
                          className="theme-contrast-button inline-flex items-center rounded-2xl px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {savingDisplayName ? t('profile.displayName.saving') : t('profile.displayName.save')}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingDisplayName(false)
                            setDisplayNameInput(displayName || '')
                          }}
                          className="theme-surface-button inline-flex items-center rounded-2xl px-4 py-2 text-sm font-semibold"
                        >
                          {t('profile.displayName.cancel')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-1 text-2xl font-semibold text-charcoal break-all">
                      {displayName || t('profile.anonymous')}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="workspace-subpanel rounded-[26px] p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-terracotta/10 text-terracotta">
                  <Coins className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm text-charcoal/48">{t('profile.creditBalance')}</div>
                  <div className="mt-1 text-3xl font-semibold text-charcoal font-mono">
                    {(creditBalance / 100).toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)] items-start">
          <div className="space-y-6 xl:sticky xl:top-28">
            <div className="workspace-frame rounded-[30px] p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600">
                  <CalendarCheck2 className="w-5 h-5" />
                </div>
                <div className="section-label">{t('profile.checkIn.title')}</div>
              </div>
              <p className="text-sm leading-6 text-charcoal/60">
                {t('profile.checkIn.description')}
              </p>

              {loading ? (
                <div className="space-y-3">
                  <div className="skeleton-surface h-12 rounded-2xl" />
                  <div className="grid grid-cols-2 gap-3">
                    <div className="skeleton-surface h-24 rounded-2xl" />
                    <div className="skeleton-surface h-24 rounded-2xl" />
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="workspace-subpanel rounded-[22px] px-4 py-4">
                      <div className="flex items-center gap-2 text-xs text-charcoal/50">
                        <Flame className="h-3.5 w-3.5" />
                        {t('profile.checkIn.currentStreak')}
                      </div>
                      <div className="mt-2 text-2xl font-mono font-semibold text-charcoal">
                        {checkInStatus?.streak ?? 0}
                      </div>
                    </div>
                    <div className="workspace-subpanel rounded-[22px] px-4 py-4">
                      <div className="flex items-center gap-2 text-xs text-charcoal/50">
                        <Gift className="h-3.5 w-3.5" />
                        {t('profile.checkIn.nextReward')}
                      </div>
                      <div className="mt-2 text-2xl font-mono font-semibold text-emerald-600">
                        {checkInStatus?.nextRewardIn ?? 3}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleCheckIn}
                    disabled={checkingIn || checkInStatus?.checkedInToday}
                    className="theme-contrast-button w-full rounded-2xl px-4 py-3 disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    {checkingIn
                      ? t('profile.checkIn.submitting')
                      : checkInStatus?.checkedInToday
                        ? t('profile.checkIn.checkedIn')
                        : t('profile.checkIn.action')}
                  </button>

                  <div className="workspace-subpanel rounded-[22px] px-4 py-4 text-sm text-charcoal/60 space-y-2">
                    <div>
                      {t('profile.checkIn.rule', {
                        cycle: checkInStatus?.cycle ?? 3,
                        reward: ((checkInStatus?.rewardAmount ?? 100) / 100).toFixed(0),
                      })}
                    </div>
                    <div>
                      {t('profile.checkIn.lastCheckIn', {
                        date: checkInStatus?.lastCheckInOn || '--',
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="workspace-frame rounded-[30px] p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-terracotta/10 text-terracotta">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <div className="section-label">{t('profile.referral.title')}</div>
                </div>
              </div>
              <p className="text-sm leading-6 text-charcoal/60">
                {t('profile.referral.description')}
              </p>

              {loading ? (
                <div className="space-y-3">
                  <div className="skeleton-surface h-12 rounded-2xl" />
                  <div className="grid grid-cols-2 gap-3">
                    <div className="skeleton-surface h-24 rounded-2xl" />
                    <div className="skeleton-surface h-24 rounded-2xl" />
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex gap-2">
                    <div className="workspace-subpanel flex-1 px-4 py-3 rounded-2xl font-mono text-sm text-charcoal/70 truncate">
                      {referralInfo?.referralLink || `${window.location.origin}/?ref=${referralCode}`}
                    </div>
                    <button
                      onClick={handleCopyLink}
                      className="theme-contrast-button inline-flex items-center justify-center rounded-2xl px-4 py-3 transition-colors"
                    >
                      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>

                  {referralInfo && (
                    <div className="grid grid-cols-2 gap-4 pt-2">
                      <button
                        type="button"
                        onClick={() => setReferralModal('invited')}
                        className="workspace-subpanel rounded-[22px] px-4 py-4 text-left transition hover:border-terracotta/25 hover:shadow-[0_18px_34px_rgba(164,91,72,0.08)]"
                      >
                        <div className="text-xs text-charcoal/50">{t('profile.referral.friendsInvited')}</div>
                        <div className="mt-2 text-2xl font-mono font-semibold text-charcoal">{referralInfo.invitedCount}</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setReferralModal('commissions')}
                        className="workspace-subpanel rounded-[22px] px-4 py-4 text-left transition hover:border-terracotta/25 hover:shadow-[0_18px_34px_rgba(164,91,72,0.08)]"
                      >
                        <div className="text-xs text-charcoal/50">{t('profile.referral.totalCommission')}</div>
                        <div className="mt-2 text-2xl font-mono font-semibold text-terracotta">
                          {(referralInfo.totalCommission / 100).toFixed(2)}
                        </div>
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="premium-card rounded-[30px] p-6 space-y-4 flex flex-col h-[min(760px,calc(100vh-210px))]">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#8b7bff]/12 text-[#8b7bff]">
                <History className="w-5 h-5" />
              </div>
              <div className="section-label">{t('profile.creditHistory.title')}</div>
            </div>

            {loading ? (
              <div className="space-y-3 flex-1">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="skeleton-surface h-16 rounded-2xl" />
                ))}
              </div>
            ) : creditHistory.length === 0 ? (
              <div className="workspace-subpanel rounded-[22px] py-10 text-center text-sm text-charcoal/40 flex-1 flex items-center justify-center">
                {t('profile.creditHistory.empty')}
              </div>
            ) : (
              <div className="space-y-3 flex-1 min-h-0 overflow-y-auto pr-1">
                {creditHistory.map((tx) => (
                  <div key={tx.id} className="workspace-list-item rounded-[22px] px-4 py-3">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-sm font-semibold text-charcoal">
                          {typeLabels[tx.type] || tx.type}
                        </div>
                        <div className="mt-1 text-xs text-charcoal/40">
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
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {referralModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-3xl rounded-[30px] shadow-[0_28px_80px_rgba(15,23,42,0.2)] overflow-hidden animate-fade-in-up">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {referralModal === 'invited'
                    ? t('profile.referral.invitedListTitle')
                    : t('profile.referral.commissionListTitle')}
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  {referralModal === 'invited'
                    ? t('profile.referral.invitedListSubtitle', { count: invitedUsers.length })
                    : t('profile.referral.commissionListSubtitle', { count: commissionRecords.length })}
                </p>
              </div>
              <button
                onClick={() => setReferralModal(null)}
                className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
                aria-label={t('markets.actions.close')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto p-6">
              {referralModal === 'invited' ? (
                invitedUsers.length === 0 ? (
                  <div className="workspace-subpanel rounded-[22px] py-10 text-center text-sm text-charcoal/40">
                    {t('profile.referral.invitedEmpty')}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {invitedUsers.map((person) => (
                      <div key={person.id} className="workspace-list-item rounded-[22px] px-4 py-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-charcoal break-all">
                              {formatReferralPerson(person)}
                            </div>
                            <div className="mt-1 text-xs text-charcoal/45 break-all">
                              {person.email || person.id}
                            </div>
                          </div>
                          <div className="text-xs text-charcoal/45 whitespace-nowrap">
                            {formatRecordTime(person.created_at)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : commissionRecords.length === 0 ? (
                <div className="workspace-subpanel rounded-[22px] py-10 text-center text-sm text-charcoal/40">
                  {t('profile.referral.commissionEmpty')}
                </div>
              ) : (
                <div className="space-y-3">
                  {commissionRecords.map((record) => (
                    <div key={record.id} className="workspace-list-item rounded-[22px] px-4 py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-charcoal">
                            {record.description || t('profile.txType.referral_commission')}
                          </div>
                          <div className="mt-1 text-xs text-charcoal/45">
                            {formatRecordTime(record.created_at)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`text-sm font-mono font-semibold ${record.amount >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                            {record.amount > 0 ? '+' : ''}{(record.amount / 100).toFixed(2)}
                          </div>
                          <div className="mt-1 text-xs text-charcoal/45 font-mono">
                            bal: {(record.balance_after / 100).toFixed(2)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
