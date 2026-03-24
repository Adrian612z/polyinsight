import { api } from './backend'

export interface CachedReferralInfo {
  referralCode: string
  referralLink: string
  invitedCount: number
  totalCommission: number
  invitedUsers: Array<{
    id: string
    email: string | null
    display_name: string | null
    created_at: string
  }>
  commissionRecords: Array<{
    id: string
    amount: number
    description: string | null
    balance_after: number
    created_at: string
    reference_id: string | null
  }>
}

export interface CachedCreditTx {
  id: string
  amount: number
  type: string
  description: string | null
  balance_after: number
  created_at: string
}

export interface CachedCheckInStatus {
  streak: number
  checkedInToday: boolean
  lastCheckInOn: string | null
  nextRewardIn: number
  rewardAmount: number
  cycle: number
}

export interface CachedProfileData {
  referralInfo: CachedReferralInfo | null
  creditHistory: CachedCreditTx[]
  checkInStatus: CachedCheckInStatus | null
}

export interface CachedAnalysisRecord {
  id: string
  event_url: string
  analysis_result: string | null
  status: 'pending' | 'completed' | 'failed'
  created_at: string
}

export interface CachedHistoryPage {
  records: CachedAnalysisRecord[]
  total: number
  page: number
}

const memoryCache = new Map<string, unknown>()

function readCache<T>(key: string): T | null {
  const cached = memoryCache.get(key)
  if (cached) return cached as T

  if (typeof window === 'undefined') return null

  const raw = window.sessionStorage.getItem(key)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as T
    memoryCache.set(key, parsed)
    return parsed
  } catch {
    window.sessionStorage.removeItem(key)
    return null
  }
}

function writeCache<T>(key: string, value: T) {
  memoryCache.set(key, value)

  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(key, JSON.stringify(value))
}

function profileKey(userId: string) {
  return `page-cache:profile:${userId}`
}

function historyKey(userId: string, page: number, limit: number) {
  return `page-cache:history:${userId}:${page}:${limit}`
}

export function getCachedProfileData(userId: string) {
  return readCache<CachedProfileData>(profileKey(userId))
}

export function setCachedProfileData(userId: string, data: CachedProfileData) {
  writeCache(profileKey(userId), data)
}

export function getCachedHistoryPage(userId: string, page: number, limit: number) {
  return readCache<CachedHistoryPage>(historyKey(userId, page, limit))
}

export function setCachedHistoryPage(userId: string, page: number, limit: number, data: CachedHistoryPage) {
  writeCache(historyKey(userId, page, limit), data)
}

export async function fetchAndCacheProfileData(userId: string) {
  const [refInfo, creditData, checkInStatus] = await Promise.all([
    api.getReferralInfo().catch(() => null),
    api.getCreditHistory().catch(() => ({ transactions: [] as CachedCreditTx[] })),
    api.getCheckInStatus().catch(() => null),
  ])

  const nextData: CachedProfileData = {
    referralInfo: refInfo,
    creditHistory: creditData?.transactions || [],
    checkInStatus: checkInStatus || null,
  }

  setCachedProfileData(userId, nextData)
  return nextData
}

export async function fetchAndCacheHistoryPage(userId: string, page: number, limit: number) {
  const res = await api.getAnalysisHistory(page, limit)
  const nextData: CachedHistoryPage = {
    records: res.records || [],
    total: res.total || 0,
    page,
  }

  setCachedHistoryPage(userId, page, limit, nextData)
  return nextData
}

export async function primeWorkspaceCaches(userId: string) {
  await Promise.allSettled([
    fetchAndCacheProfileData(userId),
    fetchAndCacheHistoryPage(userId, 1, 10),
  ])
}
