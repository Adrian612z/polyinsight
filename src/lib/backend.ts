const API_BASE = '/api'

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
  register: (body: { email?: string; displayName?: string; referralCode?: string }) =>
    apiRequest('/users/register', { method: 'POST', body: JSON.stringify(body) }),

  getMe: () => apiRequest('/users/me'),

  // Analysis
  createAnalysis: (url: string, lang?: string) =>
    apiRequest('/analysis', { method: 'POST', body: JSON.stringify({ url, lang: lang || 'en' }) }),

  getAnalysisHistory: (page = 1, limit = 10) =>
    apiRequest(`/analysis/history?page=${page}&limit=${limit}`),

  pollAnalysis: (recordId: string) =>
    apiRequest(`/analysis/${recordId}/poll`),

  cancelAnalysis: (recordId: string) =>
    apiRequest(`/analysis/${recordId}/cancel`, { method: 'POST' }),

  deleteAnalysis: (recordId: string) =>
    apiRequest(`/analysis/${recordId}`, { method: 'DELETE' }),

  // Credits
  getCreditHistory: (page = 1) =>
    apiRequest(`/credits/history?page=${page}`),

  // Referral
  getReferralInfo: () => apiRequest('/referral/info'),

  // Featured (public, no auth needed)
  getFeatured: (category?: string) =>
    publicRequest(`/featured${category ? `?category=${category}` : ''}`),

  // Trending (public, live from Polymarket)
  getTrending: (limit = 12) =>
    publicRequest(`/trending?limit=${limit}`),

  // Wallet
  getOrCreateWallet: () =>
    apiRequest('/wallet/create', { method: 'POST' }),

  // Billing
  getBillingPlans: () => publicRequest('/billing/plans'),

  getBillingOverview: () => apiRequest('/billing/me'),

  createBillingOrder: (planId: 'topup' | 'monthly' | 'unlimited', amount?: number) =>
    apiRequest('/billing/orders', {
      method: 'POST',
      body: JSON.stringify({ planId, amount }),
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
