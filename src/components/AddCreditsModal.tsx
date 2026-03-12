import React, { useState, useEffect } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { X, Copy, Check, ArrowRightLeft, QrCode, Wallet, Loader2 } from 'lucide-react'
import clsx from 'clsx'
import { type ConnectedWallet } from '../lib/externalWallet'
import { WalletSelectorModal } from './WalletSelectorModal'
import { TransferModal } from './TransferModal'
import { api } from '../lib/backend'

interface AddCreditsModalProps {
  onClose: () => void
  walletAddress: string
  username?: string
}

const SUPPORTED_CHAINS = 'Ethereum • Polygon • Arbitrum • BNB'

type Tab = 'transfer' | 'qrcode'

function shortAddress(addr: string): string {
  if (addr.length <= 12) return addr
  return `${addr.slice(0, 10)}...${addr.slice(-6)}`
}

export const AddCreditsModal: React.FC<AddCreditsModalProps> = ({
  onClose,
  walletAddress: defaultWalletAddress,
  username,
}) => {
  const [tab, setTab] = useState<Tab>('transfer')
  const [copied, setCopied] = useState(false)
  const [connectedWallet, setConnectedWallet] = useState<ConnectedWallet | null>(null)
  const [showWalletSelector, setShowWalletSelector] = useState(false)
  const [showTransferModal, setShowTransferModal] = useState(false)
  const [depositAddress, setDepositAddress] = useState<string>('')
  const [loadingAddress, setLoadingAddress] = useState(false)

  // Fetch or create wallet address using username as seed
  useEffect(() => {
    if (!username) {
      setDepositAddress(defaultWalletAddress)
      return
    }
    setLoadingAddress(true)
    api.getOrCreateWallet(username)
      .then((res) => {
        setDepositAddress(res.address)
      })
      .catch(() => {
        setDepositAddress(defaultWalletAddress)
      })
      .finally(() => setLoadingAddress(false))
  }, [username, defaultWalletAddress])

  const walletAddress = depositAddress || defaultWalletAddress
  const qrData = walletAddress

  const handleCopy = () => {
    navigator.clipboard.writeText(walletAddress).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const tabs: { id: Tab; icon: React.ReactNode; label: string; sub: string }[] = [
    { id: 'transfer', icon: <ArrowRightLeft size={18} />, label: 'Transfer', sub: 'From external wallet' },
    { id: 'qrcode', icon: <QrCode size={18} />, label: 'QR Code', sub: 'Scan to deposit' },
  ]

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden">

          {/* Header */}
          <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Add Funds to Your Wallet</h2>
              <p className="text-sm text-gray-500 mt-0.5">Choose how you want to add funds to your wallet</p>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Body */}
          <div className="flex min-h-[380px]">

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

              {/* Address pill — shared */}
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-full px-4 py-2 mb-6 w-full max-w-xs justify-between">
                <span className="text-sm font-mono text-gray-700 truncate">
                  {loadingAddress ? (
                    <span className="flex items-center gap-1.5 text-gray-400">
                      <Loader2 size={14} className="animate-spin" />
                      Loading...
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
                            {connectedWallet.type === 'browser' ? 'Browser Wallet' : 'WalletConnect'} connected
                          </div>
                          <div className="text-xs font-mono text-emerald-600 mt-0.5">
                            {shortAddress(connectedWallet.address)}
                          </div>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 text-center">
                        Send tokens from your connected wallet to the address above
                      </p>
                      <button
                        onClick={() => setConnectedWallet(null)}
                        className="w-full py-2 border border-gray-200 rounded-lg text-sm text-gray-500 hover:bg-gray-50 transition-colors"
                      >
                        Disconnect
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowWalletSelector(true)}
                      className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 hover:bg-gray-700 text-white text-sm font-medium rounded-xl transition-colors"
                    >
                      <Wallet size={16} />
                      Connect Wallet
                    </button>
                  )}

                  <div className="mt-6 w-full max-w-xs bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 flex items-center justify-between">
                    <span className="text-sm text-gray-600">Monitoring all chains</span>
                    <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                      Active
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
                    Send Tokens to this Address on any Supported Chain
                  </p>
                  <div className="w-full max-w-xs bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 flex items-center justify-between">
                    <span className="text-sm text-gray-600">Monitoring all chains</span>
                    <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                      Active
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-3">{SUPPORTED_CHAINS}</p>
                </>
              )}

            </div>
          </div>
        </div>
      </div>

      {/* Wallet selector overlay */}
      {showWalletSelector && (
        <WalletSelectorModal
          onClose={() => setShowWalletSelector(false)}
          onConnect={(wallet) => {
            setConnectedWallet(wallet)
            setShowWalletSelector(false)
            setShowTransferModal(true)
          }}
        />
      )}

      {/* Transfer modal after wallet connected */}
      {showTransferModal && connectedWallet && (
        <TransferModal
          fromAddress={connectedWallet.address}
          toAddress={walletAddress}
          provider={connectedWallet.provider}
          onClose={() => setShowTransferModal(false)}
        />
      )}
    </>
  )
}
