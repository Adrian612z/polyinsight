import React, { Suspense, lazy, useState, useEffect } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { X, Copy, Check, ArrowLeft, ArrowRightLeft, QrCode, Wallet, Loader2 } from 'lucide-react'
import clsx from 'clsx'
import { useTranslation } from 'react-i18next'
import type { ConnectedWallet } from '../lib/externalWallet'
import { api } from '../lib/backend'

const WalletSelectorModal = lazy(async () => {
  const module = await import('./WalletSelectorModal')
  return { default: module.WalletSelectorModal }
})

const TransferModal = lazy(async () => {
  const module = await import('./TransferModal')
  return { default: module.TransferModal }
})

interface AddCreditsModalProps {
  onClose: () => void
  walletAddress: string
  username?: string
}

const SUPPORTED_CHAINS = 'Ethereum • Polygon • Arbitrum • BNB'

type Tab = 'transfer' | 'qrcode'
type Step = 'plan' | 'payment'
type CreditPlanId = 'topup' | 'monthly' | 'unlimited'

interface CreditPlan {
  id: CreditPlanId
  name: string
  badge: string
  price: string
  description: string
  summary: string
  fixedAmount?: number
  recommended?: boolean
}

function shortAddress(addr: string): string {
  if (addr.length <= 12) return addr
  return `${addr.slice(0, 10)}...${addr.slice(-6)}`
}

