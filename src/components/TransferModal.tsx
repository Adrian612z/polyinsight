import React, { useState, useEffect } from 'react'
import { X, ArrowRightLeft, Loader, CheckCircle, ChevronDown } from 'lucide-react'

interface ChainConfig {
  id: string
  chain_name: string
  chain_id: number
  rpc_url: string
  usdc_address: string
  usdt_address: string
}

interface TokenInfo {
  symbol: string
  name: string
  address: string
  decimals: number
  color: string
}

function getTokensForChain(chain: ChainConfig): TokenInfo[] {
  return [
    { symbol: 'USDC', name: 'USD Coin', address: chain.usdc_address, decimals: 6, color: '#2775CA' },
    { symbol: 'USDT', name: 'Tether USD', address: chain.usdt_address, decimals: 6, color: '#26A17B' },
  ]
}

const CHAIN_DISPLAY: Record<string, { label: string; color: string }> = {
  ethereum: { label: 'Ethereum', color: '#627EEA' },
  polygon: { label: 'Polygon', color: '#8247E5' },
  arbitrum: { label: 'Arbitrum', color: '#28A0F0' },
  bnb: { label: 'BNB Chain', color: '#F0B90B' },
}

const MIN_AMOUNT = 10

interface TransferModalProps {
  fromAddress: string
  toAddress: string
  provider: unknown
  onClose: () => void
}

/** Encode ERC20 transfer(address,uint256) call data */
function encodeTransferData(to: string, amount: bigint): string {
  // function selector: transfer(address,uint256) = 0xa9059cbb
  const selector = '0xa9059cbb'
  const paddedTo = to.replace('0x', '').toLowerCase().padStart(64, '0')
  const paddedAmount = amount.toString(16).padStart(64, '0')
  return `${selector}${paddedTo}${paddedAmount}`
}

