// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  hydrateBillingOrderSnapshot,
  selectLatestBillingOrderTransaction,
} from './billing.js'

describe('selectLatestBillingOrderTransaction', () => {
  it('returns null for empty lists', () => {
    expect(selectLatestBillingOrderTransaction([])).toBeNull()
  })

  it('prefers the newest created_at timestamp', () => {
    const latest = selectLatestBillingOrderTransaction([
      { id: '1', tx_hash: '0x1', created_at: '2026-03-18T10:00:00.000Z' },
      { id: '2', tx_hash: '0x2', created_at: '2026-03-18T11:00:00.000Z' },
    ])

    expect(latest?.tx_hash).toBe('0x2')
  })
})

describe('hydrateBillingOrderSnapshot', () => {
  it('keeps the order unchanged when no transactions exist', () => {
    const order = {
      id: 'order-1',
      user_id: 'user-1',
      plan_id: 'monthly' as const,
      status: 'submitted' as const,
      expected_amount_tokens: 39.9,
      expected_credits: 6000,
      tx_hash: null,
      token_symbol: null,
      expires_at: null,
    }

    expect(hydrateBillingOrderSnapshot(order, [])).toEqual(order)
  })

  it('hydrates tx fields from the latest linked transaction', () => {
    const order = {
      id: 'order-1',
      user_id: 'user-1',
      plan_id: 'monthly' as const,
      status: 'submitted' as const,
      expected_amount_tokens: 39.9,
      expected_credits: 6000,
      tx_hash: 'legacy-hash',
      token_symbol: null,
      submitted_at: null,
      expires_at: null,
    }

    const hydrated = hydrateBillingOrderSnapshot(order, [
      { id: '1', tx_hash: '0xold', token_symbol: 'USDT', created_at: '2026-03-18T10:00:00.000Z' },
      { id: '2', tx_hash: '0xnew', token_symbol: 'USDC', created_at: '2026-03-18T11:00:00.000Z' },
    ])

    expect(hydrated.tx_hash).toBe('0xnew')
    expect(hydrated.token_symbol).toBe('USDC')
    expect(hydrated.submitted_at).toBe('2026-03-18T11:00:00.000Z')
  })
})
