import React from 'react'
import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { supabase } from '../lib/supabase'
import { LogOut, LayoutDashboard, History, TrendingUp, Moon, Sun } from 'lucide-react'
import clsx from 'clsx'
import { useTheme } from '../hooks/useTheme'
import { AnimatedBackground } from './AnimatedBackground'

export const Layout: React.FC = () => {
  const { session, signOut } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const { isDark, toggleTheme } = useTheme()

  const handleLogout = async () => {
    signOut()
    await supabase.auth.signOut()
    navigate('/login')
  }

  const navItems = [
    { label: '分析', path: '/analyze', icon: LayoutDashboard },
    { label: '历史', path: '/history', icon: History },
  ]

  if (!session) {
    return <Outlet />
  }

  return (
    <AnimatedBackground>
    <div className="min-h-screen flex flex-col">
      <header className="bg-white/70 dark:bg-gray-800/70 border-b border-gray-100/50 dark:border-gray-700/50 sticky top-0 z-40 backdrop-blur-md">
        <div className="container mx-auto px-4 py-3 flex justify-between items-center">
          {/* Logo */}
          <Link to="/analyze" className="flex items-center space-x-3 group">
            <div className="w-9 h-9 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-xl flex items-center justify-center transition-transform group-hover:scale-105">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
              PolyInsight
            </span>
          </Link>

          {/* Navigation */}
          <nav className="flex items-center space-x-2">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = location.pathname === item.path
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={clsx(
                    'flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200',
                    isActive
                      ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'
                  )}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                </Link>
              )
            })}

            <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-2" />

            {/* 主题切换按钮 */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-200"
              title={isDark ? '切换到亮色模式' : '切换到暗色模式'}
            >
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            <button
              onClick={handleLogout}
              className="flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 transition-all duration-200"
            >
              <LogOut size={18} />
              <span>退出</span>
            </button>
          </nav>
        </div>
      </header>

      <main className="flex-grow container mx-auto px-4 py-8">
        <Outlet />
      </main>

      <footer className="bg-white/70 dark:bg-gray-800/70 py-6 border-t border-gray-100/50 dark:border-gray-700/50 backdrop-blur-md">
        <div className="container mx-auto px-4 text-center text-gray-400 dark:text-gray-500 text-sm">
          © {new Date().getFullYear()} PolyInsight. All rights reserved.
        </div>
      </footer>
    </div>
    </AnimatedBackground>
  )
}
