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

import { approveBillingOrder, rejectBillingOrder } from './billing.js'

describe('billing review RPC integration', () => {
  beforeEach(() => {
    rpcMock.mockReset()
    fromMock.mockReset()
  })

  it('returns the atomic approve payload when the RPC succeeds', async () => {
    const payload = {
      order: {
        id: 'order-1',
        user_id: 'user-1',
        plan_id: 'monthly',
        status: 'approved',
        expected_amount_tokens: 20,
        expected_credits: 6000,
      },
      subscription: {
        id: 'sub-1',
        user_id: 'user-1',
        plan_id: 'monthly',
        status: 'active',
        included_credits: 6000,
        unlimited: false,
        starts_at: '2026-03-18T00:00:00.000Z',
        ends_at: '2026-04-17T00:00:00.000Z',
      },
    }

    rpcMock.mockResolvedValue({ data: payload, error: null })

    await expect(approveBillingOrder('order-1', 'admin-1', 'ok')).resolves.toEqual(payload)
    expect(rpcMock).toHaveBeenCalledWith('approve_billing_order_atomic', {
      p_order_id: 'order-1',
      p_reviewer_user_id: 'admin-1',
      p_review_note: 'ok',
    })
  })

  it('maps approve RPC business errors to stable application errors', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'ORDER_ALREADY_APPROVED' },
    })

    await expect(approveBillingOrder('order-1')).rejects.toThrow('ORDER_ALREADY_APPROVED')
  })

  it('maps reject RPC business errors to stable application errors', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'ORDER_NOT_REJECTABLE' },
    })

    await expect(rejectBillingOrder('order-1')).rejects.toThrow('ORDER_NOT_REJECTABLE')
  })
})
