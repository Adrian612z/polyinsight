import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Ticket, X } from 'lucide-react'
import { useToast } from './Toast'

interface ReferralAuthModalProps {
  isOpen: boolean
  onClose: () => void
  onContinue: () => void
}

function normalizeReferralCode(input: string): string {
  return input.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6)
}

export const ReferralAuthModal: React.FC<ReferralAuthModalProps> = ({
  isOpen,
  onClose,
  onContinue,
}) => {
  const { t, i18n } = useTranslation()
  const toast = useToast()
  const [value, setValue] = useState('')

  useEffect(() => {
    if (!isOpen) return
    setValue(localStorage.getItem('polyinsight_ref') || '')
  }, [isOpen])

  const isValid = useMemo(() => value.length === 0 || value.length === 6, [value])

  if (!isOpen) return null

  const handleContinue = () => {
    const normalized = normalizeReferralCode(value)
    if (normalized && normalized.length !== 6) {
      toast.error(t('referralAuth.invalid'))
      return
    }

    if (normalized) {
      localStorage.setItem('polyinsight_ref', normalized)
    } else {
      localStorage.removeItem('polyinsight_ref')
    }

    onContinue()
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 backdrop-blur-sm p-4">
      <div className="bg-white rounded-[28px] shadow-[0_28px_80px_rgba(15,23,42,0.24)] w-full max-w-lg overflow-hidden animate-fade-in-up">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-terracotta/10 text-terracotta">
              <Ticket className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{t('referralAuth.title')}</h3>
              <p className="text-sm text-gray-500 mt-0.5">{t('referralAuth.subtitle')}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
            aria-label={t('markets.actions.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 py-6 space-y-4">
          <div className="space-y-2">
            <label htmlFor="referral-auth-code" className="text-sm font-semibold text-gray-700">
              {t('referralAuth.label')}
            </label>
            <input
              id="referral-auth-code"
              type="text"
              inputMode="text"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              maxLength={6}
              value={value}
              onChange={(event) => setValue(normalizeReferralCode(event.target.value))}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  handleContinue()
                }
              }}
              placeholder={t('referralAuth.placeholder')}
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-base font-mono uppercase tracking-[0.24em] text-gray-900 outline-none transition focus:border-terracotta/40 focus:ring-2 focus:ring-terracotta/12"
            />
            <p className={`text-xs ${isValid ? 'text-gray-500' : 'text-red-600'}`}>
              {isValid ? t('referralAuth.hint') : t('referralAuth.invalid')}
            </p>
          </div>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              onClick={onClose}
              className="theme-surface-button inline-flex items-center justify-center rounded-2xl px-5 py-3 text-sm font-semibold"
            >
              {t('referralAuth.skip')}
            </button>
            <button
              onClick={handleContinue}
              className="theme-accent-button inline-flex items-center justify-center rounded-2xl px-5 py-3 text-sm font-semibold"
            >
              {i18n.language === 'zh' ? '继续登录' : 'Continue to sign in'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
