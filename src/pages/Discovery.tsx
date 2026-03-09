import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { usePrivy } from '@privy-io/react-auth'
import { ArrowRight, TrendingUp, Zap, Search, ExternalLink, ChevronRight, BarChart3 } from 'lucide-react'
import { api } from '../lib/backend'
import { Logo } from '../components/Logo'
import { AnimatedBackground } from '../components/AnimatedBackground'

interface TrendingMarket {
  question: string
  outcomes: string[]
  prices: number[]
  volume: number
}

interface TrendingEvent {
  slug: string
  title: string
  url: string
  volume: number
  volume24hr: number
  endDate: string
  markets: TrendingMarket[]
}

function formatVolume(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`
  return `$${v.toFixed(0)}`
}

export const Discovery: React.FC = () => {
  const { authenticated, login } = usePrivy()
  const navigate = useNavigate()
  const [events, setEvents] = useState<TrendingEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getTrending(12)
      .then((data) => {
        setEvents(data?.events || [])
      })
      .catch((err) => {
        console.error('Failed to load trending:', err)
        setEvents([])
      })
      .finally(() => setLoading(false))
  }, [])

  const handleAnalyze = (url: string) => {
    if (authenticated) {
      navigate('/analyze', { state: { prefillUrl: url } })
    } else {
      login()
    }
  }

  return (
    <AnimatedBackground>
      <div className="min-h-screen flex flex-col font-sans">
        {/* Navbar */}
        <header className="sticky top-0 z-40 bg-warm-white/90 border-b border-charcoal/5 backdrop-blur-sm">
          <div className="container mx-auto px-6 py-4 flex justify-between items-center">
            <Logo />
            <nav className="flex items-center gap-4">
              {authenticated ? (
                <Link
                  to="/analyze"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-terracotta hover:bg-[#C05638] text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Go to Dashboard
                  <ArrowRight className="w-4 h-4" />
                </Link>
              ) : (
                <button
                  onClick={login}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-terracotta hover:bg-[#C05638] text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Sign In
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </nav>
          </div>
        </header>

        {/* Hero Section */}
        <section className="py-20 md:py-28">
          <div className="container mx-auto px-6 text-center max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-terracotta/10 rounded-full text-terracotta text-sm font-medium mb-6">
              <Zap className="w-4 h-4" />
              AI-Powered Prediction Market Analysis
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-serif text-charcoal leading-tight mb-6">
              Discover Mispriced
              <br />
              <span className="text-terracotta">Opportunities</span>
            </h1>
            <p className="text-lg text-charcoal/60 font-light max-w-xl mx-auto mb-10">
              Our AI continuously scans Polymarket events, comparing market prices against
              independent probability estimates to find edges.
            </p>

            {/* Quick Analyze Input */}
            <div className="max-w-xl mx-auto">
              <button
                onClick={() => authenticated ? navigate('/analyze') : login()}
                className="w-full group flex items-center gap-3 px-6 py-4 bg-white border border-charcoal/10 rounded-lg text-left hover:border-terracotta/30 hover:shadow-sm transition-all"
              >
                <Search className="w-5 h-5 text-charcoal/30" />
                <span className="flex-1 text-charcoal/40">Paste a Polymarket URL to analyze...</span>
                <span className="px-3 py-1 bg-terracotta text-white text-sm font-medium rounded-md group-hover:bg-[#C05638] transition-colors">
                  Analyze
                </span>
              </button>
              <p className="text-xs text-charcoal/40 mt-2">
                3 free analysis credits for new users
              </p>
            </div>
          </div>
        </section>

        {/* Trending Events */}
        <section className="pb-20">
          <div className="container mx-auto px-6">
            <div className="flex items-center gap-3 mb-8">
              <TrendingUp className="w-5 h-5 text-terracotta" />
              <h2 className="text-2xl font-serif text-charcoal">Trending on Polymarket</h2>
            </div>

            {/* Cards Grid */}
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="bg-white border border-charcoal/5 rounded-xl p-6 animate-pulse">
                    <div className="h-5 bg-charcoal/5 rounded w-3/4 mb-4" />
                    <div className="space-y-2 mb-4">
                      <div className="h-8 bg-charcoal/5 rounded" />
                      <div className="h-8 bg-charcoal/5 rounded" />
                    </div>
                    <div className="h-4 bg-charcoal/5 rounded w-1/2" />
                  </div>
                ))}
              </div>
            ) : events.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-charcoal/40 text-lg">Unable to load trending events. Try again later.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {events.map((event) => (
                  <EventCard
                    key={event.slug}
                    event={event}
                    onAnalyze={() => handleAnalyze(event.url)}
                  />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-16 border-t border-charcoal/5">
          <div className="container mx-auto px-6 text-center">
            <h2 className="text-2xl font-serif text-charcoal mb-4">
              Ready to find your edge?
            </h2>
            <p className="text-charcoal/60 mb-8 max-w-md mx-auto">
              Sign up for free and get 3 analysis credits to start discovering mispriced markets.
            </p>
            <button
              onClick={() => authenticated ? navigate('/analyze') : login()}
              className="inline-flex items-center gap-2 px-6 py-3 bg-terracotta hover:bg-[#C05638] text-white font-medium rounded-lg transition-colors"
            >
              Get Started Free
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-8 border-t border-charcoal/5 mt-auto">
          <div className="container mx-auto px-6 text-center text-charcoal/40 text-xs font-serif">
            &copy; {new Date().getFullYear()} PolyInsight. Analysis for the curious mind.
          </div>
        </footer>
      </div>
    </AnimatedBackground>
  )
}

const EventCard: React.FC<{ event: TrendingEvent; onAnalyze: () => void }> = ({ event, onAnalyze }) => {
  // Show up to 3 markets with their outcomes and prices
  const topMarkets = event.markets.slice(0, 3)

  return (
    <div className="bg-white border border-charcoal/5 rounded-xl p-6 hover:shadow-md hover:border-charcoal/10 transition-all">
      {/* Title */}
      <h3 className="text-sm font-serif font-medium text-charcoal leading-snug line-clamp-2 mb-3">
        {event.title}
      </h3>

      {/* Volume Stats */}
      <div className="flex items-center gap-3 mb-4 text-xs text-charcoal/50">
        <div className="flex items-center gap-1">
          <BarChart3 className="w-3.5 h-3.5" />
          <span>Vol: <span className="font-mono font-medium text-charcoal/70">{formatVolume(event.volume)}</span></span>
        </div>
        <div>
          24h: <span className="font-mono font-medium text-charcoal/70">{formatVolume(event.volume24hr)}</span>
        </div>
      </div>

      {/* Market Outcomes */}
      {topMarkets.length > 0 && (
        <div className="space-y-1.5 mb-4">
          {topMarkets.map((m, idx) => (
            <div key={idx} className="bg-warm-white rounded-lg px-3 py-2">
              {m.outcomes.length > 0 && (
                <div className="flex items-center justify-between text-xs">
                  {m.outcomes.slice(0, 2).map((outcome, oi) => (
                    <div key={oi} className="flex items-center gap-1.5">
                      <span className="text-charcoal/60 truncate max-w-[100px]">{outcome}</span>
                      <span className="font-mono font-semibold text-charcoal">
                        {m.prices[oi] != null ? `${Math.round(m.prices[oi] * 100)}¢` : '-'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* End Date */}
      {event.endDate && (
        <p className="text-[11px] text-charcoal/40 mb-4">
          Ends: {new Date(event.endDate).toLocaleDateString()}
        </p>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={onAnalyze}
          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-terracotta hover:bg-[#C05638] rounded-lg transition-colors"
        >
          AI Analysis
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
        <a
          href={event.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center px-3 py-2 text-xs text-charcoal/50 hover:text-charcoal bg-charcoal/5 hover:bg-charcoal/10 rounded-lg transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  )
}
