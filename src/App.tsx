import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import { Login } from './pages/Login'
import { Layout } from './components/Layout'
import { Analyze } from './pages/Analyze'
import { History } from './pages/History'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastProvider } from './components/Toast'

function App() {
  const { session } = useAuthStore()

  return (
    <ErrorBoundary>
    <ToastProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={!session ? <Login /> : <Navigate to="/analyze" />} />
        
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/analyze" />} />
          <Route 
            path="/analyze" 
            element={session ? <Analyze /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/history" 
            element={session ? <History /> : <Navigate to="/login" />} 
          />
        </Route>
      </Routes>
    </BrowserRouter>
    </ToastProvider>
    </ErrorBoundary>
  )
}

export default App
