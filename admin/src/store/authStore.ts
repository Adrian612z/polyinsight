import { create } from 'zustand'

interface AdminUser {
  id: string
  email: string
  display_name: string | null
}

interface AuthState {
  token: string | null
  user: AdminUser | null
  isLoggedIn: boolean
  login: (token: string, user: AdminUser) => void
  logout: () => void
}

function readStoredUser(): AdminUser | null {
  const raw = localStorage.getItem('admin_user')
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<AdminUser> | null
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Invalid admin user payload')
    }

    return {
      id: typeof parsed.id === 'string' ? parsed.id : '',
      email: typeof parsed.email === 'string' ? parsed.email : '',
      display_name: typeof parsed.display_name === 'string' ? parsed.display_name : null,
    }
  } catch {
    localStorage.removeItem('admin_user')
    localStorage.removeItem('admin_token')
    return null
  }
}

const storedToken = localStorage.getItem('admin_token')
const storedUser = readStoredUser()

export const useAuthStore = create<AuthState>((set) => ({
  token: storedToken,
  user: storedUser,
  isLoggedIn: Boolean(storedToken && storedUser),

  login: (token, user) => {
    localStorage.setItem('admin_token', token)
    localStorage.setItem('admin_user', JSON.stringify(user))
    set({ token, user, isLoggedIn: true })
  },

  logout: () => {
    localStorage.removeItem('admin_token')
    localStorage.removeItem('admin_user')
    set({ token: null, user: null, isLoggedIn: false })
  },
}))
