import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

interface AuthState {
  privyUserId: string | null
  displayName: string | null
  creditBalance: number
  referralCode: string | null
  role: string | null
  setPrivyUser: (userId: string, displayName: string | null) => void
  setCreditBalance: (balance: number) => void
  setUserInfo: (info: { creditBalance: number; referralCode: string | null; role: string | null }) => void
  signOut: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      privyUserId: null,
      displayName: null,
      creditBalance: 0,
      referralCode: null,
      role: null,
      setPrivyUser: (privyUserId, displayName) => set({ privyUserId, displayName }),
      setCreditBalance: (creditBalance) => set({ creditBalance }),
      setUserInfo: (info) => set({
        creditBalance: info.creditBalance,
        referralCode: info.referralCode,
        role: info.role,
      }),
      signOut: () => set({
        privyUserId: null, displayName: null,
        creditBalance: 0, referralCode: null, role: null,
      }),
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
)
