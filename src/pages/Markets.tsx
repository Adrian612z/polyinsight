import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Star, Loader, RefreshCw, ExternalLink, X } from 'lucide-react'
import { api } from '../lib/backend'

interface MarketData {
  question: string
  outcomes: string[]
  prices: number[]
  volume: number
  spread: number
}

interface MarketEvent {
  slug: string
  title: string
  image: string
  category: string
  url: string
  volume: number
  volume24hr: number
  liquidity: number
  endDate: string
  featured: boolean
  markets: MarketData[]
}

function formatUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(0).toLocaleString()}M`
  if (value >= 1_000) return `$${Math.round(value).toLocaleString()}`
  return `$${value.toFixed(0)}`
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function getTimeRemaining(dateStr: string): string {
  if (!dateStr) return ''
  const now = Date.now()
  const end = new Date(dateStr).getTime()
  const diff = end - now
  if (diff <= 0) return 'Ended'
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days > 0) return `${days} Days Remaining`
  const hours = Math.floor(diff / (1000 * 60 * 60))
  return `${hours}h Remaining`
}

function getPrimaryPrice(markets: MarketData[]): number | null {
  if (markets.length === 0 || markets[0].prices.length === 0) return null
  return markets[0].prices[0]
}

const EventDetailPanel: React.FC<{ event: MarketEvent; onClose: () => void }> = ({ event, onClose }) => {
  const { t } = useTranslation()

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      {/* Panel */}
      <div className="fixed top-0 right-0 h-full w-[420px] max-w-full z-50 shadow-2xl overflow-y-auto animate-slide-in-right" style={{ background: 'var(--bg)' }}>
        {/* Header */}
        <div className="sticky top-0 border-b px-5 py-4 flex items-start justify-between gap-3" style={{ background: 'var(--bg)', borderColor: 'var(--line)' }}>
          <div className="flex items-center gap-3 min-w-0">
            {event.image ? (
              <img src={event.image} alt="" className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-charcoal/8 flex-shrink-0" />
            )}
            <div className="min-w-0">
              <h2 className="text-base font-bold leading-tight" style={{ color: 'var(--ink)' }}>{event.title}</h2>
              <div className="flex items-center gap-2 mt-1">
                {event.category && (
                  <span className="text-[10px] font-semibold rounded px-1.5 py-0.5" style={{ color: 'var(--ink-soft)', background: 'var(--surface)' }}>
                    {event.category}
                  </span>
                )}
                {event.featured && (
                  <Star size={11} className="text-amber-500" fill="currentColor" />
                )}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg transition flex-shrink-0" style={{ color: 'var(--ink-soft)' }}>
            <X size={18} />
          </button>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-px mx-5 mt-4 rounded-xl overflow-hidden" style={{ background: 'var(--line)' }}>
          <div className="p-3" style={{ background: 'var(--surface-strong)' }}>
            <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--ink-soft)' }}>{t('markets.col.volume')}</div>
            <div className="text-sm font-bold mt-0.5" style={{ color: 'var(--ink)' }}>{formatUsd(event.volume)}</div>
          </div>
          <div className="p-3" style={{ background: 'var(--surface-strong)' }}>
            <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--ink-soft)' }}>{t('markets.col.liquidity')}</div>
            <div className="text-sm font-bold text-emerald-600 mt-0.5">{formatUsd(event.liquidity)}</div>
          </div>
          <div className="p-3" style={{ background: 'var(--surface-strong)' }}>
            <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--ink-soft)' }}>{t('markets.col.vol24h')}</div>
            <div className="text-sm font-bold mt-0.5" style={{ color: 'var(--ink)' }}>{formatUsd(event.volume24hr)}</div>
          </div>
          <div className="p-3" style={{ background: 'var(--surface-strong)' }}>
            <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--ink-soft)' }}>{t('markets.col.endDate')}</div>
            <div className="text-sm font-bold mt-0.5" style={{ color: 'var(--ink)' }}>{event.endDate ? formatDate(event.endDate) : '-'}</div>
          </div>
        </div>

        {/* Time remaining */}
        {event.endDate && getTimeRemaining(event.endDate) && (
          <div className="mx-5 mt-3 text-xs text-center" style={{ color: 'var(--ink-soft)' }}>
            {getTimeRemaining(event.endDate)}
          </div>
        )}

        {/* Markets / Outcomes */}
        <div className="px-5 mt-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--ink-soft)' }}>
            {t('markets.detail.outcomes')}
          </h3>
          <div className="space-y-3">
            {event.markets.map((market, idx) => (
              <div key={idx} className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--line)' }}>
                {event.markets.length > 1 && (
                  <div className="px-3 pt-2.5 pb-1 text-xs font-semibold" style={{ color: 'var(--ink)' }}>{market.question}</div>
                )}
                <div className="px-3 pb-3 pt-1.5 space-y-2">
                  {market.outcomes.map((outcome, oi) => {
                    const price = market.prices[oi] ?? 0
                    const pct = Math.round(price * 100)
                    const isYes = oi === 0
                    const barColor = isYes ? 'bg-emerald-500' : 'bg-rose-400'
                    return (
                      <div key={oi}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{outcome}</span>
                          <span className={`text-sm font-bold ${isYes ? 'text-emerald-600' : 'text-rose-500'}`}>
                            {pct}%
                          </span>
                        </div>
                        <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--line)' }}>
                          <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
                  {market.volume > 0 && (
                    <div className="flex items-center justify-between pt-1 text-[10px]" style={{ color: 'var(--ink-soft)' }}>
                      <span>{t('markets.col.volume')}: {formatUsd(market.volume)}</span>
                      <span>{t('markets.col.spread')}: {market.spread.toFixed(2)}%</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* View on Polymarket link */}
        <div className="px-5 py-5 mt-2">
          <a
            href={`https://polymarket.com/event/${event.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition"
          >
            {t('markets.detail.viewOnPolymarket')}
            <ExternalLink size={14} />
          </a>
        </div>
      </div>
    </>
  )
}

