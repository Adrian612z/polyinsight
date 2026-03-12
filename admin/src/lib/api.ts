const API_BASE = '/api'

function getToken(): string | null {
  return localStorage.getItem('admin_token')
}

async function request<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Admin ${token}` } : {}),
      ...(options.headers || {}),
    },
  })

  if (res.status === 401) {
    localStorage.removeItem('admin_token')
    localStorage.removeItem('admin_user')
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }

  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data
}

export const api = {
  login: (email: string, password: string) =>
    request('/admin/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  dashboard: () => request('/admin/dashboard'),
  dashboardCharts: () => request('/admin/dashboard/charts'),

  users: (page = 1, search = '', role = '') =>
    request(`/admin/users?page=${page}&search=${encodeURIComponent(search)}&role=${role}`),
  userDetail: (id: string) => request(`/admin/users/${id}`),
  updateUser: (id: string, data: Record<string, any>) =>
    request(`/admin/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  analyses: (page = 1, search = '', status = '') =>
    request(`/admin/analyses?page=${page}&search=${encodeURIComponent(search)}&status=${status}`),
  analysisDetail: (id: string) => request(`/admin/analyses/${id}`),

  transactions: (page = 1, type = '', userId = '') =>
    request(`/admin/transactions?page=${page}&type=${type}&userId=${userId}`),

  grantCredits: (userId: string, amount: number, description: string) =>
    request('/admin/credits/grant', { method: 'POST', body: JSON.stringify({ userId, amount, description }) }),

  featured: () => request('/admin/featured'),
  addFeatured: (data: Record<string, any>) =>
    request('/admin/featured', { method: 'POST', body: JSON.stringify(data) }),
  updateFeatured: (id: string, data: Record<string, any>) =>
    request(`/admin/featured/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  removeFeatured: (id: string) =>
    request(`/admin/featured/${id}`, { method: 'DELETE' }),

  settings: () => request('/admin/settings'),
}
