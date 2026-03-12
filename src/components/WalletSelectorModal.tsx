/**
 * WalletSelectorModal.tsx
 *
 * Displays installed (EIP-6963) wallets and a popular wallets list.
 * On selection, calls onConnect with the chosen wallet.
 */

import React, { useEffect, useState } from 'react'
import { X, Loader } from 'lucide-react'
import {
  detectInstalledWallets,
  connectByProvider,
  connectWalletConnect,
  type AnnouncedWallet,
  type ConnectedWallet,
} from '../lib/externalWallet'

// OKX Wallet base64 icon (black square with white grid)
const OKX_ICON =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjYwIiBoZWlnaHQ9IjYwIiByeD0iMTIiIGZpbGw9ImJsYWNrIi8+CjxwYXRoIGQ9Ik0yMy4zMzMgMjMuMzMzSDE0VjM2LjY2N0gyMy4zMzNWMjMuMzMzWiIgZmlsbD0id2hpdGUiLz4KPHBhdGggZD0iTTM2LjY2NyAyMy4zMzNIMjcuMzMzVjM2LjY2N0gzNi42NjdWMjMuMzMzWiIgZmlsbD0id2hpdGUiLz4KPHBhdGggZD0iTTQ2IDIzLjMzM0gzNi42NjdWMzYuNjY3SDQ2VjIzLjMzM1oiIGZpbGw9IndoaXRlIi8+Cjwvc3ZnPg=='

// ---------------------------------------------------------------------------
// Popular wallets shown when not installed (rdns → metadata)
// ---------------------------------------------------------------------------
const POPULAR_WALLETS = [
  {
    rdns: 'com.okex.wallet',
    name: 'OKX Wallet',
    icon: OKX_ICON,
  },
  {
    rdns: 'io.metamask',
    name: 'MetaMask',
    icon: 'https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg',
  },
  {
    rdns: 'me.rainbow',
    name: 'Rainbow',
    icon: 'https://avatars.githubusercontent.com/u/48327834',
  },
  {
    rdns: 'com.coinbase.wallet',
    name: 'Coinbase Wallet',
    icon: 'https://avatars.githubusercontent.com/u/1885080',
  },
  {
    rdns: 'walletconnect',
    name: 'WalletConnect',
    icon: 'https://avatars.githubusercontent.com/u/37784886',
  },
]

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface WalletSelectorModalProps {
  onConnect: (wallet: ConnectedWallet) => void
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export const WalletSelectorModal: React.FC<WalletSelectorModalProps> = ({
  onConnect,
  onClose,
}) => {
  const [installed, setInstalled] = useState<AnnouncedWallet[]>([])
  const [scanning, setScanning] = useState(true)
  const [connectingId, setConnectingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    detectInstalledWallets().then((wallets) => {
      setInstalled(wallets)
      setScanning(false)
    })
  }, [])

  // Popular wallets that are NOT already installed
  const installedRdns = new Set(installed.map((w) => w.info.rdns))
  const popular = POPULAR_WALLETS.filter((w) => !installedRdns.has(w.rdns))

  const handleInstalled = async (wallet: AnnouncedWallet) => {
    setConnectingId(wallet.info.uuid)
    setError(null)
    try {
      const connected = await connectByProvider(wallet.provider)
      onConnect(connected)
    } catch (err) {
      console.error('Connection error:', err)
      setError(err instanceof Error ? err.message : 'Connection failed')
      setConnectingId(null)
    }
  }

  const handlePopular = async (rdns: string) => {
    setConnectingId(rdns)
    setError(null)
    try {
      let connected: ConnectedWallet
      if (rdns === 'walletconnect') {
        connected = await connectWalletConnect()
      } else if (rdns === 'com.okx.wallet') {
        const okxWin = window as typeof window & { okxwallet?: unknown }
        if (okxWin.okxwallet) {
          connected = await connectByProvider(okxWin.okxwallet)
        } else {
          window.open('https://www.okx.com/web3', '_blank')
          setConnectingId(null)
          return
        }
      } else {
        connected = await connectWalletConnect()
      }
      onConnect(connected)
    } catch (err) {
      console.error('Connection error:', err)
      setError(err instanceof Error ? err.message : 'Connection failed')
      setConnectingId(null)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden animate-fade-in-up">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">选择钱包</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-4 py-4 max-h-[60vh] overflow-y-auto">

          {/* Installed wallets */}
          {scanning ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <Loader size={24} className="animate-spin text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-500">检测钱包中...</p>
              </div>
            </div>
          ) : installed.length > 0 ? (
            <div className="mb-6">
              <p className="text-xs font-medium text-indigo-600 mb-3 px-2 uppercase tracking-wider">已安装</p>
              <div className="space-y-2">
                {installed.map((wallet) => (
                  <WalletRow
                    key={wallet.info.uuid}
                    icon={wallet.info.icon}
                    name={wallet.info.name}
                    loading={connectingId === wallet.info.uuid}
                    disabled={connectingId !== null}
                    onClick={() => handleInstalled(wallet)}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {/* Popular wallets */}
          {popular.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-3 px-2 uppercase tracking-wider">推荐</p>
              <div className="space-y-2">
                {popular.map((wallet) => (
                  <WalletRow
                    key={wallet.rdns}
                    icon={wallet.icon}
                    name={wallet.name}
                    loading={connectingId === wallet.rdns}
                    disabled={connectingId !== null}
                    onClick={() => handlePopular(wallet.rdns)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-4 p-3 bg-red-50 rounded-lg">
              <p className="text-sm text-red-600 text-center">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 text-center">
          <span className="text-xs text-gray-500">对以太坊钱包不熟悉？</span>
          <a
            href="https://ethereum.org/wallets/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-indigo-600 hover:underline ml-1"
          >
            了解更多
          </a>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// WalletRow sub-component
// ---------------------------------------------------------------------------
interface WalletRowProps {
  icon: string
  name: string
  loading: boolean
  disabled: boolean
  onClick: () => void
}

const WalletRow: React.FC<WalletRowProps> = ({ icon, name, loading, disabled, onClick }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className="w-full flex items-center gap-4 px-4 py-3.5 rounded-xl hover:bg-gray-50 disabled:opacity-60 transition-colors text-left border border-gray-100 hover:border-gray-200"
  >
    <div className="w-10 h-10 rounded-lg bg-gray-50 p-2 flex-shrink-0">
      <img src={icon} alt={name} className="w-full h-full object-contain" />
    </div>
    <span className="text-sm font-medium text-gray-900 flex-1">{name}</span>
    {loading && (
      <div className="w-5 h-5 flex-shrink-0">
        <Loader size={16} className="animate-spin text-gray-400" />
      </div>
    )}
  </button>
)