import { config } from '../config.js'
import { supabase } from './supabase.js'

export interface DailyCheckInStatus {
  streak: number
  checkedInToday: boolean
  lastCheckInOn: string | null
  nextRewardIn: number
  rewardAmount: number
  cycle: number
}

interface DailyCheckInRpcRow {
  checked_in?: boolean
  streak?: number
  rewarded?: boolean
  reward_amount?: number
  balance?: number
  checkin_date?: string
}

interface DailyCheckInUserRow {
  checkin_streak?: number | null
  last_checkin_on?: string | null
}

type CheckInErrorCode = 'ALREADY_CHECKED_IN' | 'USER_NOT_FOUND' | 'DAILY_CHECKIN_RPC_MISSING'

export function getTodayInTimeZone(timeZone = config.dailyCheckinTimezone, now = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = formatter.formatToParts(now)
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value

  if (!year || !month || !day) {
    throw new Error(`Failed to format date in timezone ${timeZone}`)
  }

  return `${year}-${month}-${day}`
}

export function computeNextRewardIn(streak: number, cycle = config.dailyCheckinCycle): number {
  const safeCycle = Math.max(1, cycle)
  const remainder = streak % safeCycle
  return remainder === 0 ? safeCycle : safeCycle - remainder
}

export async function getDailyCheckInStatus(userId: string): Promise<DailyCheckInStatus> {
  const { data, error } = await supabase
    .from('users')
    .select('checkin_streak, last_checkin_on')
    .eq('id', userId)
    .single()

  if (error || !data) {
    throw createCheckInError('USER_NOT_FOUND')
  }

  return normalizeDailyCheckInStatus(data)
}

export async function performDailyCheckIn(userId: string): Promise<{
  balance: number
  rewarded: boolean
  rewardAmount: number
  status: DailyCheckInStatus
}> {
  const today = getTodayInTimeZone()
  const { data, error } = await supabase.rpc('perform_daily_checkin', {
    p_user_id: userId,
    p_checkin_date: today,
  })

  if (error) {
    const message = [error.message, error.details, error.hint].filter(Boolean).join(' ')
    if (/ALREADY_CHECKED_IN/i.test(message)) {
      throw createCheckInError('ALREADY_CHECKED_IN')
    }
    if (/USER_NOT_FOUND/i.test(message)) {
      throw createCheckInError('USER_NOT_FOUND')
    }
    if (isMissingDailyCheckInRpc(message)) {
      throw createCheckInError('DAILY_CHECKIN_RPC_MISSING')
    }
    throw new Error(`Daily check-in failed: ${message || 'unknown error'}`)
  }

  const row = (Array.isArray(data) ? data[0] : data) as DailyCheckInRpcRow | null
  if (!row || typeof row.balance !== 'number' || typeof row.streak !== 'number') {
    throw new Error('Daily check-in failed: empty RPC response')
  }

  return {
    balance: row.balance,
    rewarded: row.rewarded === true,
    rewardAmount: typeof row.reward_amount === 'number' ? row.reward_amount : 0,
    status: normalizeDailyCheckInStatus({
      checkin_streak: row.streak,
      last_checkin_on: row.checkin_date || today,
    }),
  }
}

function normalizeDailyCheckInStatus(row: DailyCheckInUserRow): DailyCheckInStatus {
  const streak = Math.max(0, row.checkin_streak || 0)
  const lastCheckInOn = row.last_checkin_on || null
  const checkedInToday = lastCheckInOn === getTodayInTimeZone()

  return {
    streak,
    checkedInToday,
    lastCheckInOn,
    nextRewardIn: computeNextRewardIn(streak),
    rewardAmount: config.dailyCheckinReward,
    cycle: config.dailyCheckinCycle,
  }
}

function createCheckInError(code: CheckInErrorCode) {
  const err = new Error(code) as Error & { code: CheckInErrorCode }
  err.code = code
  return err
}

function isMissingDailyCheckInRpc(message: string): boolean {
  return /perform_daily_checkin/i.test(message) && /find the function|does not exist|schema cache|not found/i.test(message)
}
