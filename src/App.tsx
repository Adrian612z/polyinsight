import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { usePrivy } from '@privy-io/react-auth'
import { useAuthStore } from './store/authStore'
import { Login } from './pages/Login'
import { Layout } from './components/Layout'
import { Analyze } from './pages/Analyze'
import { History } from './pages/History'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastProvider } from './components/Toast'

function App() {
  const { ready, authenticated, user } = usePrivy()
  const { setPrivyUser, signOut } = useAuthStore()

  // Sync Privy auth state to Zustand store
  useEffect(() => {
    if (!ready) return
    if (authenticated && user) {
      const display = user.email?.address
        || user.google?.email
        || user.wallet?.address?.slice(0, 6) + '...' + user.wallet?.address?.slice(-4)
        || null
      setPrivyUser(user.id, display)
    } else {
      signOut()
    }
  }, [ready, authenticated, user, setPrivyUser, signOut])

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
        <Route path="/login" element={!authenticated ? <Login /> : <Navigate to="/analyze" />} />

        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/analyze" />} />
          <Route
            path="/analyze"
            element={authenticated ? <Analyze /> : <Navigate to="/login" />}
          />
          <Route
            path="/history"
            element={authenticated ? <History /> : <Navigate to="/login" />}
          />
        </Route>
      </Routes>
    </BrowserRouter>
    </ToastProvider>
    </ErrorBoundary>
  )
}

export default App
