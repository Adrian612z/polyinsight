import React, { Suspense, lazy } from 'react'
import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../store/authStore'
import { useAnalysisStore } from '../store/analysisStore'
import { LogOut, LayoutDashboard, History, Coins, Compass, User, Plus, Languages } from 'lucide-react'
import clsx from 'clsx'
import { Logo } from './Logo'
import { AnimatedBackground } from './AnimatedBackground'
import { ThemeToggle } from './ThemeToggle'

const AddCreditsModal = lazy(async () => {
  const module = await import('./AddCreditsModal')
  return { default: module.AddCreditsModal }
})

export const Layout: React.FC = () => {
  const { authenticated, logout } = usePrivy()
  const { wallets } = useWallets()
  const { t, i18n } = useTranslation()
  const { displayName, creditBalance, signOut } = useAuthStore()
  const { reset, stopAllPolling } = useAnalysisStore()
  const activeCount = useAnalysisStore((s) => Object.values(s.sessions).filter(ss => ss.status === 'polling').length)
  const navigate = useNavigate()
  const location = useLocation()
  const [addCreditsOpen, setAddCreditsOpen] = React.useState(false)

  const embeddedWallet = wallets.find((w) => w.walletClientType === 'privy')
  const walletAddress = embeddedWallet?.address ?? ''

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
        <header className="sticky top-0 z-40 border-b border-charcoal/10 bg-warm-white/78 backdrop-blur-2xl">
          <div className="container px-5 py-4 md:px-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex items-center justify-between gap-4">
                <Link to="/analyze" className="hover:opacity-90 transition-opacity">
                  <Logo />
                </Link>

                <div className="flex items-center gap-2 xl:hidden">
                  <ThemeToggle isZh={i18n.language === 'zh'} compact />
                  <button
                    onClick={() => {
                      const newLang = i18n.language === 'zh' ? 'en' : 'zh'
                      i18n.changeLanguage(newLang)
                      localStorage.setItem('polyinsight-lang', newLang)
                    }}
                    className="theme-surface-button inline-flex h-10 w-10 items-center justify-center rounded-full transition"
                    aria-label="Switch language"
                  >
                    <Languages size={16} />
                  </button>
                  <button
                    onClick={handleLogout}
                    className="theme-surface-button inline-flex h-10 w-10 items-center justify-center rounded-full transition hover:text-terracotta"
                    aria-label={t('layout.nav.signOut')}
                  >
                    <LogOut size={16} />
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-end">
                <nav className="no-scrollbar flex items-center gap-2 overflow-x-auto rounded-full border border-charcoal/10 bg-warm-white/68 p-1 shadow-[0_18px_40px_rgba(108,128,156,0.08)] backdrop-blur-xl">
                  {navItems.map((item) => {
                    const Icon = item.icon
                    const isActive = location.pathname === item.path
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        className={clsx(
                          'flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200',
                          isActive
                            ? 'theme-contrast-button'
                            : 'text-charcoal/65 hover:bg-warm-white hover:text-charcoal'
                        )}
                      >
                        <Icon size={16} strokeWidth={isActive ? 2.4 : 2} />
                        <span>{item.label}</span>
                        {item.path === '/analyze' && activeCount > 0 && (
                          <span className="rounded-full bg-terracotta px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                            {activeCount}
                          </span>
                        )}
                      </Link>
                    )
                  })}
                </nav>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <ThemeToggle isZh={i18n.language === 'zh'} />
                  <button
                    onClick={() => {
                      const newLang = i18n.language === 'zh' ? 'en' : 'zh'
                      i18n.changeLanguage(newLang)
                      localStorage.setItem('polyinsight-lang', newLang)
                    }}
                    className="theme-surface-button hidden xl:inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold transition"
                  >
                    <Languages size={15} />
                    <span>{i18n.language === 'zh' ? 'EN' : '中文'}</span>
                  </button>

                  <button
                    onClick={() => navigate('/profile')}
                    className="metric-chip inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold text-charcoal transition hover:border-charcoal/20"
                  >
                    <Coins size={15} className="text-terracotta" />
                    <span>{(creditBalance / 100).toFixed(2)}</span>
                  </button>

                  <button
                    onClick={() => setAddCreditsOpen(true)}
                    className="theme-accent-button inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition"
                  >
                    <Plus size={15} />
                    <span>{i18n.language === 'zh' ? '充值' : 'Add Credits'}</span>
                  </button>

                  {displayName && (
                    <Link
                      to="/profile"
                      className="theme-surface-button inline-flex max-w-[220px] items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold transition"
                    >
                      <User size={15} />
                      <span className="truncate">{displayName}</span>
                    </Link>
                  )}

                  <button
                    onClick={handleLogout}
                    className="theme-surface-button hidden xl:inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold transition hover:text-terracotta"
                  >
                    <LogOut size={15} />
                    <span>{t('layout.nav.signOut')}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-grow container px-5 py-8 md:px-6 md:py-10">
          <Outlet />
        </main>

        {addCreditsOpen && (
          <Suspense fallback={null}>
            <AddCreditsModal
              walletAddress={walletAddress}
              onClose={() => setAddCreditsOpen(false)}
            />
          </Suspense>
        )}

        <footer className="mt-auto border-t border-charcoal/10 py-8">
          <div className="container px-5 md:px-6">
            <div className="tech-panel rounded-[28px] px-5 py-4 text-center text-xs font-semibold uppercase tracking-[0.28em] text-charcoal/42">
              {t('layout.footer')}
            </div>
          </div>
        </footer>
      </div>
    </AnimatedBackground>
  )
}
