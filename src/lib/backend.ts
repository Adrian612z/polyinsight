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
    error.code = data.code
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
    fetch(`${API_BASE}/featured${category ? `?category=${category}` : ''}`).then(r => r.json()),

  // Trending (public, live from Polymarket)
  getTrending: (limit = 12) =>
    fetch(`${API_BASE}/trending?limit=${limit}`).then(r => r.json()),

  // Wallet
  getOrCreateWallet: (seed: string) =>
    apiRequest('/wallet/create', { method: 'POST', body: JSON.stringify({ seed }) }),

  // Admin
  adminDashboard: () => apiRequest('/admin/dashboard'),
  adminUsers: (page = 1) => apiRequest(`/admin/users?page=${page}`),
  adminGrantCredits: (userId: string, amount: number, description?: string) =>
    apiRequest('/admin/credits/grant', {
      method: 'POST',
      body: JSON.stringify({ userId, amount, description }),
    }),
  adminAnalyses: (page = 1) => apiRequest(`/admin/analyses?page=${page}`),
}
