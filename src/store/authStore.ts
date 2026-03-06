import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

interface AuthState {
  privyUserId: string | null
  displayName: string | null
  setPrivyUser: (userId: string, displayName: string | null) => void
  signOut: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      privyUserId: null,
      displayName: null,
      setPrivyUser: (privyUserId, displayName) => set({ privyUserId, displayName }),
      signOut: () => set({ privyUserId: null, displayName: null }),
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
)
