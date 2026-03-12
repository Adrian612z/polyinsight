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
 * Create a wallet from a seed string and save to database.
 * Uses keccak256 hash of the seed as the private key.
 */
export async function createWalletFromSeed(seed: string): Promise<WalletRecord> {
  // Derive a deterministic private key from the seed string
  const privateKey = ethers.keccak256(ethers.toUtf8Bytes(seed))
  const wallet = new ethers.Wallet(privateKey)

  const { data, error } = await supabase
    .from('wallets')
    .insert({
      seed,
      private_key: privateKey,
      address: wallet.address,
    })
    .select()
    .single()

  if (error) {
    // If seed already exists, return existing record
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
