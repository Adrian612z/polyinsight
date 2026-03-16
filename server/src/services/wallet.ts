import { ethers } from 'ethers'
import { supabase } from './supabase.js'

export interface WalletRecord {
  id: string
  seed: string
  private_key: string
  address: string
  created_at: string
}

/**
 * Create a per-user wallet if one does not already exist.
 * The seed acts only as an internal lookup key, not as wallet entropy.
 */
export async function createWalletFromSeed(seed: string): Promise<WalletRecord> {
  const { data: existing } = await supabase
    .from('wallets')
    .select('*')
    .eq('seed', seed)
    .single()

  if (existing) {
    return existing as WalletRecord
  }

  const wallet = ethers.Wallet.createRandom()

  const { data, error } = await supabase
    .from('wallets')
    .insert({
      seed,
      private_key: wallet.privateKey,
      address: wallet.address,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      const { data: existing } = await supabase
        .from('wallets')
        .select('*')
        .eq('seed', seed)
        .single()
      if (existing) return existing as WalletRecord
    }
    throw error
  }

  return data as WalletRecord
}

/**
 * Look up a wallet address by seed string.
 */
export async function getWalletBySeed(seed: string): Promise<WalletRecord | null> {
  const { data, error } = await supabase
    .from('wallets')
    .select('*')
    .eq('seed', seed)
    .single()

  if (error || !data) return null
  return data as WalletRecord
}
