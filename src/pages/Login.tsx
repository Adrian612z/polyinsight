import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { ArrowRight, Loader2 } from 'lucide-react'
import type { User as SupabaseUser, Session } from '@supabase/supabase-js'
import { Logo } from '../components/Logo'

// Mock admin user ID
export const ADMIN_USER_ID = '00000000-0000-0000-0000-000000000000'

export const Login: React.FC = () => {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const { setSession, setUser } = useAuthStore()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      if (username === 'admin' && password === 'admin') {
        // Mock successful login
        const mockUser: SupabaseUser = {
          id: ADMIN_USER_ID,
          email: 'admin@polyinsight.com',
          role: 'authenticated',
          app_metadata: {},
          user_metadata: {},
          aud: 'authenticated',
          created_at: new Date().toISOString()
        }

        const mockSession: Session = {
          access_token: 'mock-token',
          token_type: 'bearer',
          expires_in: 3600,
          refresh_token: 'mock-refresh',
          user: mockUser
        }

        setSession(mockSession)
        setUser(mockUser)
        navigate('/analyze')
      } else {
        throw new Error('Invalid credentials')
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Login failed'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex font-sans bg-warm-white">
      {/* Left Decoration - Minimalist */}
      <div className="hidden lg:flex lg:w-1/2 bg-charcoal p-16 flex-col justify-between relative overflow-hidden text-sand">
        <div className="relative z-10">
            {/* Logo in light mode for dark background */}
            <div className={`font-serif font-bold text-2xl tracking-tight text-sand flex items-center gap-2`}>
              <span className="text-terracotta text-3xl leading-none">P</span>
              <span>olyInsight</span>
            </div>
        </div>

        <div className="relative z-10 max-w-lg space-y-8">
          <h1 className="font-serif text-5xl font-medium leading-tight">
            See beyond the <br /> market noise.
          </h1>
          <p className="text-lg text-sand/80 font-light leading-relaxed">
            AI-driven analysis for Polymarket events. <br/>
            Clean insights, zero distractions.
          </p>
        </div>

        <div className="relative z-10 text-sand/40 text-sm font-mono">
          © 2026 PolyInsight
        </div>
      </div>

      {/* Right Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-warm-white">
        <div className="w-full max-w-sm space-y-8">
          {/* Mobile Logo */}
          <div className="lg:hidden mb-8">
            <Logo />
          </div>

          <div className="space-y-2">
            <h2 className="font-serif text-3xl text-charcoal">Welcome back</h2>
            <p className="text-charcoal/60">Please enter your details to sign in.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-4">
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-charcoal/80 mb-2">
                  Username
                </label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  required
                  className="block w-full px-4 py-3 bg-white border border-charcoal/10 rounded-lg text-charcoal placeholder-charcoal/30 focus:outline-none focus:ring-1 focus:ring-terracotta focus:border-terracotta transition-colors"
                  placeholder="Enter your username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-charcoal/80 mb-2">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  className="block w-full px-4 py-3 bg-white border border-charcoal/10 rounded-lg text-charcoal placeholder-charcoal/30 focus:outline-none focus:ring-1 focus:ring-terracotta focus:border-terracotta transition-colors"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            {error && (
              <div className="text-terracotta text-sm bg-terracotta/5 p-3 rounded border border-terracotta/20 animate-shake">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-terracotta hover:bg-[#C05638] text-white font-medium rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-terracotta disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center group"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin -ml-1 mr-2 h-5 w-5" />
                  Processing...
                </>
              ) : (
                <>
                  Sign in <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>
            
            <div className="text-center text-xs text-charcoal/40 mt-8">
              Demo Account: <span className="font-mono text-charcoal/60">admin / admin</span>
            </div>
        </div>
      </div>
    </div>
  )
}

