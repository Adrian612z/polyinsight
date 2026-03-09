import { useEffect, useRef } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { usePrivy } from '@privy-io/react-auth'
import { useAuthStore } from './store/authStore'
import { api, setPrivyToken } from './lib/backend'
import { Layout } from './components/Layout'
import { Analyze } from './pages/Analyze'
import { History } from './pages/History'
import { Discovery } from './pages/Discovery'
import { Profile } from './pages/Profile'
import { AdminLayout } from './pages/admin/AdminLayout'
import { AdminDashboard } from './pages/admin/Dashboard'
import { AdminUsers } from './pages/admin/Users'
import { AdminAnalyses } from './pages/admin/Analyses'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastProvider } from './components/Toast'

function App() {
  const { ready, authenticated, user, getAccessToken } = usePrivy()
  const { setPrivyUser, setUserInfo, signOut } = useAuthStore()
  const registeredRef = useRef(false)

  // Capture referral code from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const ref = params.get('ref')
    if (ref) {
      localStorage.setItem('polyinsight_ref', ref)
      // Clean URL
      const url = new URL(window.location.href)
      url.searchParams.delete('ref')
      window.history.replaceState({}, '', url.pathname + url.search)
    }
  }, [])

  // Sync Privy auth state to Zustand store + register with backend
  useEffect(() => {
    if (!ready) return
    if (authenticated && user) {
      const display = user.email?.address
        || user.google?.email
        || (user.wallet?.address ? user.wallet.address.slice(0, 6) + '...' + user.wallet.address.slice(-4) : null)
      setPrivyUser(user.id, display)

      // Register with backend (once per session)
      if (!registeredRef.current) {
        registeredRef.current = true
        const referralCode = localStorage.getItem('polyinsight_ref') || undefined
        getAccessToken().then((token) => {
          if (token) setPrivyToken(token)
          return api.register({
            email: user.email?.address || user.google?.email || undefined,
            displayName: display || undefined,
            referralCode,
          })
        }).then((res) => {
          if (res.user) {
            setUserInfo({
              creditBalance: res.user.credit_balance,
              referralCode: res.user.referral_code,
              role: res.user.role,
            })
          }
          if (referralCode) localStorage.removeItem('polyinsight_ref')
        }).catch((err) => {
          console.error('Backend register failed:', err)
        })
      }
    } else {
      registeredRef.current = false
      signOut()
    }
  }, [ready, authenticated, user, setPrivyUser, setUserInfo, signOut, getAccessToken])

  // Show nothing while Privy is loading
  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-warm-white">
        <div className="text-charcoal/40 text-sm">Loading...</div>
      </div>
    )
  }

  return (
    <ErrorBoundary>
    <ToastProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Discovery />} />

        <Route element={<Layout />}>
          <Route
            path="/analyze"
            element={authenticated ? <Analyze /> : <Navigate to="/" />}
          />
          <Route
            path="/history"
            element={authenticated ? <History /> : <Navigate to="/" />}
          />
          <Route
            path="/profile"
            element={authenticated ? <Profile /> : <Navigate to="/" />}
          />
          <Route
            path="/admin"
            element={authenticated ? <AdminLayout /> : <Navigate to="/" />}
          >
            <Route index element={<AdminDashboard />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="analyses" element={<AdminAnalyses />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
    </ToastProvider>
    </ErrorBoundary>
  )
}

export default App
