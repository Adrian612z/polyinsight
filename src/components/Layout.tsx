import React from 'react'
import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { supabase } from '../lib/supabase'
import { LogOut, LayoutDashboard, History, User as UserIcon } from 'lucide-react'
import clsx from 'clsx'

export const Layout: React.FC = () => {
  const { session, signOut } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()

  const handleLogout = async () => {
    // Clear local state via store
    signOut()
    // Clear supabase session
    await supabase.auth.signOut()
    navigate('/login')
  }

  const navItems = [
    { label: 'Analyze', path: '/analyze', icon: LayoutDashboard },
    { label: 'History', path: '/history', icon: History },
  ]

  if (!session) {
    return <Outlet />
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-blue-900 text-white shadow-md">
        <div className="container mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <span className="text-xl font-bold tracking-tight">PolyInsight</span>
          </div>
          
          <nav className="flex items-center space-x-6">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = location.pathname === item.path
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={clsx(
                    "flex items-center space-x-1 px-3 py-2 rounded-md transition-colors",
                    isActive 
                      ? "bg-blue-800 text-white" 
                      : "text-blue-100 hover:bg-blue-800 hover:text-white"
                  )}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                </Link>
              )
            })}
            
            <button
              onClick={handleLogout}
              className="flex items-center space-x-1 px-3 py-2 rounded-md text-blue-100 hover:bg-blue-800 hover:text-white transition-colors"
            >
              <LogOut size={18} />
              <span>Logout</span>
            </button>
          </nav>
        </div>
      </header>

      <main className="flex-grow container mx-auto px-4 py-8">
        <Outlet />
      </main>

      <footer className="bg-gray-100 py-6 border-t border-gray-200">
        <div className="container mx-auto px-4 text-center text-gray-500 text-sm">
          &copy; {new Date().getFullYear()} PolyInsight. All rights reserved.
        </div>
      </footer>
    </div>
  )
}
