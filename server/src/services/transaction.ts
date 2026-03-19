import { ethers } from 'ethers'
import { approveBillingOrder, getBillingPlan, rejectBillingOrder } from './billing.js'
import { grantCredits } from './credit.js'
import { supabase } from './supabase.js'
import { createWalletForUser } from './wallet.js'

const ERC20_TRANSFER_TOPIC = ethers.id('Transfer(address,address,uint256)')
const STABLECOIN_DECIMALS = 6
const TOPUP_MINIMUM_TOKENS = 0.01
const PACKAGE_MATCH_TOLERANCE = 0.0001
const RETRYABLE_PENDING_NOTE = 'Transaction not confirmed on-chain yet'

interface ChainConfig {
  chain_name: string
  rpc_url: string
  usdc_address: string
  usdt_address: string
}

interface DecodedTransfer {
  tokenSymbol: 'USDC' | 'USDT'
  tokenAddress: string
  from: string
  to: string
  amountTokens: number
  amountRaw: bigint
}

function normalizeAddress(address: string): string {
  return ethers.getAddress(address)
}

function parseAmountTokens(value: bigint): number {
  return Number(ethers.formatUnits(value, STABLECOIN_DECIMALS))
}

async function getChainConfig(chainName: string): Promise<ChainConfig | null> {
  const { data, error } = await supabase
    .from('chain_configs')
    .select('chain_name, rpc_url, usdc_address, usdt_address')
    .eq('chain_name', chainName)
    .maybeSingle()

  if (error || !data) return null
  return data as ChainConfig
}

async function getUserWalletAddress(userId: string): Promise<string> {
  const wallet = await createWalletForUser(userId)
  return normalizeAddress(wallet.address)
}

function decodeSupportedStablecoinTransfers(
  receipt: ethers.TransactionReceipt,
  chainConfig: ChainConfig
): DecodedTransfer[] {
  const usdc = normalizeAddress(chainConfig.usdc_address)
  const usdt = normalizeAddress(chainConfig.usdt_address)
  const tokenMap = new Map<string, 'USDC' | 'USDT'>([
    [usdc, 'USDC'],
    [usdt, 'USDT'],
  ])

  return receipt.logs.flatMap((log) => {
    if (!log.topics?.length || log.topics[0] !== ERC20_TRANSFER_TOPIC) return []

    const tokenAddress = normalizeAddress(log.address)
    const tokenSymbol = tokenMap.get(tokenAddress)
    if (!tokenSymbol) return []

    try {
      const decoded = ethers.AbiCoder.defaultAbiCoder().decode(['uint256'], log.data)
      const from = normalizeAddress(`0x${log.topics[1].slice(26)}`)
      const to = normalizeAddress(`0x${log.topics[2].slice(26)}`)
      const amountRaw = decoded[0] as bigint

      return [{
        tokenSymbol,
        tokenAddress,
        from,
        to,
        amountRaw,
        amountTokens: parseAmountTokens(amountRaw),
      }]
    } catch {
      return []
    }
  })
}

async function setTransactionReviewState(params: {
  txHash: string
  status: 'pending_review' | 'approved' | 'rejected'
  note: string
  tokenSymbol?: string | null
  amountTokens?: number | null
  toAddress?: string | null
  fromAddress?: string | null
}) {
  const { txHash, status, note, tokenSymbol, amountTokens, toAddress, fromAddress } = params

  await supabase
    .from('transactions')
    .update({
      status,
      review_note: note,
      reviewed_at: status === 'pending_review' ? null : new Date().toISOString(),
      token_symbol: tokenSymbol ?? undefined,
      amount: amountTokens != null ? amountTokens.toFixed(6) : undefined,
      to_address: toAddress ?? undefined,
      from_address: fromAddress ?? undefined,
    })
    .eq('tx_hash', txHash)
}

function isRetryablePendingTransaction(tx: {
  status?: string | null
  review_note?: string | null
  created_at?: string | null
}): boolean {
  if (tx.status !== 'pending_review') return false

  const note = tx.review_note || ''
  const retryableByNote =
    note === '' ||
    note === RETRYABLE_PENDING_NOTE ||
    note.startsWith('RPC verification failed')

  if (!retryableByNote) {
    return false
  }

  if (!tx.created_at) return true

  const ageMs = Date.now() - new Date(tx.created_at).getTime()
  return ageMs <= 6 * 60 * 60 * 1000
}

