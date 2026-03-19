import { ethers } from 'ethers'
import { supabase } from './supabase.js'

export interface WalletRecord {
  id: string
  user_id?: string | null
  seed: string
  private_key: string
  address: string
  created_at: string
}

function legacyWalletSeed(userId: string): string {
  return `user:${userId}`
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

export async function getWalletByUserId(userId: string): Promise<WalletRecord | null> {
  const direct = await getWalletByUserIdDirect(userId)
  if (direct) return direct

  const legacy = await getWalletBySeed(legacyWalletSeed(userId))
  if (!legacy) return null

  await assignWalletToUserIfSupported(legacy.id, userId)
  return { ...legacy, user_id: userId }
}

export async function createWalletForUser(userId: string): Promise<WalletRecord> {
  const existing = await getWalletByUserId(userId)
  if (existing) return existing

  const wallet = ethers.Wallet.createRandom()
  const payload = {
    user_id: userId,
    seed: legacyWalletSeed(userId),
    private_key: wallet.privateKey,
    address: wallet.address,
  }

  const { data, error } = await supabase
    .from('wallets')
    .insert(payload)
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      const fallback = await getWalletByUserId(userId)
      if (fallback) return fallback
    }
    if (isMissingWalletUserIdColumn(error)) {
      return createWalletFromSeed(payload.seed)
    }
    throw error
  }

  return data as WalletRecord
}

async function getWalletByUserIdDirect(userId: string): Promise<WalletRecord | null> {
  const { data, error } = await supabase
    .from('wallets')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    if (isMissingWalletUserIdColumn(error)) {
      return null
    }
    throw error
  }

  if (!data) return null
  return data as WalletRecord
}

async function assignWalletToUserIfSupported(walletId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('wallets')
    .update({ user_id: userId })
    .eq('id', walletId)
    .is('user_id', null)

  if (error && !isMissingWalletUserIdColumn(error)) {
    console.warn('[Wallet] Failed to assign wallet.user_id:', error.message)
  }
}

function isMissingWalletUserIdColumn(error: {
  code?: string
  message?: string
  details?: string | null
  hint?: string | null
}): boolean {
  const message = [error.message, error.details, error.hint].filter(Boolean).join(' ')
  return /user_id/i.test(message) && /column|schema cache|does not exist|not found/i.test(message)
}