export const AddCreditsModal: React.FC<AddCreditsModalProps> = ({
  onClose,
  walletAddress: defaultWalletAddress,
  username,
}) => {
  const { t } = useTranslation()
  const [step, setStep] = useState<Step>('plan')
  const [tab, setTab] = useState<Tab>('transfer')
  const [copied, setCopied] = useState(false)
  const [connectedWallet, setConnectedWallet] = useState<ConnectedWallet | null>(null)
  const [showWalletSelector, setShowWalletSelector] = useState(false)
  const [showTransferModal, setShowTransferModal] = useState(false)
  const [depositAddress, setDepositAddress] = useState<string>('')
  const [loadingAddress, setLoadingAddress] = useState(false)
  const [selectedPlanId, setSelectedPlanId] = useState<CreditPlanId>('topup')

  const plans: CreditPlan[] = [
    {
      id: 'topup',
      name: t('addCredits.plan.topup.name'),
      badge: t('addCredits.plan.topup.badge'),
      price: t('addCredits.plan.topup.price'),
      description: t('addCredits.plan.topup.description'),
      summary: t('addCredits.plan.topup.summary'),
    },
    {
      id: 'monthly',
      name: t('addCredits.plan.monthly.name'),
      badge: t('addCredits.plan.monthly.badge'),
      price: t('addCredits.plan.monthly.price'),
      description: t('addCredits.plan.monthly.description'),
      summary: t('addCredits.plan.monthly.summary'),
      fixedAmount: 39.9,
      recommended: true,
    },
    {
      id: 'unlimited',
      name: t('addCredits.plan.unlimited.name'),
      badge: t('addCredits.plan.unlimited.badge'),
      price: t('addCredits.plan.unlimited.price'),
      description: t('addCredits.plan.unlimited.description'),
      summary: t('addCredits.plan.unlimited.summary'),
      fixedAmount: 99.9,
    },
  ]

  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId) ?? plans[0]

  // Fetch or create the authenticated user's deposit address.
  useEffect(() => {
    setLoadingAddress(true)
    api.getOrCreateWallet(username)
      .then((res) => {
        setDepositAddress(res.address)
      })
      .catch(() => {
        setDepositAddress(defaultWalletAddress)
      })
      .finally(() => setLoadingAddress(false))
  }, [defaultWalletAddress, username])

  const walletAddress = depositAddress || defaultWalletAddress
  const qrData = walletAddress
  const paymentTitle = selectedPlan.fixedAmount
    ? `${selectedPlan.name} · ${selectedPlan.price}`
    : selectedPlan.name

  const handleCopy = () => {
    navigator.clipboard.writeText(walletAddress).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const tabs: { id: Tab; icon: React.ReactNode; label: string; sub: string }[] = [
    {
      id: 'transfer',
      icon: <ArrowRightLeft size={18} />,
      label: t('addCredits.tab.transfer.label'),
      sub: t('addCredits.tab.transfer.sub'),
    },
    {
      id: 'qrcode',
      icon: <QrCode size={18} />,
      label: t('addCredits.tab.qrcode.label'),
      sub: t('addCredits.tab.qrcode.sub'),
    },
  ]

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl mx-4 overflow-hidden">

          {/* Header */}
          <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100">
            <div className="flex items-start gap-3">
              {step === 'payment' && (
                <button
                  onClick={() => setStep('plan')}
                  className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700"
                >
                  <ArrowLeft size={16} />
                </button>
              )}
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {step === 'plan' ? t('addCredits.title.plan') : t('addCredits.title.payment')}
                </h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {step === 'plan'
                    ? t('addCredits.subtitle.plan')
                    : paymentTitle}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {step === 'plan' ? (
            <div className="px-6 py-6">
              <div className="grid gap-4 md:grid-cols-3">
                {plans.map((plan) => {
                  const isSelected = plan.id === selectedPlanId

                  return (
                    <button
                      key={plan.id}
                      onClick={() => setSelectedPlanId(plan.id)}
                      className={clsx(
                        'relative rounded-2xl border p-5 text-left transition-all',
                        isSelected
                          ? 'border-indigo-500 bg-indigo-50/60 shadow-[0_20px_50px_rgba(99,102,241,0.16)]'
                          : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                            {plan.badge}
                          </span>
                          <h3 className="mt-4 text-lg font-semibold text-gray-900">{plan.name}</h3>
                        </div>
                        {plan.recommended && (
                          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
                            {t('addCredits.plan.popular')}
                          </span>
                        )}
                      </div>

                      <div className="mt-5 text-2xl font-semibold text-gray-900">{plan.price}</div>
                      <p className="mt-3 text-sm leading-6 text-gray-500">{plan.description}</p>
                    </button>
                  )
                })}
              </div>

              <div className="mt-5 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
                <div className="text-sm font-semibold text-gray-900">{selectedPlan.name}</div>
                <p className="mt-1 text-sm leading-6 text-gray-500">{selectedPlan.summary}</p>
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setStep('payment')}
                  className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-gray-700"
                >
                  {t('addCredits.actions.continueToPayment')}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[430px]">

              {/* Tab list */}
              <div className="w-48 flex-shrink-0 border-r border-gray-100 py-3 px-2 space-y-1">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={clsx(
                      'w-full flex items-start gap-3 px-3 py-3 rounded-xl text-left transition-colors',
                      tab === t.id ? 'bg-gray-100' : 'hover:bg-gray-50'
                    )}
                  >
                    <span className={clsx('mt-0.5 flex-shrink-0', tab === t.id ? 'text-gray-800' : 'text-gray-400')}>
                      {t.icon}
                    </span>
                    <div>
                      <span className={clsx('text-sm font-medium', tab === t.id ? 'text-gray-900' : 'text-gray-600')}>
                        {t.label}
                      </span>
                      <div className="text-xs text-gray-400 mt-0.5">{t.sub}</div>
                    </div>
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div className="flex-1 flex flex-col items-center justify-center px-8 py-6">
                <div className="mb-6 w-full rounded-2xl border border-indigo-100 bg-indigo-50/60 px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-500">{t('addCredits.selectedPlan')}</div>
                      <div className="mt-2 text-base font-semibold text-gray-900">{selectedPlan.name}</div>
                      <p className="mt-1 text-sm text-gray-500">{selectedPlan.summary}</p>
                    </div>
                    <button
                      onClick={() => setStep('plan')}
                      className="rounded-full border border-white/80 bg-white px-3 py-1.5 text-xs font-semibold text-gray-500 transition-colors hover:text-gray-700"
                    >
                      {t('addCredits.actions.change')}
                    </button>
                  </div>
                </div>

                {/* Address pill — shared */}
                <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-full px-4 py-2 mb-6 w-full max-w-xs justify-between">
                  <span className="text-sm font-mono text-gray-700 truncate">
                    {loadingAddress ? (
                      <span className="flex items-center gap-1.5 text-gray-400">
                        <Loader2 size={14} className="animate-spin" />
                        {t('addCredits.loading')}
                      </span>
                    ) : shortAddress(walletAddress)}
                  </span>
                  <button
                    onClick={handleCopy}
                    className="flex-shrink-0 p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-700 transition-colors"
                  >
                    {copied ? <Check size={15} className="text-green-500" /> : <Copy size={15} />}
                  </button>
                </div>

                {/* ── Transfer tab ── */}
                {tab === 'transfer' && (
                  <>
                    {connectedWallet ? (
                      <div className="w-full max-w-xs space-y-3">
                        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                          <div>
                            <div className="text-xs text-emerald-700 font-medium">
                              {connectedWallet.type === 'browser'
                                ? t('addCredits.connected.browser')
                                : t('addCredits.connected.walletconnect')}
                            </div>
                            <div className="text-xs font-mono text-emerald-600 mt-0.5">
                              {shortAddress(connectedWallet.address)}
                            </div>
                          </div>
                        </div>
                        <p className="text-xs text-gray-500 text-center">
                          {selectedPlan.fixedAmount
                            ? t('addCredits.transfer.exactHint', { amount: selectedPlan.fixedAmount })
                            : t('addCredits.transfer.flexibleHint')}
                        </p>
                        <button
                          onClick={() => setConnectedWallet(null)}
                          className="w-full py-2 border border-gray-200 rounded-lg text-sm text-gray-500 hover:bg-gray-50 transition-colors"
                        >
                          {t('addCredits.actions.disconnect')}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowWalletSelector(true)}
                        className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 hover:bg-gray-700 text-white text-sm font-medium rounded-xl transition-colors"
                      >
                        <Wallet size={16} />
                        {t('addCredits.actions.connectWallet')}
                      </button>
                    )}

                    <div className="mt-6 w-full max-w-xs bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 flex items-center justify-between">
                      <span className="text-sm text-gray-600">{t('addCredits.monitoring', { chains: SUPPORTED_CHAINS })}</span>
                      <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                        {t('addCredits.active')}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-3">{SUPPORTED_CHAINS}</p>
                  </>
                )}

                {/* ── QR Code tab ── */}
                {tab === 'qrcode' && (
                  <>
                    <div className="p-3 bg-white border border-gray-100 rounded-xl shadow-sm mb-5">
                      <QRCodeSVG value={qrData} size={200} level="M" marginSize={0} />
                    </div>
                    <p className="text-sm text-gray-500 text-center mb-4">
                      {selectedPlan.fixedAmount
                        ? t('addCredits.qrcode.exactHint', { amount: selectedPlan.fixedAmount })
                        : t('addCredits.qrcode.flexibleHint')}
                    </p>
                    <div className="w-full max-w-xs bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 flex items-center justify-between">
                      <span className="text-sm text-gray-600">{t('addCredits.monitoring', { chains: SUPPORTED_CHAINS })}</span>
                      <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                        {t('addCredits.active')}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-3">{SUPPORTED_CHAINS}</p>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Wallet selector overlay */}
      {showWalletSelector && (
        <Suspense fallback={null}>
          <WalletSelectorModal
            onClose={() => setShowWalletSelector(false)}
            onConnect={(wallet) => {
              setConnectedWallet(wallet)
              setShowWalletSelector(false)
              setShowTransferModal(true)
            }}
          />
        </Suspense>
      )}

      {/* Transfer modal after wallet connected */}
      {showTransferModal && connectedWallet && (
        <Suspense fallback={null}>
          <TransferModal
            fromAddress={connectedWallet.address}
            toAddress={walletAddress}
            provider={connectedWallet.provider}
            planLabel={selectedPlan.name}
            planSummary={selectedPlan.summary}
            fixedAmount={selectedPlan.fixedAmount}
            onClose={() => setShowTransferModal(false)}
          />
        </Suspense>
      )}
    </>
  )
}
