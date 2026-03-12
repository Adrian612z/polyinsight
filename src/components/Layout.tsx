import React, { useState, useRef, useEffect } from 'react'
import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { usePrivy } from '@privy-io/react-auth'
import { useWallets } from '@privy-io/react-auth'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../store/authStore'
import { useAnalysisStore } from '../store/analysisStore'
import { LogOut, LayoutDashboard, History, Coins, Compass, User, Shield } from 'lucide-react'
import clsx from 'clsx'
import { Logo } from './Logo'
import { AnimatedBackground } from './AnimatedBackground'
import { AddCreditsModal } from './AddCreditsModal'

export const Layout: React.FC = () => {
  const { authenticated, logout } = usePrivy()
  const { wallets } = useWallets()
  const { t, i18n } = useTranslation()
  const { displayName, creditBalance, role, signOut } = useAuthStore()
  const { reset, stopAllPolling } = useAnalysisStore()
  const activeCount = useAnalysisStore((s) => Object.values(s.sessions).filter(ss => ss.status === 'polling').length)
  const navigate = useNavigate()
  const location = useLocation()
  const [profileOpen, setProfileOpen] = useState(false)
  const [addCreditsOpen, setAddCreditsOpen] = useState(false)
  const profileRef = useRef<HTMLDivElement>(null)

  const embeddedWallet = wallets.find((w) => w.walletClientType === 'privy')
  const walletAddress = embeddedWallet?.address ?? ''

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleLogout = async () => {
    stopAllPolling()
    reset()
    signOut()
    await logout()
    navigate('/')
  }

  const navItems = [
    { label: t('layout.nav.discover'), path: '/', icon: Compass },
    { label: t('layout.nav.analyze'), path: '/analyze', icon: LayoutDashboard },
    { label: t('layout.nav.history'), path: '/history', icon: History },
  ]

  if (!authenticated) {
    return <Outlet />
  }

  return (
    <AnimatedBackground>
    <div className="min-h-screen flex flex-col font-sans">
      <header className="sticky top-0 z-40 bg-warm-white/90 border-b border-charcoal/5">
        <div className="container mx-auto px-6 py-4 flex justify-between items-center">
          <Link to="/analyze" className="hover:opacity-80 transition-opacity">
            <Logo />
          </Link>

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
                  {item.path === '/analyze' && activeCount > 0 && (
                    <span className="ml-0.5 text-[10px] bg-terracotta text-white rounded-full px-1.5 py-0.5 leading-none font-semibold animate-pulse">
                      {activeCount}
                    </span>
                  )}
                </Link>
              )
            })}

            <button
              onClick={() => {
                const newLang = i18n.language === 'zh' ? 'en' : 'zh'
                i18n.changeLanguage(newLang)
                localStorage.setItem('polyinsight-lang', newLang)
              }}
              className="text-xs font-medium text-charcoal/50 hover:text-charcoal transition-colors px-2 py-1 rounded hover:bg-charcoal/5"
            >
              {i18n.language === 'zh' ? 'EN' : '中文'}
            </button>

            <div className="w-px h-5 bg-charcoal/10 mx-2" />

            <div ref={profileRef} className="relative">
              <button
                onClick={() => setProfileOpen((o) => !o)}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-terracotta/5 hover:bg-terracotta/10 rounded-full transition-colors"
              >
                <Coins size={14} className="text-terracotta" />
                <span className="text-xs font-mono font-semibold text-terracotta">
                  {(creditBalance / 100).toFixed(2)}
                </span>
              </button>

              {profileOpen && (
                <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-charcoal/10 rounded-xl shadow-lg z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-charcoal/5">
                    <div className="text-sm font-medium text-charcoal truncate">{displayName}</div>
                    <div className="flex items-center gap-1.5 mt-1 text-charcoal/50 text-xs">
                      <Coins size={12} className="text-terracotta" />
                      <span>{Math.round(creditBalance / 100)} credits</span>
                    </div>
                  </div>
                  <div className="px-3 py-2.5">
                    <button
                      onClick={() => { setProfileOpen(false); setAddCreditsOpen(true) }}
                      className="w-full py-2 bg-charcoal hover:bg-charcoal/80 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      Add Credits
                    </button>
                  </div>
                </div>
              )}
            </div>

            {role === 'admin' && (
              <Link
                to="/admin"
                className={clsx(
                  'flex items-center gap-1.5 text-sm font-medium transition-colors duration-200',
                  location.pathname.startsWith('/admin')
                    ? 'text-terracotta'
                    : 'text-charcoal/60 hover:text-charcoal'
                )}
              >
                <Shield size={16} />
                <span>{t('layout.nav.admin')}</span>
              </Link>
            )}

            {displayName && (
              <Link
                to="/profile"
                className="flex items-center gap-1.5 text-charcoal/50 hover:text-charcoal transition-colors"
              >
                <User size={16} />
                <span className="text-xs font-mono max-w-[140px] truncate">
                  {displayName}
                </span>
              </Link>
            )}

            <button
              onClick={handleLogout}
              className="flex items-center gap-2 text-sm font-medium text-charcoal/60 hover:text-terracotta transition-colors duration-200"
            >
              <LogOut size={18} />
              <span>{t('layout.nav.signOut')}</span>
            </button>
          </nav>
        </div>
      </header>

      <main className="flex-grow container mx-auto px-6 py-12">
        <Outlet />
      </main>

      {addCreditsOpen && (
        <AddCreditsModal
          walletAddress={walletAddress}
          username={displayName || undefined}
          onClose={() => setAddCreditsOpen(false)}
        />
      )}

      <footer className="py-8 border-t border-charcoal/5 mt-auto">
        <div className="container mx-auto px-6 text-center text-charcoal/40 text-xs font-serif">
          &copy; {new Date().getFullYear()} {t('layout.footer')}
        </div>
      </footer>
    </div>
    </AnimatedBackground>
  )
}
