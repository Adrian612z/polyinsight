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

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem('admin_token'),
  user: JSON.parse(localStorage.getItem('admin_user') || 'null'),
  isLoggedIn: !!localStorage.getItem('admin_token'),

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
