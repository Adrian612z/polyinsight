import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { usePrivy } from '@privy-io/react-auth'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import {
  Activity,
  ArrowRight,
  Coins,
  ExternalLink,
  Languages,
  Search,
  TrendingUp,
  X,
} from 'lucide-react'
import { api } from '../lib/backend'
import { Logo } from '../components/Logo'
import { ReferralAuthModal } from '../components/ReferralAuthModal'
import { ThemeToggle } from '../components/ThemeToggle'
import { useTheme } from '../lib/theme'

type MarketCategory =
  | 'trending'
  | 'breaking'
  | 'new'
  | 'sports'
  | 'politics'
  | 'iran'
  | 'crypto'
  | 'finance'
  | 'geopolitics'
  | 'tech'
  | 'culture'
  | 'economy'
  | 'weather'
  | 'mentions'
  | 'elections'
type MarketSort = 'volume24hr' | 'volume' | 'liquidity' | 'expires'

interface MarketTerminalRow {
  marketSlug: string
  eventSlug: string
  eventTitle: string
  question: string
  image: string
  category: Exclude<MarketCategory, 'trending' | 'breaking' | 'new'> | 'other'
  endDate: string
  remainingLabel: string
  outcomes: string[]
  prices: number[]
  primaryProbability: number | null
  liquidity: number | null
  volume: number | null
  volume24hr: number | null
  description: string
  resolutionSource: string
  competitive: number | null
  polymarketUrl: string
  analysisUrl: string
}

interface MarketTerminalDetail extends MarketTerminalRow {}

interface MarketListResponse {
  items: MarketTerminalRow[]
  page: number
  pageSize: number
  total: number
  totalPages: number
  category: string
  q: string
  sort: MarketSort
  degraded: boolean
  fetchedAt: string | null
}

const CATEGORY_TABS: Array<{ key: MarketCategory; labelKey: string }> = [
  { key: 'trending', labelKey: 'markets.category.trending' },
  { key: 'breaking', labelKey: 'markets.category.breaking' },
  { key: 'new', labelKey: 'markets.category.new' },
  { key: 'politics', labelKey: 'markets.category.politics' },
  { key: 'sports', labelKey: 'markets.category.sports' },
  { key: 'crypto', labelKey: 'markets.category.crypto' },
  { key: 'iran', labelKey: 'markets.category.iran' },
  { key: 'finance', labelKey: 'markets.category.finance' },
  { key: 'geopolitics', labelKey: 'markets.category.geopolitics' },
  { key: 'tech', labelKey: 'markets.category.tech' },
  { key: 'culture', labelKey: 'markets.category.culture' },
  { key: 'economy', labelKey: 'markets.category.economy' },
  { key: 'weather', labelKey: 'markets.category.weather' },
  { key: 'mentions', labelKey: 'markets.category.mentions' },
  { key: 'elections', labelKey: 'markets.category.elections' },
]

const SORT_OPTIONS: Array<{ key: MarketSort; labelKey: string }> = [
  { key: 'volume24hr', labelKey: 'markets.sort.volume24hr' },
  { key: 'volume', labelKey: 'markets.sort.volume' },
  { key: 'liquidity', labelKey: 'markets.sort.liquidity' },
  { key: 'expires', labelKey: 'markets.sort.expires' },
]

function isMarketCategory(value: string | null): value is MarketCategory {
  return value === 'trending'
    || value === 'breaking'
    || value === 'new'
    || value === 'sports'
    || value === 'politics'
    || value === 'iran'
    || value === 'crypto'
    || value === 'finance'
    || value === 'geopolitics'
    || value === 'tech'
    || value === 'culture'
    || value === 'economy'
    || value === 'weather'
    || value === 'mentions'
    || value === 'elections'
}

function isMarketSort(value: string | null): value is MarketSort {
  return value === 'volume24hr'
    || value === 'volume'
    || value === 'liquidity'
    || value === 'expires'
}

function formatMoney(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—'
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`
  return `$${value.toFixed(0)}`
}

function formatPercent(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—'
  const rounded = Math.round(value * 10) / 10
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`
}

function formatDateTime(value: string, locale: string): string {
  const date = Date.parse(value)
  if (!Number.isFinite(date)) return '—'
  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function formatRemainingLabel(endDate: string, isZh: boolean, fallback: string): string {
  const expiry = Date.parse(endDate)
  if (!Number.isFinite(expiry)) return fallback

  const diffMs = expiry - Date.now()
  if (diffMs <= 0) return isZh ? '已过期' : 'Expired'

  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 60) return isZh ? `${Math.max(minutes, 1)} 分钟后结束` : `${Math.max(minutes, 1)}m remaining`

  const hours = Math.floor(diffMs / 3_600_000)
  if (hours < 48) return isZh ? `${hours} 小时后结束` : `${hours}h remaining`

  const days = Math.floor(diffMs / 86_400_000)
  return isZh ? `${days} 天后结束` : `${days}d remaining`
}

