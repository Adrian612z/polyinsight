import { lazy, Suspense, useEffect, useRef, type ComponentType, type ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { usePrivy } from '@privy-io/react-auth'
import { useAuthStore } from './store/authStore'
import { api, setPrivyToken } from './lib/backend'
import { primeWorkspaceCaches } from './lib/pageCache'
import { Discovery } from './pages/Discovery'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastProvider } from './components/Toast'

function lazyNamed<T extends Record<string, unknown>, K extends keyof T & string>(
  loader: () => Promise<T>,
  key: K,
) {
  return lazy(async () => {
    const module = await loader()
    return { default: module[key] as ComponentType }
  })
}

const Layout = lazyNamed(() => import('./components/Layout'), 'Layout')
const Analyze = lazyNamed(() => import('./pages/Analyze'), 'Analyze')
const History = lazyNamed(() => import('./pages/History'), 'History')
const Profile = lazyNamed(() => import('./pages/Profile'), 'Profile')
const AdminLayout = lazyNamed(() => import('./pages/admin/AdminLayout'), 'AdminLayout')
const AdminDashboard = lazyNamed(() => import('./pages/admin/Dashboard'), 'AdminDashboard')
const AdminUsers = lazyNamed(() => import('./pages/admin/Users'), 'AdminUsers')
const AdminAnalyses = lazyNamed(() => import('./pages/admin/Analyses'), 'AdminAnalyses')

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
            void primeWorkspaceCaches(user.id)
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
          <ScrollToTop />
          <Routes>
            <Route path="/" element={<Discovery />} />

            <Route element={<RouteSuspense><Layout /></RouteSuspense>}>
              <Route
                path="/analyze"
                element={authenticated ? <RouteSuspense><Analyze /></RouteSuspense> : <Navigate to="/" />}
              />
              <Route
                path="/history"
                element={authenticated ? <RouteSuspense><History /></RouteSuspense> : <Navigate to="/" />}
              />
              <Route
                path="/profile"
                element={authenticated ? <RouteSuspense><Profile /></RouteSuspense> : <Navigate to="/" />}
              />
              <Route
                path="/admin"
                element={authenticated ? <RouteSuspense><AdminLayout /></RouteSuspense> : <Navigate to="/" />}
              >
                <Route index element={<RouteSuspense><AdminDashboard /></RouteSuspense>} />
                <Route path="users" element={<RouteSuspense><AdminUsers /></RouteSuspense>} />
                <Route path="analyses" element={<RouteSuspense><AdminAnalyses /></RouteSuspense>} />
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </ErrorBoundary>
  )
}

function RouteSuspense({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={(
        <div className="min-h-screen flex items-center justify-center bg-warm-white">
          <div className="text-charcoal/45 text-sm">Loading...</div>
        </div>
      )}
    >
      {children}
    </Suspense>
  )
}

function ScrollToTop() {
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [pathname])

  return null
}

export default App
