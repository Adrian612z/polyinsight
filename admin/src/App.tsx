import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Growth from './pages/Growth'
import Users from './pages/Users'
import UserDetail from './pages/UserDetail'
import Analyses from './pages/Analyses'
import AnalysisDetail from './pages/AnalysisDetail'
import Transactions from './pages/Transactions'
import Featured from './pages/Featured'
import Settings from './pages/Settings'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn)
  return isLoggedIn ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="growth" element={<Growth />} />
        <Route path="users" element={<Users />} />
        <Route path="users/:id" element={<UserDetail />} />
        <Route path="analyses" element={<Analyses />} />
        <Route path="analyses/:id" element={<AnalysisDetail />} />
        <Route path="transactions" element={<Transactions />} />
        <Route path="featured" element={<Featured />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  )
}
