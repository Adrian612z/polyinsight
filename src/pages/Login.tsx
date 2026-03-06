import React from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { ArrowRight } from 'lucide-react'
import { Logo } from '../components/Logo'

export const Login: React.FC = () => {
  const { login } = usePrivy()

  return (
    <div className="min-h-screen flex font-sans bg-warm-white">
      {/* Left Decoration */}
      <div className="hidden lg:flex lg:w-1/2 bg-charcoal p-16 flex-col justify-between relative overflow-hidden text-sand">
        <div className="relative z-10">
          <div className="font-serif font-bold text-2xl tracking-tight text-sand flex items-center gap-2">
            <span className="text-terracotta text-3xl leading-none">P</span>
            <span>olyInsight</span>
          </div>
        </div>

        <div className="relative z-10 max-w-lg space-y-8">
          <h1 className="font-serif text-5xl font-medium leading-tight">
            See beyond the <br /> market noise.
          </h1>
          <p className="text-lg text-sand/80 font-light leading-relaxed">
            AI-driven analysis for Polymarket events. <br />
            Clean insights, zero distractions.
          </p>
        </div>

        <div className="relative z-10 text-sand/40 text-sm font-mono">
          &copy; {new Date().getFullYear()} PolyInsight
        </div>
      </div>

      {/* Right Login */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-warm-white">
        <div className="w-full max-w-sm space-y-8">
          {/* Mobile Logo */}
          <div className="lg:hidden mb-8">
            <Logo />
          </div>

          <div className="space-y-2">
            <h2 className="font-serif text-3xl text-charcoal">Get started</h2>
            <p className="text-charcoal/60">
              Sign in with your email, Google account, or connect a wallet.
            </p>
          </div>

          <button
            onClick={login}
            className="w-full py-3 px-4 bg-terracotta hover:bg-[#C05638] text-white font-medium rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-terracotta transition-all duration-200 flex items-center justify-center group"
          >
            Sign in
            <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
          </button>

          <div className="text-center text-xs text-charcoal/40 mt-8">
            Supports email, Google, MetaMask, WalletConnect & more
          </div>
        </div>
      </div>
    </div>
  )
}
