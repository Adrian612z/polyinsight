import { ethers } from 'ethers'
import { supabase } from './supabase.js'
import { grantCredits } from './credit.js'

export type TxStatus = 'pending' | 'confirmed' | 'failed'

interface ChainConfig {
  chain_name: string
  chain_id: number
  rpc_url: string
  usdc_address: string
  usdt_address: string
}

/**
 * Fetch the chain config from the database by chain_name.
 */
async function getChainConfig(chainName: string): Promise<ChainConfig | null> {
  const { data, error } = await supabase
    .from('chain_configs')
    .select('*')
    .eq('chain_name', chainName)
    .single()

  if (error || !data) return null
  return data as ChainConfig
}

/**
 * Query the on-chain transaction receipt to determine its final status.
 * Returns 'confirmed' if status === 1, 'failed' if status === 0,
 * or 'pending' if the receipt is not yet available.
 */
export async function getTransactionStatus(
  txHash: string,
  chainName: string
): Promise<{ status: TxStatus; receipt: ethers.TransactionReceipt | null }> {
  const chainConfig = await getChainConfig(chainName)
  if (!chainConfig) {
    throw new Error(`Unknown chain: ${chainName}`)
  }

  const provider = new ethers.JsonRpcProvider(chainConfig.rpc_url)
  const receipt = await provider.getTransactionReceipt(txHash)

  if (!receipt) {
    return { status: 'pending', receipt: null }
  }

  const status: TxStatus = receipt.status === 1 ? 'confirmed' : 'failed'
  return { status, receipt }
}

/**
 * Verify a transaction on-chain and update its status in the database.
 * When confirmed, grant credits to the user (1 USDC/USDT = 1 credit = 100 centicredits).
 * Polls up to maxAttempts times with the given interval.
 */
export async function verifyAndUpdateTransaction(
  txHash: string,
  chainName: string,
  userId?: string,
  amount?: string,
  maxAttempts = 10,
  intervalMs = 3000
): Promise<TxStatus> {
  console.log(`[TxVerify] Starting verification for tx=${txHash} chain=${chainName} user=${userId} amount=${amount}`)

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    console.log(`[TxVerify] Attempt ${attempt + 1}/${maxAttempts} for tx=${txHash}`)
    const { status } = await getTransactionStatus(txHash, chainName)
    console.log(`[TxVerify] tx=${txHash} status=${status}`)

    if (status !== 'pending') {
      await supabase
        .from('transactions')
        .update({ status, confirmed_at: new Date().toISOString() })
        .eq('tx_hash', txHash)
      console.log(`[TxVerify] Updated DB status to ${status} for tx=${txHash}`)

      // Grant credits on successful confirmation: 1 U = 1 credit = 100 centicredits
      if (status === 'confirmed' && userId && amount) {
        const usdAmount = parseFloat(amount)
        if (usdAmount > 0) {
          const centicredits = Math.floor(usdAmount * 100)
          console.log(`[TxVerify] Granting ${centicredits} centicredits (${usdAmount} U) to user=${userId}`)
          await grantCredits(
            userId,
            centicredits,
            'topup',
            txHash,
            `Top-up ${usdAmount.toFixed(2)} credits via ${chainName} transfer`
          )
          console.log(`[TxVerify] Credits granted successfully for tx=${txHash}`)
        }
      } else if (status === 'failed') {
        console.log(`[TxVerify] Transaction failed on-chain, no credits granted. tx=${txHash}`)
      }

      return status
    }

    if (attempt < maxAttempts - 1) {
      await new Promise(resolve => setTimeout(resolve, intervalMs))
    }
  }

  console.log(`[TxVerify] Still pending after ${maxAttempts} attempts, giving up. tx=${txHash}`)
  return 'pending'
}
