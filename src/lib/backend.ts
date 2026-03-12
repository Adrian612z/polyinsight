const API_BASE = '/api'

async function getPrivyToken(): Promise<string | null> {
  // Privy stores tokens in its internal state
  // We access it via the window.__PRIVY_TOKEN__ set by App.tsx
  return (window as unknown as Record<string, string>).__PRIVY_TOKEN__ || null
}

export function setPrivyToken(token: string | null) {
  (window as unknown as Record<string, string | null>).__PRIVY_TOKEN__ = token
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

  const data = await res.json()

  if (!res.ok) {
    const error = new Error(data.error || 'Request failed') as Error & { code?: string; status?: number }
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
