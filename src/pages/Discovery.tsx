import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { usePrivy } from '@privy-io/react-auth'
import { useTranslation } from 'react-i18next'
import { ArrowRight, TrendingUp, Zap, Search, ExternalLink, ChevronRight } from 'lucide-react'
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
  image: string
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
  const { t, i18n } = useTranslation()
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
        <header className="sticky top-0 z-40 bg-warm-white/90 border-b border-charcoal/5 backdrop-blur-sm animate-fade-in">
          <div className="container mx-auto px-6 py-4 flex justify-between items-center">
            <Logo />
            <nav className="flex items-center gap-4">
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
              {authenticated ? (
                <Link
                  to="/analyze"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-terracotta hover:bg-[#C05638] text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {t('discovery.nav.goToDashboard')}
                  <ArrowRight className="w-4 h-4" />
                </Link>
              ) : (
                <button
                  onClick={login}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-terracotta hover:bg-[#C05638] text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {t('discovery.nav.signIn')}
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </nav>
          </div>
        </header>

        {/* Hero Section */}
        <section className="py-20 md:py-28">
          <div className="container mx-auto px-6 text-center max-w-3xl">
            <div className="animate-fade-in-up inline-flex items-center gap-2 px-3 py-1.5 bg-terracotta/10 rounded-full text-terracotta text-sm font-medium mb-6">
              <Zap className="w-4 h-4" />
              {t('discovery.hero.badge')}
            </div>
            <h1 className="animate-fade-in-up animate-delay-100 text-4xl md:text-5xl lg:text-6xl font-serif text-charcoal leading-tight mb-6">
              {t('discovery.hero.title1')}
              <br />
              <span className="text-terracotta">{t('discovery.hero.title2')}</span>
            </h1>
            <p className="animate-fade-in-up animate-delay-200 text-lg text-charcoal/60 font-light max-w-xl mx-auto mb-10">
              {t('discovery.hero.subtitle')}
            </p>

            {/* Quick Analyze Input */}
            <div className="animate-fade-in-up animate-delay-300 max-w-xl mx-auto">
              <button
                onClick={() => authenticated ? navigate('/analyze') : login()}
                className="w-full group flex items-center gap-3 px-6 py-4 bg-white border border-charcoal/10 rounded-lg text-left hover:border-terracotta/30 hover:shadow-sm transition-all"
              >
                <Search className="w-5 h-5 text-charcoal/30" />
                <span className="flex-1 text-charcoal/40">{t('discovery.hero.placeholder')}</span>
                <span className="px-3 py-1 bg-terracotta text-white text-sm font-medium rounded-md group-hover:bg-[#C05638] transition-colors">
                  {t('discovery.hero.analyzeBtn')}
                </span>
              </button>
              <p className="text-xs text-charcoal/40 mt-2">
                {t('discovery.hero.freeCredits')}
              </p>
            </div>
          </div>
        </section>

        {/* Trending Events */}
        <section className="pb-20">
          <div className="container mx-auto px-6">
            <div className="animate-fade-in-up animate-delay-400 flex items-center gap-3 mb-8">
              <TrendingUp className="w-5 h-5 text-terracotta" />
              <h2 className="text-2xl font-serif text-charcoal">{t('discovery.trending.title')}</h2>
            </div>

            {/* Cards Grid */}
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="stagger-card bg-white border border-charcoal/5 rounded-xl p-6">
                    <div className="flex items-start gap-3 mb-4">
                      <div className="w-10 h-10 bg-charcoal/5 rounded-lg animate-pulse" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-charcoal/5 rounded w-3/4 animate-pulse" />
                        <div className="h-4 bg-charcoal/5 rounded w-1/2 animate-pulse" />
                      </div>
                    </div>
                    <div className="space-y-2 mb-4">
                      <div className="h-8 bg-charcoal/5 rounded animate-pulse" />
                      <div className="h-8 bg-charcoal/5 rounded animate-pulse" />
                    </div>
                    <div className="h-4 bg-charcoal/5 rounded w-1/3 animate-pulse" />
                  </div>
                ))}
              </div>
            ) : events.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-charcoal/40 text-lg">{t('discovery.trending.empty')}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {events.map((event) => (
                  <div key={event.slug} className="stagger-card">
                    <EventCard
                      event={event}
                      onAnalyze={() => handleAnalyze(event.url)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-16 border-t border-charcoal/5">
          <div className="container mx-auto px-6 text-center animate-fade-in-up animate-delay-500">
            <h2 className="text-2xl font-serif text-charcoal mb-4">
              {t('discovery.cta.title')}
            </h2>
            <p className="text-charcoal/60 mb-8 max-w-md mx-auto">
              {t('discovery.cta.subtitle')}
            </p>
            <button
              onClick={() => authenticated ? navigate('/analyze') : login()}
              className="inline-flex items-center gap-2 px-6 py-3 bg-terracotta hover:bg-[#C05638] text-white font-medium rounded-lg transition-all hover:scale-105 active:scale-95"
            >
              {t('discovery.cta.button')}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-8 border-t border-charcoal/5 mt-auto">
          <div className="container mx-auto px-6 text-center text-charcoal/40 text-xs font-serif">
            &copy; {new Date().getFullYear()} {t('layout.footer')}
          </div>
        </footer>
      </div>
    </AnimatedBackground>
  )
}

