import { lazy, Suspense, useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { usePrivy } from '@privy-io/react-auth'
import { useAuthStore } from './store/authStore'
import { api, setPrivyToken } from './lib/backend'
import { primeWorkspaceCaches } from './lib/pageCache'
import { clearStoredReferralCode, getStoredReferralCode, getTrackingSessionId, initializeTracking } from './lib/tracking'
import { Discovery } from './pages/Discovery'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ReferralAuthModal } from './components/ReferralAuthModal'
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
const Markets = lazyNamed(() => import('./pages/Markets'), 'Markets')

function App() {
  const { ready, authenticated, user, getAccessToken } = usePrivy()
  const { setPrivyUser, setUserInfo, signOut } = useAuthStore()
  const registeredRef = useRef(false)
  const [referralPromptOpen, setReferralPromptOpen] = useState(false)

  const resumePendingAnalysis = () => {
    const pendingUrl = sessionStorage.getItem('polyinsight-pending-url')
    if (!pendingUrl) return
    if (window.location.pathname === '/analyze') return
    window.location.assign('/analyze')
  }

  useEffect(() => {
    void initializeTracking().catch((err) => {
      console.error('Tracking initialization failed:', err)
    })
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
        const referralCode = getStoredReferralCode() || undefined
        const trackingSessionId = getTrackingSessionId()
        getAccessToken().then((token) => {
          if (token) setPrivyToken(token)
          return api.register({
            email: user.email?.address || user.google?.email || undefined,
            displayName: display || undefined,
            referralCode,
            trackingSessionId,
          })
        }).then((res) => {
          if (res.user) {
            setUserInfo({
              creditBalance: res.user.credit_balance,
              referralCode: res.user.referral_code,
              displayName: res.user.display_name || display || null,
            })
            void primeWorkspaceCaches(user.id)
          }
          if (referralCode) clearStoredReferralCode()
          if (res.isNew && !res.user?.referred_by) {
            setReferralPromptOpen(true)
            return
          }
          setReferralPromptOpen(false)
          resumePendingAnalysis()
        }).catch((err) => {
          console.error('Backend register failed:', err)
        })
      }
    } else {
      registeredRef.current = false
      setReferralPromptOpen(false)
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
            <Route path="/markets" element={<RouteSuspense><Markets /></RouteSuspense>} />

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
            </Route>
            <Route path="/admin/*" element={<Navigate to="/" replace />} />
          </Routes>
          <ReferralAuthModal
            isOpen={referralPromptOpen}
            onClose={() => {
              setReferralPromptOpen(false)
              resumePendingAnalysis()
            }}
            onContinue={async (referralCode) => {
              if (referralCode) {
                await api.applyReferralCode(referralCode)
              }
              setReferralPromptOpen(false)
              resumePendingAnalysis()
            }}
          />
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
