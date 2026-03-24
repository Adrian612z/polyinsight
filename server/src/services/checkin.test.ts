// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

import { computeNextRewardIn, getDailyCheckInStatus, getTodayInTimeZone, performDailyCheckIn } from './checkin.js'

function mockUserLookup(row: { checkin_streak: number; last_checkin_on: string | null }) {
  const single = vi.fn().mockResolvedValue({
    data: row,
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

describe('daily check-in service', () => {
  beforeEach(() => {
    rpcMock.mockReset()
    fromMock.mockReset()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-24T04:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('formats the current day in Asia/Shanghai', () => {
    expect(getTodayInTimeZone('Asia/Shanghai')).toBe('2026-03-24')
  })

  it('computes days until the next reward in a 3-day cycle', () => {
    expect(computeNextRewardIn(0, 3)).toBe(3)
    expect(computeNextRewardIn(1, 3)).toBe(2)
    expect(computeNextRewardIn(2, 3)).toBe(1)
    expect(computeNextRewardIn(3, 3)).toBe(3)
  })

  it('marks a user as checked in today when the last check-in date matches', async () => {
    mockUserLookup({
      checkin_streak: 2,
      last_checkin_on: '2026-03-24',
    })

    await expect(getDailyCheckInStatus('user-1')).resolves.toEqual({
      streak: 2,
      checkedInToday: true,
      lastCheckInOn: '2026-03-24',
      nextRewardIn: 1,
      rewardAmount: 100,
      cycle: 3,
    })
  })

  it('parses a rewarded RPC response into balance and status', async () => {
    rpcMock.mockResolvedValue({
      data: [{
        balance: 500,
        streak: 3,
        rewarded: true,
        reward_amount: 100,
        checkin_date: '2026-03-24',
      }],
      error: null,
    })

    await expect(performDailyCheckIn('user-1')).resolves.toEqual({
      balance: 500,
      rewarded: true,
      rewardAmount: 100,
      status: {
        streak: 3,
        checkedInToday: true,
        lastCheckInOn: '2026-03-24',
        nextRewardIn: 3,
        rewardAmount: 100,
        cycle: 3,
      },
    })
  })

  it('maps already-checked-in RPC errors to a stable code', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        message: 'ALREADY_CHECKED_IN',
      },
    })

    await expect(performDailyCheckIn('user-1')).rejects.toMatchObject({
      code: 'ALREADY_CHECKED_IN',
    })
  })
})