export const TransferModal: React.FC<TransferModalProps> = ({
  fromAddress,
  toAddress,
  provider,
  onClose,
}) => {
  const [chains, setChains] = useState<ChainConfig[]>([])
  const [selectedChain, setSelectedChain] = useState<ChainConfig | null>(null)
  const [chainDropdownOpen, setChainDropdownOpen] = useState(false)
  const [loadingChains, setLoadingChains] = useState(true)
  const [selectedToken, setSelectedToken] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [sending, setSending] = useState(false)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/chains')
      .then((r) => r.json())
      .then((data) => {
        const list = data.chains as ChainConfig[]
        setChains(list)
        if (list.length > 0) setSelectedChain(list[0])
      })
      .catch(() => setError('Failed to load chain configs'))
      .finally(() => setLoadingChains(false))
  }, [])

  // Reset token selection when chain changes
  useEffect(() => {
    setSelectedToken(null)
  }, [selectedChain])

  const tokens = selectedChain ? getTokensForChain(selectedChain) : []
  const parsedAmount = parseFloat(amount)
  const isValidAmount = !isNaN(parsedAmount) && parsedAmount >= MIN_AMOUNT
  const canTransfer = selectedChain !== null && selectedToken !== null && isValidAmount && !sending

  const shortAddress = (addr: string): string => {
    if (!addr || addr.length <= 12) return addr || '0x0000'
    return `${addr.slice(0, 10)}...${addr.slice(-6)}`
  }

  const handleTransfer = async () => {
    if (!canTransfer || !provider) return

    const token = tokens.find((t) => t.address === selectedToken)
    if (!token) return

    setSending(true)
    setError(null)

    try {
      const p = provider as {
        request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
      }

      // Convert amount to token units (6 decimals for USDC/USDT)
      const rawAmount = BigInt(Math.floor(parsedAmount * 10 ** token.decimals))
      const data = encodeTransferData(toAddress, rawAmount)

      const txHash = (await p.request({
        method: 'eth_sendTransaction',
        params: [
          {
            from: fromAddress,
            to: token.address,
            data,
          },
        ],
      })) as string

      setTxHash(txHash)

      // Save transaction to backend
      fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tx_hash: txHash,
          from_address: fromAddress,
          to_address: toAddress,
          chain_name: selectedChain?.chain_name,
          token_symbol: token.symbol,
          amount: String(parsedAmount),
        }),
      }).catch(() => { /* best-effort, don't block UI */ })
    } catch (err) {
      console.error('Transfer error:', err)
      setError(err instanceof Error ? err.message : 'Transfer failed')
    } finally {
      setSending(false)
    }
  }

  const selectedTokenInfo = tokens.find((t) => t.address === selectedToken)

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden animate-fade-in-up">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">Transfer Funds</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-6">

          {/* Success state */}
          {txHash ? (
            <div className="text-center py-4">
              <div className="flex justify-center mb-4">
                <CheckCircle size={48} className="text-emerald-500" />
              </div>
              <h4 className="text-base font-semibold text-gray-900 mb-2">Transfer Submitted</h4>
              <p className="text-sm text-gray-500 mb-4">
                {amount} {selectedTokenInfo?.symbol} sent to Fere wallet
              </p>
              <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 mb-4">
                <div className="text-xs text-gray-500 mb-1">Transaction Hash</div>
                <div className="text-xs font-mono text-gray-900 break-all">{txHash}</div>
              </div>
              <button
                onClick={onClose}
                className="w-full py-3 bg-gray-900 hover:bg-gray-700 text-white rounded-xl font-medium transition-colors"
              >
                Done
              </button>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-500 mb-6">Transfer EVM funds to your Fere wallet</p>

              {/* From */}
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-medium text-gray-700 uppercase tracking-wider">From</span>
                  <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center">
                    <ArrowRightLeft size={14} className="text-gray-600" />
                  </div>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                  <div className="text-xs font-mono text-gray-900">
                    {shortAddress(fromAddress)}
                  </div>
                </div>
              </div>

              {/* To */}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-medium text-gray-700 uppercase tracking-wider">To (Your Fere Wallet)</span>
        
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                  <div className="text-xs font-mono text-gray-900">
                    {shortAddress(toAddress)}
                  </div>
                </div>
              </div>

              {/* Chain Selection */}
              <div className="mb-6">
                <div className="text-xs font-medium text-gray-700 uppercase tracking-wider mb-2">Chain</div>
                {loadingChains ? (
                  <div className="flex items-center justify-center py-3 text-gray-400">
                    <Loader size={16} className="animate-spin mr-2" /> Loading chains...
                  </div>
                ) : (
                  <div className="relative">
                    <button
                      onClick={() => setChainDropdownOpen(!chainDropdownOpen)}
                      className="w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 border-gray-200 bg-gray-50 hover:border-gray-300 transition-all"
                    >
                      {selectedChain ? (
                        <div className="flex items-center gap-2">
                          <div
                            className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
                            style={{ backgroundColor: CHAIN_DISPLAY[selectedChain.chain_name]?.color || '#666' }}
                          >
                            {selectedChain.chain_name.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-sm font-medium text-gray-900">
                            {CHAIN_DISPLAY[selectedChain.chain_name]?.label || selectedChain.chain_name}
                          </span>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">Select a chain</span>
                      )}
                      <ChevronDown size={16} className={`text-gray-400 transition-transform ${chainDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {chainDropdownOpen && (
                      <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                        {chains.map((chain) => (
                          <button
                            key={chain.id}
                            onClick={() => { setSelectedChain(chain); setChainDropdownOpen(false) }}
                            className={`w-full flex items-center gap-2 px-4 py-3 hover:bg-gray-50 transition-colors ${
                              selectedChain?.id === chain.id ? 'bg-indigo-50' : ''
                            }`}
                          >
                            <div
                              className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
                              style={{ backgroundColor: CHAIN_DISPLAY[chain.chain_name]?.color || '#666' }}
                            >
                              {chain.chain_name.charAt(0).toUpperCase()}
                            </div>
                            <span className="text-sm font-medium text-gray-900">
                              {CHAIN_DISPLAY[chain.chain_name]?.label || chain.chain_name}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Token Selection */}
              <div className="mb-6">
                <div className="text-xs font-medium text-gray-700 uppercase tracking-wider mb-2">Token</div>
                <div className="flex gap-3">
                  {tokens.map((token) => (
                    <button
                      key={token.symbol}
                      onClick={() => setSelectedToken(token.address)}
                      disabled={!selectedChain}
                      className={`flex-1 flex items-center gap-2 px-4 py-3 rounded-xl border-2 transition-all ${
                        selectedToken === token.address
                          ? 'border-indigo-500 bg-indigo-50'
                          : !selectedChain
                            ? 'border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed'
                            : 'border-gray-200 bg-gray-50 hover:border-gray-300'
                      }`}
                    >
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                        style={{ backgroundColor: token.color }}
                      >
                        {token.symbol.charAt(0)}
                      </div>
                      <div className="text-left">
                        <div className="text-sm font-medium text-gray-900">{token.symbol}</div>
                        <div className="text-xs text-gray-500">{token.name}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Amount */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-700 uppercase tracking-wider">Amount</span>
                  <span className="text-xs text-gray-400">Min: {MIN_AMOUNT} {selectedTokenInfo?.symbol || 'USDC/USDT'}</span>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    min={MIN_AMOUNT}
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder={`Enter amount (min ${MIN_AMOUNT})`}
                    disabled={!selectedToken}
                    className={`w-full bg-gray-50 border rounded-xl px-4 py-3 text-sm outline-none transition-colors ${
                      !selectedToken
                        ? 'border-gray-200 text-gray-400 cursor-not-allowed'
                        : amount && !isValidAmount
                          ? 'border-red-300 text-red-600 focus:border-red-400'
                          : 'border-gray-200 text-gray-900 focus:border-indigo-400'
                    }`}
                  />
                  {selectedTokenInfo && (
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-400">
                      {selectedTokenInfo.symbol}
                    </span>
                  )}
                </div>
                {amount && !isValidAmount && (
                  <p className="text-xs text-red-500 mt-1">Minimum amount is {MIN_AMOUNT}</p>
                )}
              </div>

              {/* Error */}
              {error && (
                <div className="mb-4 p-3 bg-red-50 rounded-lg">
                  <p className="text-sm text-red-600 text-center">{error}</p>
                </div>
              )}

              {/* Transfer Button */}
              <button
                onClick={handleTransfer}
                disabled={!canTransfer}
                className={`w-full py-3 rounded-xl font-medium transition-all flex items-center justify-center gap-2 ${
                  canTransfer
                    ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                {sending ? (
                  <>
                    <Loader size={16} className="animate-spin" />
                    Confirming in wallet...
                  </>
                ) : (
                  `Transfer${isValidAmount ? ` ${amount} ${selectedTokenInfo?.symbol || ''}` : ''} →`
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