/** Extract a short label from a market question for multi-market events */
function shortLabel(question: string): string {
  const q = question.replace(/\?$/, '')
  // Price targets like "$120", "$200"
  const priceMatch = q.match(/\$[\d,.]+/)
  // Date like "March 14", "by March 31"
  const dateMatch = q.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}/i)
  if (priceMatch) return priceMatch[0]
  if (dateMatch) return dateMatch[0]
  // For long questions, try to get the unique part
  const cleaned = q
    .replace(/^Will\s+/i, '')
    .replace(/^the\s+/i, '')
    .replace(/^there\s+be\s+/i, '')
  if (cleaned.length > 35) return cleaned.slice(0, 33) + '...'
  return cleaned
}

const EventCard: React.FC<{ event: TrendingEvent; onAnalyze: () => void }> = ({ event, onAnalyze }) => {
  const { t } = useTranslation()
  // Take first 2 markets (same order as Polymarket)
  const topMarkets = event.markets.slice(0, 2)

  const isSingleMarket = event.markets.length === 1
  const singleMarket = isSingleMarket ? event.markets[0] : null
  const yesProb = singleMarket ? Math.round(singleMarket.prices[0] * 100) : null

  return (
    <div className="bg-white border border-charcoal/5 rounded-xl p-5 hover:shadow-md hover:border-charcoal/10 card-hover flex flex-col">
      {/* Header: Image + Title */}
      <div className="flex items-start gap-3 mb-3">
        {event.image && (
          <img
            src={event.image}
            alt=""
            className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
          />
        )}
        <h3 className="text-sm font-medium text-charcoal leading-snug line-clamp-2">
          {event.title}
        </h3>
      </div>

      {/* Market Display */}
      <div className="flex-1 mb-4">
        {isSingleMarket && singleMarket ? (
          /* Single binary market: big probability + Yes/No pills */
          <div>
            <div className="flex items-baseline gap-2 mb-3">
              <span className="text-2xl font-semibold text-charcoal">{yesProb}%</span>
              <span className="text-xs text-charcoal/40">{t('discovery.trending.chance')}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="text-center py-1.5 rounded-lg bg-emerald-50 text-emerald-600 text-xs font-medium">
                Yes
              </div>
              <div className="text-center py-1.5 rounded-lg bg-red-50 text-red-500 text-xs font-medium">
                No
              </div>
            </div>
          </div>
        ) : (
          /* Multi-market: top 1-2 with label + probability + Yes/No */
          <div className="space-y-2.5">
            {topMarkets.map((m, idx) => {
              const prob = Math.round(m.prices[0] * 100)
              const label = shortLabel(m.question)
              return (
                <div key={idx} className="flex items-center justify-between gap-2">
                  <span className="text-xs text-charcoal/70 truncate flex-1" title={m.question}>
                    {label}
                  </span>
                  <span className="text-xs font-semibold text-charcoal whitespace-nowrap">
                    {prob}%
                  </span>
                  <div className="flex gap-1 ml-1">
                    <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-600">
                      Yes
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-red-50 text-red-500">
                      No
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Footer: Volume + Actions */}
      <div className="flex items-center justify-between pt-3 border-t border-charcoal/5">
        <span className="text-[11px] text-charcoal/40">
          {formatVolume(event.volume)} {t('discovery.trending.vol')}
        </span>
        <div className="flex gap-1.5">
          <button
            onClick={onAnalyze}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-terracotta hover:bg-[#C05638] rounded-lg transition-colors"
          >
            {t('discovery.trending.aiAnalysis')}
            <ChevronRight className="w-3 h-3" />
          </button>
          <a
            href={event.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center px-2 py-1.5 text-xs text-charcoal/40 hover:text-charcoal bg-charcoal/5 hover:bg-charcoal/10 rounded-lg transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  )
}