function getOutcomeRows(market: MarketTerminalDetail | MarketTerminalRow) {
  const limit = Math.min(market.outcomes.length, market.prices.length)
  const items = Array.from({ length: limit }, (_, index) => ({
    label: market.outcomes[index],
    probability: market.prices[index],
  })).filter((item) => typeof item.label === 'string' && typeof item.probability === 'number')

  const hasBinary = items.length === 2
  if (hasBinary) {
    return items
  }

  return items.sort((left, right) => right.probability - left.probability).slice(0, 4)
}

function getCategoryText(category: MarketTerminalRow['category'], isZh: boolean): string {
  switch (category) {
    case 'sports':
      return isZh ? '体育' : 'Sports'
    case 'politics':
      return isZh ? '政治' : 'Politics'
    case 'iran':
      return isZh ? '伊朗' : 'Iran'
    case 'crypto':
      return isZh ? '加密' : 'Crypto'
    case 'finance':
      return isZh ? '金融' : 'Finance'
    case 'geopolitics':
      return isZh ? '地缘政治' : 'Geopolitics'
    case 'tech':
      return isZh ? '科技' : 'Tech'
    case 'culture':
      return isZh ? '文化' : 'Culture'
    case 'economy':
      return isZh ? '经济' : 'Economy'
    case 'weather':
      return isZh ? '天气' : 'Weather'
    case 'mentions':
      return isZh ? '提及' : 'Mentions'
    case 'elections':
      return isZh ? '选举' : 'Elections'
    default:
      return isZh ? '综合' : 'General'
  }
}

function toDetail(row: MarketTerminalRow): MarketTerminalDetail {
  return {
    ...row,
  }
}

