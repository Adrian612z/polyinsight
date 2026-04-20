const API_BASE = '/api'
import type { AnalysisFlowView } from './analysisFlow'
import { getTrackingSessionId } from './tracking'

// Module-scoped token storage (not exposed on window)
let _privyToken: string | null = null

async function getPrivyToken(): Promise<string | null> {
  return _privyToken
}

export function setPrivyToken(token: string | null) {
  _privyToken = token
}

async function apiRequest(path: string, options: RequestInit = {}) {
  const token = await getPrivyToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  })

  const raw = await res.text()
  const contentType = res.headers.get('content-type') || ''
  let data: any = null

  if (raw) {
    if (contentType.includes('application/json')) {
      data = JSON.parse(raw)
    } else {
      try {
        data = JSON.parse(raw)
      } catch {
        data = { error: `Request failed with status ${res.status}` }
      }
    }
  }

  if (!res.ok) {
    const error = new Error(data?.error || `Request failed with status ${res.status}`) as Error & { code?: string; status?: number }
    error.code = data?.code
    error.status = res.status
    throw error
  }

  return data
}

async function publicRequest(path: string) {
  const res = await fetch(`${API_BASE}${path}`)
  const raw = await res.text()
  const contentType = res.headers.get('content-type') || ''
  let data: any = null

  if (raw) {
    if (contentType.includes('application/json')) {
      data = JSON.parse(raw)
    } else {
      try {
        data = JSON.parse(raw)
      } catch {
        data = { error: `Request failed with status ${res.status}` }
      }
    }
  }

  if (!res.ok) {
    const error = new Error(data?.error || `Request failed with status ${res.status}`) as Error & { status?: number }
    error.status = res.status
    throw error
  }

  return data
}

export const api = {
  // Users
  register: (body: {
    email?: string
    displayName?: string
    referralCode?: string
    trackingSessionId?: string
  }) =>
    apiRequest('/users/register', { method: 'POST', body: JSON.stringify(body) }),

  applyReferralCode: (referralCode: string) =>
    apiRequest('/users/referral-code', { method: 'POST', body: JSON.stringify({ referralCode }) }),

  getMe: () => apiRequest('/users/me'),

  updateMe: (body: { displayName: string }) =>
    apiRequest('/users/me', { method: 'PATCH', body: JSON.stringify(body) }),

  // Analysis
  createAnalysis: (url: string, lang?: string) =>
    apiRequest('/analysis', {
      method: 'POST',
      body: JSON.stringify({
        url,
        lang: lang || 'en',
        trackingSessionId: getTrackingSessionId(),
      }),
    }),

  getAnalysisHistory: (page = 1, limit = 10) =>
    apiRequest(`/analysis/history?page=${page}&limit=${limit}`),

  pollAnalysis: (recordId: string) =>
    apiRequest(`/analysis/${recordId}/poll`),

  getAnalysisDetail: (recordId: string) =>
    apiRequest(`/analysis/${recordId}/detail`),

  cancelAnalysis: (recordId: string) =>
    apiRequest(`/analysis/${recordId}/cancel`, { method: 'POST' }),

  deleteAnalysis: (recordId: string) =>
    apiRequest(`/analysis/${recordId}`, { method: 'DELETE' }),

  // Credits
  getCreditHistory: (page = 1) =>
    apiRequest(`/credits/history?page=${page}`),

  getCheckInStatus: () =>
    apiRequest('/credits/check-in'),

  checkIn: () =>
    apiRequest('/credits/check-in', { method: 'POST' }),

  // Referral
  getReferralInfo: () => apiRequest('/referral/info'),

  // Featured (public, no auth needed)
  getFeatured: (category?: string) =>
    publicRequest(`/featured${category ? `?category=${category}` : ''}`),

  // Trending (public, live from Polymarket)
  getTrending: (limit = 12) =>
    publicRequest(`/trending?limit=${limit}`),

  // Market terminal (public)
  getMarkets: (params: {
    category?: string
    q?: string
    sort?: string
    page?: number
    pageSize?: number
  }) => {
    const search = new URLSearchParams()
    if (params.category) search.set('category', params.category)
    if (params.q) search.set('q', params.q)
    if (params.sort) search.set('sort', params.sort)
    if (params.page) search.set('page', String(params.page))
    if (params.pageSize) search.set('pageSize', String(params.pageSize))
    const suffix = search.toString()
    return publicRequest(`/markets${suffix ? `?${suffix}` : ''}`)
  },

  getMarket: (marketSlug: string) =>
    publicRequest(`/markets/${encodeURIComponent(marketSlug)}`),

  // Wallet
  getOrCreateWallet: () =>
    apiRequest('/wallet/create', { method: 'POST' }),

  // Billing
  getBillingPlans: () => publicRequest('/billing/plans'),

  getBillingOverview: () => apiRequest('/billing/me'),

  createBillingOrder: (planId: 'topup' | 'monthly' | 'unlimited', amount?: number) =>
    apiRequest('/billing/orders', {
      method: 'POST',
      body: JSON.stringify({
        planId,
        amount,
        trackingSessionId: getTrackingSessionId(),
      }),
    }),

  cancelBillingOrder: (orderId: string) =>
    apiRequest(`/billing/orders/${orderId}/cancel`, { method: 'POST' }),

  saveTransaction: (body: {
    tx_hash: string
    from_address: string
    to_address: string
    chain_name: string
    token_symbol: string
    amount: string
    billing_order_id?: string
  }) => apiRequest('/transactions', { method: 'POST', body: JSON.stringify(body) }),
}

export type AnalysisPollResponse = {
  status: 'pending' | 'completed' | 'failed' | 'cancelled'
  analysis_result: string | null
  error?: string | null
  flow?: AnalysisFlowView | null
}