export async function verifyAndProcessTransaction(txHash: string): Promise<void> {
  const { data: tx, error: txErr } = await supabase
    .from('transactions')
    .select('*')
    .eq('tx_hash', txHash)
    .maybeSingle()

  if (txErr || !tx) {
    throw new Error('TRANSACTION_NOT_FOUND')
  }

  if (tx.status === 'approved' || tx.status === 'rejected') {
    return
  }

  if (!tx.user_id) {
    throw new Error('TRANSACTION_MISSING_USER')
  }

  if (!tx.chain_name || typeof tx.chain_name !== 'string') {
    await setTransactionReviewState({
      txHash,
      status: 'pending_review',
      note: 'Transaction missing chain_name; requires manual review',
    })
    return
  }

  const chainConfig = await getChainConfig(tx.chain_name)
  if (!chainConfig) {
    await setTransactionReviewState({
      txHash,
      status: 'pending_review',
      note: `Unknown chain ${tx.chain_name}; requires manual review`,
    })
    return
  }

  const provider = new ethers.JsonRpcProvider(chainConfig.rpc_url)
  let receipt: ethers.TransactionReceipt | null = null

  try {
    receipt = await provider.getTransactionReceipt(txHash)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await setTransactionReviewState({
      txHash,
      status: 'pending_review',
      note: `RPC verification failed for ${tx.chain_name}: ${message.slice(0, 160)}`,
    })
    return
  }

  if (!receipt) {
    await setTransactionReviewState({
      txHash,
      status: 'pending_review',
      note: RETRYABLE_PENDING_NOTE,
    })
    return
  }

  if (receipt.status !== 1) {
    if (tx.billing_order_id) {
      await rejectBillingOrder(tx.billing_order_id, null, 'On-chain transaction failed')
    }
    await setTransactionReviewState({
      txHash,
      status: 'rejected',
      note: 'Transaction failed on-chain',
    })
    return
  }

  const recipientWallet = await getUserWalletAddress(tx.user_id)
  const transfers = decodeSupportedStablecoinTransfers(receipt, chainConfig)
  const matchedTransfer = transfers
    .filter((transfer) => transfer.to === recipientWallet)
    .sort((a, b) => b.amountTokens - a.amountTokens)[0]

  if (!matchedTransfer) {
    await setTransactionReviewState({
      txHash,
      status: 'pending_review',
      note: `No supported USDT/USDC transfer to user wallet ${recipientWallet} found in transaction`,
    })
    return
  }

  if (tx.billing_order_id) {
    const { data: order, error: orderErr } = await supabase
      .from('billing_orders')
      .select('*')
      .eq('id', tx.billing_order_id)
      .maybeSingle()

    if (orderErr || !order) {
      await setTransactionReviewState({
        txHash,
        status: 'pending_review',
        note: 'Billing order missing during automatic verification',
        tokenSymbol: matchedTransfer.tokenSymbol,
        amountTokens: matchedTransfer.amountTokens,
        toAddress: matchedTransfer.to,
        fromAddress: matchedTransfer.from,
      })
      return
    }

    if (order.tx_hash && order.tx_hash !== txHash) {
      await setTransactionReviewState({
        txHash,
        status: 'pending_review',
        note: 'Billing order is now linked to a different transaction; skipped automatic approval',
        tokenSymbol: matchedTransfer.tokenSymbol,
        amountTokens: matchedTransfer.amountTokens,
        toAddress: matchedTransfer.to,
        fromAddress: matchedTransfer.from,
      })
      return
    }

    const plan = getBillingPlan(order.plan_id)
    if (!plan) {
      await setTransactionReviewState({
        txHash,
        status: 'pending_review',
        note: `Unknown plan ${order.plan_id}; requires manual review`,
        tokenSymbol: matchedTransfer.tokenSymbol,
        amountTokens: matchedTransfer.amountTokens,
        toAddress: matchedTransfer.to,
        fromAddress: matchedTransfer.from,
      })
      return
    }

    const expectedAmount = Number(order.expected_amount_tokens)

    if (order.plan_id === 'topup') {
      if (matchedTransfer.amountTokens < TOPUP_MINIMUM_TOKENS) {
        await setTransactionReviewState({
          txHash,
          status: 'pending_review',
          note: `Top-up below minimum ${TOPUP_MINIMUM_TOKENS.toFixed(2)} tokens`,
          tokenSymbol: matchedTransfer.tokenSymbol,
          amountTokens: matchedTransfer.amountTokens,
          toAddress: matchedTransfer.to,
          fromAddress: matchedTransfer.from,
        })
        return
      }

      await supabase
        .from('billing_orders')
        .update({
          expected_amount_tokens: matchedTransfer.amountTokens.toFixed(6),
          expected_credits: Math.round(matchedTransfer.amountTokens * 100),
          token_symbol: matchedTransfer.tokenSymbol,
          updated_at: new Date().toISOString(),
        })
        .eq('id', order.id)

      await approveBillingOrder(order.id, null, `Auto-approved top-up from on-chain verification (${matchedTransfer.amountTokens.toFixed(6)} ${matchedTransfer.tokenSymbol})`)
      await setTransactionReviewState({
        txHash,
        status: 'approved',
        note: 'Top-up auto-approved from on-chain verification',
        tokenSymbol: matchedTransfer.tokenSymbol,
        amountTokens: matchedTransfer.amountTokens,
        toAddress: matchedTransfer.to,
        fromAddress: matchedTransfer.from,
      })
      return
    }

    const delta = Math.abs(matchedTransfer.amountTokens - expectedAmount)
    if (delta > PACKAGE_MATCH_TOLERANCE) {
      await setTransactionReviewState({
        txHash,
        status: 'pending_review',
        note: `Package payment mismatch. Expected ${expectedAmount.toFixed(6)}, received ${matchedTransfer.amountTokens.toFixed(6)} ${matchedTransfer.tokenSymbol}`,
        tokenSymbol: matchedTransfer.tokenSymbol,
        amountTokens: matchedTransfer.amountTokens,
        toAddress: matchedTransfer.to,
        fromAddress: matchedTransfer.from,
      })
      return
    }

    await approveBillingOrder(order.id, null, `Auto-approved package payment from on-chain verification (${matchedTransfer.amountTokens.toFixed(6)} ${matchedTransfer.tokenSymbol})`)
    await setTransactionReviewState({
      txHash,
      status: 'approved',
      note: 'Package payment auto-approved from on-chain verification',
      tokenSymbol: matchedTransfer.tokenSymbol,
      amountTokens: matchedTransfer.amountTokens,
      toAddress: matchedTransfer.to,
      fromAddress: matchedTransfer.from,
    })
    return
  }

  if (matchedTransfer.amountTokens < TOPUP_MINIMUM_TOKENS) {
    await setTransactionReviewState({
      txHash,
      status: 'pending_review',
      note: `Standalone top-up below minimum ${TOPUP_MINIMUM_TOKENS.toFixed(2)} tokens`,
      tokenSymbol: matchedTransfer.tokenSymbol,
      amountTokens: matchedTransfer.amountTokens,
      toAddress: matchedTransfer.to,
      fromAddress: matchedTransfer.from,
    })
    return
  }

  const grantedCenticredits = Math.round(matchedTransfer.amountTokens * 100)
  await grantCredits(
    tx.user_id,
    grantedCenticredits,
    'topup',
    txHash,
    `Auto top-up from verified ${matchedTransfer.tokenSymbol} transfer`
  )

  await setTransactionReviewState({
    txHash,
    status: 'approved',
    note: 'Standalone top-up auto-approved from on-chain verification',
    tokenSymbol: matchedTransfer.tokenSymbol,
    amountTokens: matchedTransfer.amountTokens,
    toAddress: matchedTransfer.to,
    fromAddress: matchedTransfer.from,
  })
}

export async function retryPendingTransactions(limit = 20): Promise<number> {
  const { data, error } = await supabase
    .from('transactions')
    .select('tx_hash, status, review_note, created_at')
    .eq('status', 'pending_review')
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) throw error

  const candidates = (data || []).filter(isRetryablePendingTransaction)
  for (const tx of candidates) {
    await verifyAndProcessTransaction(tx.tx_hash)
  }

  return candidates.length
}

export function startTransactionVerificationJob() {
  void retryPendingTransactions().catch((err) => {
    console.error('[Transactions] Initial retry sweep failed:', err)
  })

  setInterval(() => {
    void retryPendingTransactions().catch((err) => {
      console.error('[Transactions] Periodic retry sweep failed:', err)
    })
  }, 60 * 1000)

  console.log('[Transactions] Verification retry job scheduled: every 1 minute')
}