export const Markets: React.FC = () => {
  const { authenticated, login } = usePrivy()
  const { t, i18n } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const { resolvedTheme } = useTheme()
  const isZh = i18n.language === 'zh'
  const isDark = resolvedTheme === 'dark'
  const categoryParam = searchParams.get('category')
  const sortParam = searchParams.get('sort')

  const category = isMarketCategory(categoryParam) ? categoryParam : 'trending'
  const sort: MarketSort = isMarketSort(sortParam) ? sortParam : 'volume24hr'
  const page = Math.max(Number(searchParams.get('page') || 1), 1)
  const pageSize = Math.min(Math.max(Number(searchParams.get('pageSize') || 25), 1), 100)
  const selectedMarketSlug = searchParams.get('market')
  const query = searchParams.get('q') || ''

  const [searchInput, setSearchInput] = useState(query)
  const [listData, setListData] = useState<MarketListResponse | null>(null)
  const [listLoading, setListLoading] = useState(true)
  const [selectedMarket, setSelectedMarket] = useState<MarketTerminalDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [pendingAnalyzeUrl, setPendingAnalyzeUrl] = useState<string | null>(null)

  useEffect(() => {
    setSearchInput(query)
  }, [query])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (searchInput === query) return
      const next = new URLSearchParams(searchParams)
      if (searchInput.trim()) next.set('q', searchInput.trim())
      else next.delete('q')
      next.set('page', '1')
      next.delete('market')
      setSearchParams(next, { replace: true })
    }, 260)

    return () => window.clearTimeout(timeout)
  }, [searchInput, query, searchParams, setSearchParams])

  useEffect(() => {
    let alive = true
    setListLoading(true)

    api.getMarkets({ category, q: query, sort, page, pageSize })
      .then((data) => {
        if (!alive) return
        setListData(data as MarketListResponse)
      })
      .catch((error) => {
        console.error('Failed to load markets:', error)
        if (!alive) return
        setListData({
          items: [],
          page: 1,
          pageSize,
          total: 0,
          totalPages: 1,
          category,
          q: query,
          sort,
          degraded: true,
          fetchedAt: null,
        })
      })
      .finally(() => {
        if (alive) setListLoading(false)
      })

    return () => {
      alive = false
    }
  }, [category, query, sort, page, pageSize])

  useEffect(() => {
    if (!selectedMarketSlug) {
      setSelectedMarket(null)
      return
    }

    let alive = true
    setDetailLoading(true)

    api.getMarket(selectedMarketSlug)
      .then((data) => {
        if (!alive) return
        setSelectedMarket((data as { market: MarketTerminalDetail }).market)
      })
      .catch((error) => {
        console.error('Failed to load market detail:', error)
        if (!alive) return
        const fallback = listData?.items.find((item) => item.marketSlug === selectedMarketSlug)
        setSelectedMarket(fallback ? toDetail(fallback) : null)
      })
      .finally(() => {
        if (alive) setDetailLoading(false)
      })

    return () => {
      alive = false
    }
  }, [selectedMarketSlug, listData])

  useEffect(() => {
    if (!selectedMarketSlug) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        updateParams({ market: null }, true)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedMarketSlug, searchParams, setSearchParams])

  const displayRows = useMemo(() => {
    const items = listData?.items || []
    if (!selectedMarketSlug || !selectedMarket) return items
    if (items.some((item) => item.marketSlug === selectedMarketSlug)) return items
    return [selectedMarket, ...items].slice(0, Math.max(items.length, 1))
  }, [listData, selectedMarket, selectedMarketSlug])

  const selectedInList = displayRows.find((item) => item.marketSlug === selectedMarketSlug) || null
  const detail = selectedMarket || (selectedInList ? toDetail(selectedInList) : null)

  const updateParams = (updates: Record<string, string | null>, replace = false) => {
    const next = new URLSearchParams(searchParams)
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === '') next.delete(key)
      else next.set(key, value)
    }
    setSearchParams(next, { replace })
  }

  const handleAnalyze = (analysisUrl: string) => {
    if (!authenticated) {
      setPendingAnalyzeUrl(analysisUrl)
      setAuthModalOpen(true)
      return
    }

    navigate('/analyze', {
      state: { prefillUrl: analysisUrl },
    })
  }

  const continueLogin = () => {
    if (pendingAnalyzeUrl) {
      sessionStorage.setItem('polyinsight-pending-url', pendingAnalyzeUrl)
    }
    setAuthModalOpen(false)
    setPendingAnalyzeUrl(null)
    login()
  }

  const pageShellClass = isDark
    ? 'min-h-screen bg-[#081018] text-slate-100'
    : 'min-h-screen bg-[#f3f6fb] text-slate-950'

  const headerClass = isDark
    ? 'sticky top-0 z-40 border-b border-white/6 bg-[#081018]/94 backdrop-blur-2xl'
    : 'sticky top-0 z-40 border-b border-slate-900/6 bg-[#f3f6fb]/94 backdrop-blur-2xl'

  const navShellClass = isDark
    ? 'hidden md:flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.03] p-1'
    : 'hidden md:flex items-center gap-2 rounded-full border border-slate-900/8 bg-white/80 p-1 shadow-[0_12px_28px_rgba(15,23,42,0.06)]'

  const discoverLinkClass = isDark
    ? 'rounded-full px-4 py-2 text-sm font-semibold text-slate-400 transition hover:text-white'
    : 'rounded-full px-4 py-2 text-sm font-semibold text-slate-500 transition hover:text-slate-900'

  const activeNavClass = isDark
    ? 'inline-flex rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#081018] shadow-[0_10px_24px_rgba(255,255,255,0.08)]'
    : 'inline-flex rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(15,23,42,0.18)]'

  const languageButtonClass = isDark
    ? 'theme-surface-button inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold transition text-white/84 hover:text-white'
    : 'theme-surface-button inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold transition'

  const shellClass = isDark
    ? 'flex-1 border-t border-white/6 bg-[#0b0f15] text-white'
    : 'flex-1 border-t border-slate-900/6 bg-white text-slate-950'

  const toolbarBorderClass = isDark ? 'border-white/6' : 'border-slate-900/6'
  const titleClass = isDark
    ? 'mt-4 text-3xl font-semibold tracking-[-0.04em] text-white md:text-4xl'
    : 'mt-4 text-3xl font-semibold tracking-[-0.04em] text-slate-950 md:text-4xl'
  const subtitleClass = isDark
    ? 'mt-3 max-w-3xl text-sm leading-7 text-white/62 md:text-base'
    : 'mt-3 max-w-3xl text-sm leading-7 text-slate-600 md:text-base'
  const searchInputClass = isDark
    ? 'h-12 w-full rounded-2xl border border-white/8 bg-white/[0.04] pl-11 pr-4 text-sm text-white outline-none transition focus:border-[#36c6b2]/40 focus:ring-2 focus:ring-[#36c6b2]/12'
    : 'h-12 w-full rounded-2xl border border-slate-900/10 bg-slate-50 pl-11 pr-4 text-sm text-slate-950 outline-none transition focus:border-[#36c6b2]/40 focus:ring-2 focus:ring-[#36c6b2]/12'
  const searchIconClass = isDark ? 'pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35' : 'pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400'
  const activeFilterClass = isDark
    ? 'border-white/12 bg-white/[0.09] text-white'
    : 'border-slate-900/10 bg-slate-900 text-white'
  const idleFilterClass = isDark
    ? 'border-white/8 bg-white/[0.03] text-white/46 hover:text-white/78'
    : 'border-slate-900/8 bg-white text-slate-500 hover:text-slate-950'
  const listToolbarTextClass = isDark ? 'flex items-center gap-2 text-sm text-white/56' : 'flex items-center gap-2 text-sm text-slate-600'
  const degradedClass = isDark
    ? 'rounded-full border border-[#c96a48]/18 bg-[#c96a48]/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#f2b49f]'
    : 'rounded-full border border-[#c96a48]/16 bg-[#c96a48]/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9d553a]'
  const sortLabelShellClass = isDark
    ? 'flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-white/56'
    : 'flex items-center gap-2 rounded-full border border-slate-900/8 bg-slate-900/[0.03] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600'
  const sortSelectClass = isDark
    ? 'h-9 rounded-full border border-white/8 bg-white/[0.03] px-3 text-sm text-white outline-none'
    : 'h-9 rounded-full border border-slate-900/8 bg-white px-3 text-sm text-slate-900 outline-none'
  const tableHeadClass = isDark
    ? 'hidden md:grid grid-cols-[minmax(0,3fr)_0.9fr_1fr_1fr_1fr_1.2fr] gap-4 border-b border-white/6 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/36 md:px-6'
    : 'hidden md:grid grid-cols-[minmax(0,3fr)_0.9fr_1fr_1fr_1fr_1.2fr] gap-4 border-b border-slate-900/6 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 md:px-6'
  const skeletonClass = isDark ? 'h-20 rounded-2xl bg-white/[0.03] animate-pulse' : 'h-20 rounded-2xl bg-slate-900/[0.04] animate-pulse'
  const emptyStateClass = isDark
    ? 'flex min-h-[420px] items-center justify-center px-6 text-center text-sm text-white/48'
    : 'flex min-h-[420px] items-center justify-center px-6 text-center text-sm text-slate-500'
  const rowActiveClass = isDark ? 'bg-white/[0.06]' : 'bg-slate-900/[0.05]'
  const rowIdleClass = isDark ? 'hover:bg-white/[0.03]' : 'hover:bg-slate-900/[0.03]'
  const mobileImageFallbackClass = isDark
    ? 'flex h-11 w-11 items-center justify-center rounded-xl bg-white/[0.05] text-white/40'
    : 'flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900/[0.05] text-slate-400'
  const mobileQuestionClass = isDark ? 'line-clamp-2 text-sm font-semibold text-white' : 'line-clamp-2 text-sm font-semibold text-slate-950'
  const mobileMetaClass = isDark ? 'mt-1 text-xs text-white/42' : 'mt-1 text-xs text-slate-500'
  const mobileCategoryChipClass = isDark
    ? 'rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/46'
    : 'rounded-full border border-slate-900/8 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500'
  const mobileTimeClass = isDark ? 'text-[11px] text-white/42' : 'text-[11px] text-slate-500'
  const mobileLabelClass = isDark ? 'text-[10px] font-semibold uppercase tracking-[0.16em] text-white/34' : 'text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500'
  const mobileValueClass = isDark ? 'mt-1 font-semibold text-white' : 'mt-1 font-semibold text-slate-950'
  const mobileAccentValueClass = isDark ? 'mt-1 font-semibold text-[#36c6b2]' : 'mt-1 font-semibold text-[#158a78]'
  const desktopQuestionClass = isDark ? 'truncate text-[15px] font-semibold text-white' : 'truncate text-[15px] font-semibold text-slate-950'
  const desktopMetaClass = isDark ? 'mt-1 flex flex-wrap items-center gap-2 text-xs text-white/42' : 'mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500'
  const oddsCellClass = isDark ? 'text-sm font-semibold text-white' : 'text-sm font-semibold text-slate-950'
  const statCellClass = isDark ? 'text-sm font-semibold text-white/82' : 'text-sm font-semibold text-slate-700'
  const greenCellClass = isDark ? 'text-sm font-semibold text-[#36c6b2]' : 'text-sm font-semibold text-[#158a78]'
  const expireCellClass = isDark ? 'text-sm font-semibold text-white/72' : 'text-sm font-semibold text-slate-600'
  const footerTextClass = isDark ? 'flex items-center gap-2 text-sm text-white/52' : 'flex items-center gap-2 text-sm text-slate-500'
  const pagerTextClass = isDark ? 'text-sm text-white/52' : 'text-sm text-slate-500'
  return (
    <div className={pageShellClass}>
      <div className="min-h-screen font-sans">
        <header className={headerClass}>
          <div className="px-5 py-4 md:px-6 xl:px-8">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex items-center gap-4">
                <Logo />
                <nav className={navShellClass}>
                  <Link
                    to="/"
                    className={discoverLinkClass}
                  >
                    {t('markets.nav.discover')}
                  </Link>
                  <Link
                    to="/markets"
                    className={activeNavClass}
                  >
                    {t('markets.nav.markets')}
                  </Link>
                </nav>
              </div>

              <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                <ThemeToggle isZh={isZh} />
                <button
                  onClick={() => {
                    const newLang = isZh ? 'en' : 'zh'
                    i18n.changeLanguage(newLang)
                    localStorage.setItem('polyinsight-lang', newLang)
                  }}
                  className={languageButtonClass}
                >
                  <Languages size={15} />
                  <span>{isZh ? 'EN' : '中文'}</span>
                </button>
                {authenticated ? (
                  <Link
                    to="/analyze"
                    className="theme-accent-button inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition"
                  >
                    {t('markets.nav.workspace')}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                ) : (
                  <button
                    onClick={() => {
                      setPendingAnalyzeUrl(null)
                      setAuthModalOpen(true)
                    }}
                    className="theme-accent-button inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition"
                  >
                    {t('markets.nav.signIn')}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </header>

        <main className={shellClass}>
          <div className="px-5 py-6 md:px-6 md:py-8 xl:px-8">
            <div className={clsx('border-b px-0 pb-5 md:pb-6', toolbarBorderClass)}>
              <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
                <div>
                  <h1 className={titleClass}>
                    {t('markets.title')}
                  </h1>
                  <p className={subtitleClass}>
                    {t('markets.subtitle')}
                  </p>
                </div>

                <div className="flex w-full flex-col gap-3 xl:max-w-[36rem]">
                  <div className="relative">
                    <Search className={searchIconClass} />
                    <input
                      type="search"
                      value={searchInput}
                      onChange={(event) => setSearchInput(event.target.value)}
                      placeholder={t('markets.search')}
                      className={searchInputClass}
                    />
                  </div>
                  <div className="no-scrollbar flex items-center gap-2 overflow-x-auto whitespace-nowrap pb-1">
                    {CATEGORY_TABS.map((tab) => (
                      <button
                        key={tab.key}
                        onClick={() => updateParams({ category: tab.key === 'trending' ? null : tab.key, page: '1', market: null })}
                        className={clsx(
                          'rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] transition',
                          category === tab.key
                            ? activeFilterClass
                            : idleFilterClass
                        )}
                      >
                        {t(tab.labelKey)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div
              className={clsx(
                'grid min-h-[720px] transition-all duration-200',
                'xl:grid-cols-1',
                toolbarBorderClass
              )}
            >
              <section className="min-w-0">
                <div className={clsx('flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4 md:px-6', toolbarBorderClass)}>
                  <div className={listToolbarTextClass}>
                    <Activity className="h-4 w-4 text-[#36c6b2]" />
                    <span>{t('markets.pagination.count', { count: listData?.total || 0 })}</span>
                    {listData?.degraded ? (
                      <span className={degradedClass}>
                        {t('markets.table.degradedShort')}
                      </span>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-2">
                    <div className={sortLabelShellClass}>
                      <span>{t(`markets.sort.${sort}`)}</span>
                    </div>
                    <select
                      value={sort}
                      onChange={(event) => updateParams({ sort: event.target.value, page: '1' })}
                      className={sortSelectClass}
                    >
                      {SORT_OPTIONS.map((option) => (
                        <option
                          key={option.key}
                          value={option.key}
                          className={isDark ? 'bg-[#0b0f15] text-white' : 'bg-white text-slate-950'}
                        >
                          {t(option.labelKey)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className={tableHeadClass}>
                  <div>{t('markets.table.market')}</div>
                  <div>{t('markets.table.odds')}</div>
                  <div>{t('markets.table.liquidity')}</div>
                  <div>{t('markets.table.volume')}</div>
                  <div>{t('markets.table.volume24hr')}</div>
                  <div>{t('markets.table.expires')}</div>
                </div>

                <div className="min-h-[520px]">
                  {listLoading ? (
                    <div className="space-y-3 px-5 py-5 md:px-6">
                      {Array.from({ length: 8 }).map((_, index) => (
                        <div key={index} className={skeletonClass} />
                      ))}
                    </div>
                  ) : displayRows.length === 0 ? (
                    <div className={emptyStateClass}>
                      {t('markets.table.empty')}
                    </div>
                  ) : (
                    <div className={clsx('divide-y', isDark ? 'divide-white/[0.05]' : 'divide-slate-900/6')}>
                      {displayRows.map((market) => {
                        const isActive = market.marketSlug === selectedMarketSlug

                        return (
                          <button
                            key={market.marketSlug}
                            onClick={() => updateParams({ market: isActive ? null : market.marketSlug })}
                            className={clsx(
                              'block w-full px-5 py-4 text-left transition md:px-6',
                              isActive
                                ? rowActiveClass
                                : rowIdleClass
                            )}
                          >
                            <div className="md:hidden space-y-3">
                              <div className="flex items-start gap-3">
                                {market.image ? (
                                  <img src={market.image} alt="" className="h-11 w-11 rounded-xl object-cover" />
                                ) : (
                                  <div className={mobileImageFallbackClass}>
                                    <Activity className="h-4 w-4" />
                                  </div>
                                )}
                                <div className="min-w-0 flex-1">
                                  <div className={mobileQuestionClass}>{market.question}</div>
                                  <div className={mobileMetaClass}>{market.eventTitle}</div>
                                  <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <span className={mobileCategoryChipClass}>
                                      {getCategoryText(market.category, isZh)}
                                    </span>
                                    <span className={mobileTimeClass}>
                                      {formatRemainingLabel(market.endDate, isZh, market.remainingLabel)}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <div className="grid grid-cols-3 gap-3 text-sm">
                                <div>
                                  <div className={mobileLabelClass}>{t('markets.table.odds')}</div>
                                  <div className={mobileValueClass}>{formatPercent(market.primaryProbability)}</div>
                                </div>
                                <div>
                                  <div className={mobileLabelClass}>{t('markets.sort.liquidity')}</div>
                                  <div className={mobileValueClass}>{formatMoney(market.liquidity)}</div>
                                </div>
                                <div>
                                  <div className={mobileLabelClass}>{t('markets.sort.volume24hr')}</div>
                                  <div className={mobileAccentValueClass}>{formatMoney(market.volume24hr)}</div>
                                </div>
                              </div>
                            </div>

                            <div className="hidden md:grid grid-cols-[minmax(0,3fr)_0.9fr_1fr_1fr_1fr_1.2fr] gap-4 items-center">
                              <div className="min-w-0">
                                <div className="flex items-start gap-3">
                                  {market.image ? (
                                    <img src={market.image} alt="" className="h-11 w-11 rounded-xl object-cover" />
                                  ) : (
                                    <div className={mobileImageFallbackClass}>
                                      <Activity className="h-4 w-4" />
                                    </div>
                                  )}
                                  <div className="min-w-0">
                                    <div className={desktopQuestionClass}>{market.question}</div>
                                    <div className={desktopMetaClass}>
                                      <span>{market.eventTitle}</span>
                                      <span>•</span>
                                      <span>{getCategoryText(market.category, isZh)}</span>
                                      <span>•</span>
                                      <span>{formatRemainingLabel(market.endDate, isZh, market.remainingLabel)}</span>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <div className={oddsCellClass}>{formatPercent(market.primaryProbability)}</div>
                              <div className={statCellClass}>{formatMoney(market.liquidity)}</div>
                              <div className={greenCellClass}>{formatMoney(market.volume)}</div>
                              <div className={oddsCellClass}>{formatMoney(market.volume24hr)}</div>
                              <div className={expireCellClass}>{formatDateTime(market.endDate, i18n.language)}</div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>

                <div className={clsx('flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4 md:px-6', toolbarBorderClass)}>
                  <div className={footerTextClass}>
                    <span>{t('markets.pagination.rows')}</span>
                    <select
                      value={pageSize}
                      onChange={(event) => updateParams({ pageSize: event.target.value, page: '1' })}
                      className={sortSelectClass}
                    >
                      {[10, 25, 50].map((value) => (
                        <option
                          key={value}
                          value={value}
                          className={isDark ? 'bg-[#0b0f15] text-white' : 'bg-white text-slate-950'}
                        >
                          {value}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className={pagerTextClass}>
                      {t('markets.pagination.page', {
                        page: listData?.page || 1,
                        total: listData?.totalPages || 1,
                      })}
                    </span>
                    <button
                      onClick={() => updateParams({ page: String(Math.max((listData?.page || 1) - 1, 1)) })}
                      disabled={!listData || listData.page <= 1}
                      className="theme-surface-button inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold disabled:opacity-40"
                    >
                      {t('markets.pagination.prev')}
                    </button>
                    <button
                      onClick={() => updateParams({ page: String(Math.min((listData?.page || 1) + 1, listData?.totalPages || 1)) })}
                      disabled={!listData || listData.page >= listData.totalPages}
                      className="theme-surface-button inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold disabled:opacity-40"
                    >
                      {t('markets.pagination.next')}
                    </button>
                  </div>
                </div>
              </section>

            </div>
          </div>
        </main>

        {selectedMarketSlug ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6 xl:p-8">
            <div
              className="animate-fade-in absolute inset-0 bg-black/55 backdrop-blur-sm"
              onClick={() => updateParams({ market: null }, true)}
            />
            <div
              className={clsx(
                'animate-fade-in-up relative z-10 w-full max-w-5xl overflow-hidden rounded-[30px] border shadow-[0_32px_90px_rgba(15,23,42,0.32)]',
                isDark
                  ? 'max-h-[88vh] border-white/10 bg-[#0b0f15] text-white'
                  : 'max-h-[88vh] border-slate-900/10 bg-white text-slate-950'
              )}
            >
              <MarketDetailPanel
                detail={detail}
                isZh={isZh}
                locale={i18n.language}
                loading={detailLoading}
                onAnalyze={handleAnalyze}
                onClear={() => updateParams({ market: null }, true)}
                presentation="modal"
              />
            </div>
          </div>
        ) : null}
      </div>
      <ReferralAuthModal
        isOpen={authModalOpen}
        onClose={() => {
          setAuthModalOpen(false)
          setPendingAnalyzeUrl(null)
        }}
        onContinue={continueLogin}
      />
    </div>
  )
}

const MarketDetailPanel: React.FC<{
  detail: MarketTerminalDetail | null
  isZh: boolean
  locale: string
  loading: boolean
  onAnalyze: (analysisUrl: string) => void
  onClear: () => void
  presentation?: 'inline' | 'modal'
}> = ({ detail, isZh, locale, loading, onAnalyze, onClear, presentation = 'inline' }) => {
  const { t } = useTranslation()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const isModal = presentation === 'modal'

  if (loading && !detail) {
    return (
      <div className={clsx('flex min-h-[360px] flex-1 items-center justify-center p-6 text-sm', isDark ? 'text-white/48' : 'text-slate-500')}>
        {t('progress.status.inProgress')}
      </div>
    )
  }

  if (!detail) {
    return (
      <div className={clsx('flex min-h-[360px] flex-1 items-center justify-center p-6 text-center text-sm leading-7', isDark ? 'text-white/46' : 'text-slate-500')}>
        {t('markets.panel.empty')}
      </div>
    )
  }

  const outcomeRows = getOutcomeRows(detail)
  const panelBorderClass = isDark ? 'border-white/6' : 'border-slate-900/6'
  const panelTitleClass = isDark ? 'text-[11px] font-semibold uppercase tracking-[0.24em] text-white/48' : 'text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500'
  const closeButtonClass = isDark
    ? 'theme-surface-button inline-flex h-10 w-10 items-center justify-center rounded-full text-white/84 hover:text-white'
    : 'theme-surface-button inline-flex h-10 w-10 items-center justify-center rounded-full'
  const categoryChipClass = isDark
    ? 'rounded-full border border-white/8 bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/46'
    : 'rounded-full border border-slate-900/8 bg-slate-900/[0.03] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500'
  const timeTextClass = isDark ? 'text-xs text-white/42' : 'text-xs text-slate-500'
  const questionTitleClass = isDark ? 'text-2xl font-semibold leading-tight tracking-[-0.03em] text-white' : 'text-2xl font-semibold leading-tight tracking-[-0.03em] text-slate-950'
  const eventTitleClass = isDark ? 'text-sm text-white/50' : 'text-sm text-slate-500'
  const statCardClass = isDark
    ? 'rounded-2xl border border-white/8 bg-white/[0.04] p-4'
    : 'rounded-2xl border border-slate-900/8 bg-slate-900/[0.03] p-4'
  const statLabelClass = isDark ? 'text-[10px] font-semibold uppercase tracking-[0.18em] text-white/34' : 'text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500'
  const statValueClass = isDark ? 'mt-2 text-lg font-semibold text-white' : 'mt-2 text-lg font-semibold text-slate-950'
  const bigValueClass = isDark ? 'mt-2 text-2xl font-semibold text-white' : 'mt-2 text-2xl font-semibold text-slate-950'
  const expireValueClass = isDark ? 'mt-2 text-sm font-semibold leading-6 text-white/84' : 'mt-2 text-sm font-semibold leading-6 text-slate-800'
  const volumeAccentClass = isDark ? 'mt-2 text-lg font-semibold text-[#36c6b2]' : 'mt-2 text-lg font-semibold text-[#158a78]'
  const sectionCardClass = isDark
    ? 'rounded-[22px] border border-white/8 bg-white/[0.03] p-4'
    : 'rounded-[22px] border border-slate-900/8 bg-slate-900/[0.03] p-4'
  const sectionLabelClass = isDark ? 'flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/44' : 'flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500'
  const outcomeCardClass = isDark
    ? 'flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3'
    : 'flex items-center justify-between gap-3 rounded-2xl border border-slate-900/8 bg-white px-3 py-3'
  const outcomeLabelClass = isDark ? 'min-w-0 text-sm font-semibold text-white/86' : 'min-w-0 text-sm font-semibold text-slate-900'
  const outcomeValueClass = isDark ? 'text-sm font-semibold text-white' : 'text-sm font-semibold text-slate-900'
  const actionSurfaceClass = isDark
    ? 'theme-surface-button inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold text-white/84 hover:text-white'
    : 'theme-surface-button inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold'
  const bodyClass = isModal ? 'flex-1 overflow-y-auto p-6 md:p-7 xl:p-8' : 'flex-1 space-y-5 overflow-y-auto p-5'
  const summaryGridClass = isModal ? 'grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start' : 'space-y-5'
  const sectionStackClass = isModal ? 'mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)] xl:items-start' : 'mt-5 space-y-5'
  const actionWrapClass = isModal ? 'flex flex-col gap-3 border-t pt-5 sm:flex-row' : 'flex flex-col gap-3 sm:flex-row'
  const rulesScrollClass = isModal
    ? clsx('mt-4 text-sm leading-7', isDark ? 'text-white/70' : 'text-slate-600', 'max-h-[26rem] overflow-y-auto pr-2')
    : clsx('mt-4 text-sm leading-7', isDark ? 'text-white/70' : 'text-slate-600')

  return (
    <div className="flex h-full flex-col">
      <div className={clsx('flex items-center justify-between border-b px-5 py-4', panelBorderClass)}>
        <div className={panelTitleClass}>
          {t('markets.panel.metrics')}
        </div>
        <button
          onClick={onClear}
          className={closeButtonClass}
          aria-label={t('markets.actions.close')}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className={bodyClass}>
        <div className={summaryGridClass}>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={categoryChipClass}>
                {getCategoryText(detail.category, isZh)}
              </span>
              <span className={timeTextClass}>
                {formatRemainingLabel(detail.endDate, isZh, detail.remainingLabel)}
              </span>
            </div>
            <h2 className={questionTitleClass}>
              {detail.question}
            </h2>
            <p className={eventTitleClass}>
              {detail.eventTitle}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 self-start">
            <div className={statCardClass}>
              <div className={statLabelClass}>
                {t('markets.table.odds')}
              </div>
              <div className={bigValueClass}>
                {formatPercent(detail.primaryProbability)}
              </div>
            </div>
            <div className={statCardClass}>
              <div className={statLabelClass}>
                {t('markets.table.expires')}
              </div>
              <div className={expireValueClass}>
                {formatDateTime(detail.endDate, locale)}
              </div>
            </div>
            <div className={statCardClass}>
              <div className={statLabelClass}>
                {t('markets.table.liquidity')}
              </div>
              <div className={statValueClass}>
                {formatMoney(detail.liquidity)}
              </div>
            </div>
            <div className={statCardClass}>
              <div className={statLabelClass}>
                {t('markets.table.volume24hr')}
              </div>
              <div className={volumeAccentClass}>
                {formatMoney(detail.volume24hr)}
              </div>
            </div>
          </div>
        </div>

        <div className={sectionStackClass}>
          <div className="space-y-5">
            <div className={sectionCardClass}>
              <div className={sectionLabelClass}>
                <TrendingUp className="h-4 w-4 text-[#36c6b2]" />
                <span>{outcomeRows.length === 2 ? `${t('markets.panel.yes')} / ${t('markets.panel.no')}` : t('markets.panel.topOptions')}</span>
              </div>
              <div className="mt-4 space-y-3">
                {outcomeRows.map((outcome) => (
                  <div key={outcome.label} className={outcomeCardClass}>
                    <div className={outcomeLabelClass}>
                      {outcome.label}
                    </div>
                    <div className={outcomeValueClass}>
                      {formatPercent(outcome.probability)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className={sectionCardClass}>
              <div className={sectionLabelClass}>
                <Coins className="h-4 w-4 text-[#c96a48]" />
                <span>{t('markets.panel.marketDetails')}</span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className={statCardClass}>
                  <div className={statLabelClass}>{t('markets.table.volume')}</div>
                  <div className={statValueClass}>{formatMoney(detail.volume)}</div>
                </div>
                <div className={statCardClass}>
                  <div className={statLabelClass}>{t('markets.table.remaining')}</div>
                  <div className={statValueClass}>{formatRemainingLabel(detail.endDate, isZh, detail.remainingLabel)}</div>
                </div>
                {detail.resolutionSource ? (
                  <div className={clsx(statCardClass, 'sm:col-span-2')}>
                    <div className={statLabelClass}>{t('markets.panel.resolutionSource')}</div>
                    <div className={clsx('mt-2 text-sm font-semibold leading-6', isDark ? 'text-white/84' : 'text-slate-800')}>
                      {detail.resolutionSource}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className={actionWrapClass}>
              <button
                onClick={() => onAnalyze(detail.analysisUrl)}
                className="theme-accent-button inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold"
              >
                {t('markets.panel.analyze')}
                <ArrowRight className="h-4 w-4" />
              </button>
              <a
                href={detail.polymarketUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={actionSurfaceClass}
              >
                {t('markets.panel.openMarket')}
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </div>

          {detail.description ? (
            <div className={sectionCardClass}>
              <div className={sectionLabelClass}>
                <Coins className="h-4 w-4 text-[#c96a48]" />
                <span>{t('markets.panel.rules')}</span>
              </div>
              <div className={rulesScrollClass}>
                {detail.description}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