export const Markets: React.FC = () => {
  const { t } = useTranslation()
  const [events, setEvents] = useState<MarketEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<MarketEvent | null>(null)

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.getMarkets(30)
      setEvents(data.events || [])
    } catch {
      setError(t('markets.error'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  return (
    <div className="max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-charcoal">{t('markets.title')}</h1>
          <p className="text-sm text-charcoal/50 mt-1">{t('markets.subtitle')}</p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="theme-surface-button inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          {t('markets.refresh')}
        </button>
      </div>

      {/* Loading */}
      {loading && events.length === 0 && (
        <div className="flex items-center justify-center py-20 text-charcoal/40">
          <Loader size={20} className="animate-spin mr-3" />
          {t('markets.loading')}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="text-center py-16 text-charcoal/50"><p>{error}</p></div>
      )}

      {/* Table */}
      {events.length > 0 && (
        <div className="workspace-frame rounded-2xl overflow-hidden overflow-x-auto">
          {/* Header row */}
          <div className="min-w-[1100px]">
            <div className="grid grid-cols-[minmax(340px,2fr)_90px_120px_140px_120px_160px_80px] gap-3 px-5 py-3 border-b border-charcoal/8 text-[11px] font-semibold uppercase tracking-wider text-charcoal/40">
              <div>{t('markets.col.event')}</div>
              <div className="text-right">{t('markets.col.probability')}</div>
              <div className="text-right">{t('markets.col.volume')}</div>
              <div className="text-right">{t('markets.col.liquidity')}</div>
              <div className="text-right">{t('markets.col.vol24h')}</div>
              <div className="text-right">{t('markets.col.endDate')}</div>
              <div className="text-center">{t('markets.col.spread')}</div>
            </div>

            {/* Rows */}
            {events.map((event) => {
              const price = getPrimaryPrice(event.markets)
              const remaining = getTimeRemaining(event.endDate)
              const spread = event.markets[0]?.spread ?? 0

              return (
                <div
                  key={event.slug}
                  onClick={() => setSelectedEvent(event)}
                  className="grid grid-cols-[minmax(340px,2fr)_90px_120px_140px_120px_160px_80px] gap-3 px-5 py-3.5 border-b border-charcoal/5 hover:bg-charcoal/[0.02] transition-colors items-center group cursor-pointer"
                >
                  {/* Event info */}
                  <div className="flex items-center gap-3 min-w-0">
                    {event.image ? (
                      <img
                        src={event.image}
                        alt=""
                        className="w-9 h-9 rounded-lg object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-lg bg-charcoal/8 flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {event.featured && (
                          <Star size={12} className="text-amber-500 flex-shrink-0" fill="currentColor" />
                        )}
                        <span className="text-sm font-semibold text-charcoal truncate group-hover:text-indigo-600 transition-colors">
                          {event.title}
                        </span>
                        <ExternalLink size={12} className="text-charcoal/20 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {event.category && (
                          <span className="text-[10px] font-semibold text-charcoal/45 bg-charcoal/5 rounded px-1.5 py-0.5">
                            {event.category}
                          </span>
                        )}
                        {remaining && (
                          <span className="text-[10px] text-charcoal/35">{remaining}</span>
                        )}
                        {event.featured && (
                          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600/70">
                            Featured
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Probability */}
                  <div className="text-right">
                    {price !== null ? (
                      <span className="text-sm font-semibold text-charcoal">
                        {(price * 100).toFixed(price >= 0.995 ? 2 : 1)}%
                      </span>
                    ) : (
                      <span className="text-sm text-charcoal/30">-</span>
                    )}
                  </div>

                  {/* Volume */}
                  <div className="text-right text-sm text-charcoal/70">
                    {formatUsd(event.volume)}
                  </div>

                  {/* Liquidity */}
                  <div className="text-right text-sm font-medium text-emerald-600">
                    {formatUsd(event.liquidity)}
                  </div>

                  {/* 24h Volume */}
                  <div className="text-right text-sm text-charcoal/60">
                    {formatUsd(event.volume24hr)}
                  </div>

                  {/* End Date */}
                  <div className="text-right text-xs text-charcoal/50">
                    {formatDate(event.endDate)}
                  </div>

                  {/* Spread */}
                  <div className="text-center">
                    <span className="text-xs text-charcoal/45">
                      {spread.toFixed(2)}%
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && events.length === 0 && (
        <div className="text-center py-16 text-charcoal/50">{t('markets.empty')}</div>
      )}

      {/* Detail Panel */}
      {selectedEvent && (
        <EventDetailPanel event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      )}
    </div>
  )
}
