import React from 'react'
import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useAnalysisStore } from '../store/analysisStore'
import { supabase } from '../lib/supabase'
import { LogOut, LayoutDashboard, History } from 'lucide-react' // Removed unused icons
import clsx from 'clsx'
import { Logo } from './Logo' // Import new Logo
import { AnimatedBackground } from './AnimatedBackground'

export const Layout: React.FC = () => {
  const { session, signOut } = useAuthStore()
  const { reset } = useAnalysisStore()
  const navigate = useNavigate()
  const location = useLocation()

  const handleLogout = async () => {
    reset()
    signOut()
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
    <AnimatedBackground>
    <div className="min-h-screen flex flex-col font-sans">
      <header className="sticky top-0 z-40 bg-warm-white/90 border-b border-charcoal/5">
        <div className="container mx-auto px-6 py-4 flex justify-between items-center">
          {/* Logo */}
          <Link to="/analyze" className="hover:opacity-80 transition-opacity">
            <Logo />
          </Link>

          {/* Navigation */}
          <nav className="flex items-center gap-6">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = location.pathname === item.path
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={clsx(
                    'flex items-center gap-2 text-sm font-medium transition-colors duration-200',
                    isActive
                      ? 'text-terracotta'
                      : 'text-charcoal/60 hover:text-charcoal'
                  )}
                >
                  <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
                  <span>{item.label}</span>
                </Link>
              )
            })}

            <div className="w-px h-5 bg-charcoal/10 mx-2" />

            <button
              onClick={handleLogout}
              className="flex items-center gap-2 text-sm font-medium text-charcoal/60 hover:text-terracotta transition-colors duration-200"
            >
              <LogOut size={18} />
              <span>Sign Out</span>
            </button>
          </nav>
        </div>
      </header>

      <main className="flex-grow container mx-auto px-6 py-12">
        <Outlet />
      </main>

      <footer className="py-8 border-t border-charcoal/5 mt-auto">
        <div className="container mx-auto px-6 text-center text-charcoal/40 text-xs font-serif">
          © {new Date().getFullYear()} PolyInsight. Analysis for the curious mind.
        </div>
      </footer>
    </div>
    </AnimatedBackground>
  )
}

