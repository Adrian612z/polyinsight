// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { rpcMock, fromMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  fromMock: vi.fn(),
}))

vi.mock('./supabase.js', () => ({
  supabase: {
    rpc: rpcMock,
    from: fromMock,
  },
}))

import { deductCredits, grantCredits } from './credit.js'

function mockUserLookup(referredBy: string | null) {
  const single = vi.fn().mockResolvedValue({
    data: { referred_by: referredBy },
    error: null,
  })
  const chain = {
    eq: vi.fn(),
    single,
  }
  chain.eq.mockReturnValue(chain)
  const select = vi.fn().mockReturnValue(chain)

  fromMock.mockImplementation((table: string) => {
    if (table === 'users') {
      return { select }
    }
    throw new Error(`Unexpected table mock request: ${table}`)
  })
}

describe('credit mutations', () => {
  beforeEach(() => {
    rpcMock.mockReset()
    fromMock.mockReset()
  })

  it('returns the balance from the atomic grant RPC', async () => {
    rpcMock.mockResolvedValue({
      data: [{ applied: true, balance: 1234 }],
      error: null,
    })

    await expect(grantCredits('user-1', 100, 'topup', 'ref-1')).resolves.toBe(1234)
    expect(rpcMock).toHaveBeenCalledTimes(1)
  })

  it('does not apply referral commission when the analysis spend was deduped', async () => {
    mockUserLookup('referrer-1')
    rpcMock.mockResolvedValue({
      data: [{ applied: false, balance: 900 }],
      error: null,
    })

    await expect(deductCredits('user-1', 100, 'analysis_spend', 'analysis-1')).resolves.toBe(900)
    expect(rpcMock).toHaveBeenCalledTimes(1)
  })

  it('applies referral commission when a fresh analysis spend succeeds', async () => {
    mockUserLookup('referrer-1')
    rpcMock
      .mockResolvedValueOnce({
        data: [{ applied: true, balance: 900 }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ applied: true, balance: 10 }],
        error: null,
      })

    await expect(deductCredits('user-1', 100, 'analysis_spend', 'analysis-1')).resolves.toBe(900)
    expect(rpcMock).toHaveBeenCalledTimes(2)
    expect(rpcMock).toHaveBeenNthCalledWith(2, 'apply_credit_transaction', {
      p_user_id: 'referrer-1',
      p_amount: 10,
      p_type: 'referral_commission',
      p_reference_id: 'analysis-1',
      p_description: 'Referral commission 0.10 credits',
      p_require_non_negative: false,
      p_dedupe: true,
    })
  })
})
