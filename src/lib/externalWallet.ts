/**
 * externalWallet.ts
 *
 * Wallet connection utilities.
 *  - EIP-6963: detect all installed browser extension wallets
 *  - connectByProvider: connect via a specific EIP-1193 provider
 *  - connectWalletConnect: open WalletConnect v2 modal
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WalletType = 'browser' | 'walletconnect'

export interface ConnectedWallet {
  address: string
  type: WalletType
  provider: unknown
}

/** EIP-6963 provider info */
export interface WalletInfo {
  uuid: string
  name: string
  /** Data-URI icon (svg/png) provided by the extension */
  icon: string
  rdns: string
}

/** An announced EIP-6963 wallet */
export interface AnnouncedWallet {
  info: WalletInfo
  provider: unknown
}

// ---------------------------------------------------------------------------
// EIP-6963 detection
// ---------------------------------------------------------------------------

/**
 * Returns all currently-installed browser extension wallets via EIP-6963.
 * Also adds OKX Wallet fallback via window.okxwallet for older versions
 * that may not implement EIP-6963.
 * Resolves after a short tick to collect all synchronous announcements.
 */
export function detectInstalledWallets(): Promise<AnnouncedWallet[]> {
  return new Promise((resolve) => {
    const wallets: AnnouncedWallet[] = []

    const handler = (event: Event) => {
      const e = event as CustomEvent<AnnouncedWallet>
      if (!wallets.find((w) => w.info.uuid === e.detail.info.uuid)) {
        wallets.push(e.detail)
      }
    }

    window.addEventListener('eip6963:announceProvider', handler)
    window.dispatchEvent(new Event('eip6963:requestProvider'))

    setTimeout(() => {
      window.removeEventListener('eip6963:announceProvider', handler)

      // OKX Wallet fallback: inject window.okxwallet if not already announced via EIP-6963
      const okxWin = window as typeof window & { okxwallet?: unknown }
      const alreadyHasOkx = wallets.some((w) => w.info.rdns === 'com.okex.wallet')
      if (okxWin.okxwallet && !alreadyHasOkx) {
        wallets.unshift({
          info: {
            uuid: 'com.okex.wallet',
            name: 'OKX Wallet',
            icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjYwIiBoZWlnaHQ9IjYwIiByeD0iMTIiIGZpbGw9ImJsYWNrIi8+CjxwYXRoIGQ9Ik0yMy4zMzMgMjMuMzMzSDE0VjM2LjY2N0gyMy4zMzNWMjMuMzMzWiIgZmlsbD0id2hpdGUiLz4KPHBhdGggZD0iTTM2LjY2NyAyMy4zMzNIMjcuMzMzVjM2LjY2N0gzNi42NjdWMjMuMzMzWiIgZmlsbD0id2hpdGUiLz4KPHBhdGggZD0iTTQ2IDIzLjMzM0gzNi42NjdWMzYuNjY3SDQ2VjIzLjMzM1oiIGZpbGw9IndoaXRlIi8+Cjwvc3ZnPg==',
            rdns: 'com.okex.wallet',
          },
          provider: okxWin.okxwallet,
        })
      }

      resolve(wallets)
    }, 50)
  })
}

/** Returns true when OKX Wallet is installed (EIP-6963 or window.okxwallet). */
export function isOkxWalletInstalled(): boolean {
  const okxWin = window as typeof window & { okxwallet?: unknown }
  return !!okxWin.okxwallet
}

// ---------------------------------------------------------------------------
// Connect helpers
// ---------------------------------------------------------------------------

/** Connect to a specific EIP-1193 provider (from EIP-6963 or window.ethereum). */
export async function connectByProvider(
  provider: unknown,
  type: WalletType = 'browser'
): Promise<ConnectedWallet> {
  const p = provider as {
    request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
  }

  const accounts = (await p.request({ method: 'eth_requestAccounts' })) as string[]

  if (!accounts || accounts.length === 0) {
    throw new Error('No accounts returned from wallet')
  }

  return { address: accounts[0], type, provider }
}

/** Open WalletConnect v2 modal and return the connected account. */
export async function connectWalletConnect(): Promise<ConnectedWallet> {
  const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined

  if (!projectId || projectId === 'your_project_id_here') {
    throw new Error(
      'Missing VITE_WALLETCONNECT_PROJECT_ID — get one at https://cloud.walletconnect.com'
    )
  }

  const { default: EthereumProvider } = await import('@walletconnect/ethereum-provider')

  const wcProvider = await EthereumProvider.init({
    projectId,
    chains: [1],
    optionalChains: [8453, 42161, 56],
    showQrModal: true,
    qrModalOptions: { themeMode: 'light' },
  })

  await wcProvider.connect()

  const accounts = await wcProvider.request<string[]>({ method: 'eth_accounts' })

  if (!accounts || accounts.length === 0) {
    throw new Error('No accounts returned from WalletConnect')
  }

  return { address: accounts[0], type: 'walletconnect', provider: wcProvider }
}

// ---------------------------------------------------------------------------
// Legacy helpers (kept for compatibility)
// ---------------------------------------------------------------------------

export function detectBrowserWallet(): boolean {
  return typeof window !== 'undefined' && typeof window.ethereum !== 'undefined'
}

export async function connectBrowserWallet(): Promise<ConnectedWallet> {
  return connectByProvider(window.ethereum)
}

export async function connectExternalWallet(): Promise<ConnectedWallet> {
  if (detectBrowserWallet()) return connectBrowserWallet()
  return connectWalletConnect()
}
