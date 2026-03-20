import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { usePrivy } from '@privy-io/react-auth'
import { useTranslation } from 'react-i18next'
import {
  Activity,
  ArrowRight,
  ChevronRight,
  ExternalLink,
  GitBranch,
  Globe2,
  LineChart,
  Newspaper,
  Radar,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from 'lucide-react'
import { api } from '../lib/backend'
import { AnimatedBackground } from '../components/AnimatedBackground'
import { Logo } from '../components/Logo'
import { ThemeToggle } from '../components/ThemeToggle'
import { useTheme } from '../lib/theme'

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

interface FeaturedOption {
  name: string
  market: number
  ai: number
}

interface FeaturedDecisionData {
  risk?: string
  event?: string
  options?: FeaturedOption[]
  deadline?: string
  direction?: string
  recommendation?: string
  risk_reason?: string
}

interface FeaturedAnalysis {
  id: string
  event_slug: string
  event_title: string
  category: string | null
  polymarket_url: string
  analysis_record_id: string | null
  decision_data: FeaturedDecisionData | null
  mispricing_score: number | null
  is_active: boolean
  expires_at: string | null
  created_at: string
}

function formatVolume(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`
  return `$${v.toFixed(0)}`
}

function formatPercent(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—'
  const rounded = Math.round(value * 10) / 10
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`
}

function getOutcomeSummary(market: TrendingMarket) {
  const limit = Math.min(market.outcomes.length, market.prices.length)
  if (limit === 0) return null

  const ranked = Array.from({ length: limit }, (_, index) => ({
    name: market.outcomes[index],
    probability: Math.round(market.prices[index] * 100),
  })).sort((a, b) => b.probability - a.probability)

  return {
    leader: ranked[0],
    top: ranked.slice(0, Math.min(3, ranked.length)),
  }
}

function shortLabel(question: string): string {
  const q = question.replace(/\?$/, '')
  const priceMatch = q.match(/\$[\d,.]+/)
  const dateMatch = q.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}/i)
  if (priceMatch) return priceMatch[0]
  if (dateMatch) return dateMatch[0]
  const cleaned = q
    .replace(/^Will\s+/i, '')
    .replace(/^the\s+/i, '')
    .replace(/^there\s+be\s+/i, '')
  if (cleaned.length > 35) return cleaned.slice(0, 33) + '...'
  return cleaned
}

function categoryLabel(category: string | null, isZh: boolean): string {
  const value = (category || 'other').toLowerCase()
  const map = isZh
    ? {
        politics: '政治',
        sports: '体育',
        economics: '宏观',
        crypto: '加密',
        ai: 'AI',
        other: '综合',
      }
    : {
        politics: 'Politics',
        sports: 'Sports',
        economics: 'Macro',
        crypto: 'Crypto',
        ai: 'AI',
        other: 'General',
      }
  return map[value as keyof typeof map] || (isZh ? '综合' : 'General')
}

function riskTone(risk: string | undefined): string {
  switch (risk) {
    case 'safe':
      return 'bg-emerald-500/10 text-emerald-700 border-emerald-500/18'
    case 'caution':
      return 'bg-amber-500/10 text-amber-700 border-amber-500/18'
    case 'danger':
      return 'bg-rose-500/10 text-rose-700 border-rose-500/18'
    case 'reject':
      return 'bg-slate-500/10 text-slate-700 border-slate-500/16'
    default:
      return 'bg-charcoal/5 text-charcoal/58 border-charcoal/10'
  }
}

function getStrongestOption(item: FeaturedAnalysis): { option: FeaturedOption; diff: number } | null {
  const options = item.decision_data?.options
  if (!Array.isArray(options) || options.length === 0) return null

  let strongest: { option: FeaturedOption; diff: number } | null = null
  for (const option of options) {
    if (typeof option.market !== 'number' || typeof option.ai !== 'number') continue
    const diff = Math.abs(option.ai - option.market)
    if (!strongest || diff > strongest.diff) {
      strongest = { option, diff }
    }
  }
  return strongest
}

function getFeaturedSignalStrength(item: FeaturedAnalysis): number {
  return getStrongestOption(item)?.diff ?? item.mispricing_score ?? 0
}

function isRenderableFeatured(item: FeaturedAnalysis): boolean {
  return Boolean(
    item.is_active &&
    item.decision_data &&
    Array.isArray(item.decision_data.options) &&
    item.decision_data.options.length > 0 &&
    getFeaturedSignalStrength(item) >= 1
  )
}

function getDiscoveryCopy(isZh: boolean) {
  if (isZh) {
    return {
      navDashboard: '进入工作台',
      navSignIn: '登录',
      hero: {
        eyebrow: 'Prediction Market Intelligence Desk',
        title: 'AI洞悉',
        highlight: '市场错价',
        subtitle:
          '把复杂事件先压成一张信号卡，帮你快速判断值不值得研究。',
        placeholder: '粘贴一个 Polymarket 事件链接，直接送进分析工作台...',
        primary: '开始分析',
        secondary: '了解分析方式',
        freeCredits: '新用户免费三个积分，邀请激励丰厚，快邀请朋友一起来试试吧。',
        marks: ['按市场结构分流', '市场价 vs AI 概率', '四段渐进输出'],
        panelEyebrow: 'Signal Engine',
        panelTitle: '不是一句结论，而是一条研究工作流',
        panelItems: [
          {
            label: 'Routing',
            value: 'Deadline / Ladder / Numeric / Competitive / Sports',
          },
          {
            label: 'Evidence',
            value: 'Polymarket、Google News、GDELT、CoinGecko、ESPN',
          },
          {
            label: 'Output',
            value: '概率比较、风险标签、建议方向、逐步结果',
          },
        ],
        panelStats: ['GPT-5.4 概率与风控', '专项路径分析', '可追踪证据流'],
      },
      opportunities: {
        eyebrow: 'Opportunity Radar',
        title: '先看这个错价事件',
        subtitle:
          '先把后台当前最值得点进去的一张信号卡放大展示，其他错价机会再横向排开。',
        empty: '当前还没有精选错价卡，等后台信号生成后会自动在这里滚动。',
        modeLive: '实时信号',
        stream: '更多机会',
        lead: '主信号',
        score: '错价分',
        market: '市场',
        ai: 'AI',
        edge: '偏差',
        deadline: '截止',
        direction: '方向',
        thesis: '判断',
        analyze: '分析该事件',
        open: '打开市场',
      },
      trust: {
        eyebrow: 'Analysis Framework',
        title: '严谨的分析架构',
        subtitle:
          '前端不只展示“结论”，而是明确告诉用户这套系统为什么可信：模型分工、实时信息源、专项路径和风控校准都在台面上。',
        cards: [
          {
            title: '模型不是一把梭',
            body: '概率分析和规则审计分开跑，最终报告再单独收敛，减少同一轮输出里既估概率又写结论导致的过度自信。',
            chips: ['GPT-5.4 概率分析', 'GPT-5.4 风控审计', 'DeepSeek 结构化输出'],
          },
          {
            title: '信息源是实时拼装的',
            body: '不是靠一个陈旧的大知识库，而是把 Polymarket、新闻、结构化行情和体育源拼成当前事件的证据包。',
            chips: ['Polymarket API', 'Google News / GDELT', 'CoinGecko / ESPN / TheSportsDB'],
          },
          {
            title: '不同市场走不同专项流',
            body: '程序截止日、时间梯子、数值分布、竞争型市场和体育事件都在进入概率分析前先做分型和计划生成。',
            chips: ['Deadline Procedural', 'Linked Binary Ladder', 'Sports / Numeric / Competitive'],
          },
          {
            title: '结果能按步骤被追踪',
            body: '用户可以看到事件信息提取、概率分析、风险审计和最终报告逐步完成，而不是只看一段黑箱文案。',
            chips: ['Progressive Result', 'Risk Labels', 'Actionable Direction'],
          },
        ],
      },
      pulse: {
        eyebrow: 'Market Pulse',
        title: '当前热门事件',
        subtitle: '',
      },
      cta: {
        title: '把任何事件送进你的研究台',
        subtitle: '',
        button: '打开工作台',
      },
    }
  }

  return {
      navDashboard: 'Open Workspace',
      navSignIn: 'Sign In',
    hero: {
      eyebrow: 'Prediction Market Intelligence Desk',
      title: 'AI spots',
      highlight: 'market mispricings',
      subtitle:
        'Compress a complex event into a single signal card, so you can quickly judge whether it is worth researching.',
      placeholder: 'Paste a Polymarket event URL and send it into the workspace...',
      primary: 'Analyze a Market',
      secondary: 'How it works',
      freeCredits: 'New users get 3 free credits, and referral rewards are generous. Invite your friends to try it together.',
      marks: ['Structure-aware routing', 'Market vs AI probability', '4-stage progressive output'],
      panelEyebrow: 'Signal Engine',
      panelTitle: 'More than a verdict. It is a research workflow.',
      panelItems: [
        {
          label: 'Routing',
          value: 'Deadline / Ladder / Numeric / Competitive / Sports',
        },
        {
          label: 'Evidence',
          value: 'Polymarket, Google News, GDELT, CoinGecko, ESPN',
        },
        {
          label: 'Output',
          value: 'Probability gaps, risk labels, direction, progressive results',
        },
      ],
      panelStats: ['GPT-5.4 probability + audit', 'Specialized analysis paths', 'Inspectable evidence trail'],
    },
    opportunities: {
      eyebrow: 'Opportunity Radar',
      title: 'Lead with the clearest mispricing',
      subtitle:
        'Put the strongest signal in front first. Keep the rest of the opportunity set in a horizontal rail below it.',
      empty: 'No featured signals are active right now. Once the backend scores new opportunities, they will appear here automatically.',
      modeLive: 'Live signal',
      stream: 'More signals',
      lead: 'Lead signal',
      score: 'Signal score',
      market: 'Market',
      ai: 'AI',
      edge: 'Gap',
      deadline: 'Deadline',
      direction: 'Direction',
      thesis: 'Thesis',
      analyze: 'Analyze this event',
      open: 'Open market',
    },
    trust: {
      eyebrow: 'Analysis Framework',
      title: 'A rigorous analysis architecture',
      subtitle:
        'The product should not only show a conclusion. It should show why the conclusion deserves attention: model separation, live sources, specialized routing, and explicit risk calibration.',
      cards: [
        {
          title: 'The model stack is separated by job',
          body: 'Probability estimation, rules audit, and final synthesis are not collapsed into one step, which reduces overconfident all-in-one outputs.',
          chips: ['GPT-5.4 probability', 'GPT-5.4 risk audit', 'DeepSeek structured report'],
        },
        {
          title: 'Evidence is assembled live',
          body: 'Instead of leaning on a stale generic knowledge base, each run builds an event-specific evidence pack from market data, news, and structured feeds.',
          chips: ['Polymarket API', 'Google News / GDELT', 'CoinGecko / ESPN / TheSportsDB'],
        },
        {
          title: 'Markets are routed into specialists',
          body: 'Deadline procedural, linked ladders, numeric structures, competitive fields, and sports markets each get a different analysis path before probability work starts.',
          chips: ['Deadline Procedural', 'Linked Binary Ladder', 'Sports / Numeric / Competitive'],
        },
        {
          title: 'Users can inspect the run',
          body: 'Each session reveals event extraction, probability analysis, risk audit, and reporting progressively instead of hiding everything behind one black-box paragraph.',
          chips: ['Progressive result', 'Risk labels', 'Actionable direction'],
        },
      ],
    },
    pulse: {
      eyebrow: 'Market Pulse',
      title: 'Trending right now',
      subtitle: '',
    },
    cta: {
      title: 'Send any event into the workspace',
      subtitle: 'The new visual system feels more like a market-intelligence desk, while the original analysis, history, credits, referrals, and transfer flows remain intact.',
      button: 'Open Workspace',
    },
  }
}

export const Discovery: React.FC = () => {
  const { authenticated, login } = usePrivy()
  const { i18n, t } = useTranslation()
  const navigate = useNavigate()
  const { resolvedTheme } = useTheme()
  const isZh = i18n.language === 'zh'
  const isDark = resolvedTheme === 'dark'
  const copy = getDiscoveryCopy(isZh)
  const [events, setEvents] = useState<TrendingEvent[]>([])
  const [featured, setFeatured] = useState<FeaturedAnalysis[]>([])
  const [trendingLoading, setTrendingLoading] = useState(true)
  const [trendingDegraded, setTrendingDegraded] = useState(false)
  const [quickUrl, setQuickUrl] = useState('')

  useEffect(() => {
    let alive = true

    api.getTrending(12)
      .then((data) => {
        if (!alive) return
        setEvents(Array.isArray(data?.events) ? data.events : [])
        setTrendingDegraded(Boolean(data?.degraded))
      })
      .catch((err) => {
        console.error('Failed to load trending:', err)
        if (alive) {
          setEvents([])
          setTrendingDegraded(true)
        }
      })
      .finally(() => {
        if (alive) setTrendingLoading(false)
      })

    api.getFeatured()
      .then((data) => {
        if (!alive) return
        setFeatured(Array.isArray(data?.featured) ? data.featured : [])
      })
      .catch((err) => {
        console.error('Failed to load featured:', err)
        if (alive) setFeatured([])
      })

    return () => {
      alive = false
    }
  }, [])

  const handleAnalyze = (url?: string) => {
    const nextUrl = (url || quickUrl).trim()

    if (!authenticated) {
      if (nextUrl) sessionStorage.setItem('polyinsight-pending-url', nextUrl)
      login()
      return
    }

    navigate('/analyze', {
      state: nextUrl ? { prefillUrl: nextUrl } : undefined,
    })
  }

  const featuredItems = featured
    .filter(isRenderableFeatured)
    .sort((a, b) => getFeaturedSignalStrength(b) - getFeaturedSignalStrength(a))
    .slice(0, 6)
  const showcaseItems = featuredItems.length > 1 ? [...featuredItems, ...featuredItems] : featuredItems
  const trendingItems = events.slice(0, 6)
  const trustCards = [
    {
      icon: LineChart,
      iconClass: isDark
        ? 'bg-[linear-gradient(145deg,rgba(255,90,107,0.22),rgba(255,90,107,0.1))] text-[#ff9cab]'
        : 'bg-[linear-gradient(145deg,rgba(255,90,107,0.18),rgba(255,90,107,0.08))] text-[#d94c5f]',
      ...copy.trust.cards[0],
    },
    {
      icon: Newspaper,
      iconClass: isDark
        ? 'bg-[linear-gradient(145deg,rgba(79,124,255,0.24),rgba(79,124,255,0.1))] text-[#a9c2ff]'
        : 'bg-[linear-gradient(145deg,rgba(79,124,255,0.18),rgba(79,124,255,0.08))] text-[#496fe0]',
      ...copy.trust.cards[1],
    },
    {
      icon: GitBranch,
      iconClass: isDark
        ? 'bg-[linear-gradient(145deg,rgba(35,201,169,0.22),rgba(35,201,169,0.1))] text-[#8bf0d7]'
        : 'bg-[linear-gradient(145deg,rgba(35,201,169,0.18),rgba(35,201,169,0.08))] text-[#169d83]',
      ...copy.trust.cards[2],
    },
    {
      icon: ShieldCheck,
      iconClass: isDark
        ? 'bg-[linear-gradient(145deg,rgba(122,92,255,0.24),rgba(122,92,255,0.1))] text-[#c7bbff]'
        : 'bg-[linear-gradient(145deg,rgba(122,92,255,0.18),rgba(122,92,255,0.08))] text-[#6551d8]',
      ...copy.trust.cards[3],
    },
  ]
  return (
    <AnimatedBackground>
      <div className="min-h-screen font-sans">
        <header className="sticky top-0 z-40 border-b border-charcoal/10 bg-warm-white/78 backdrop-blur-2xl">
          <div className="container px-5 py-4 md:px-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <Logo />
              <div className="flex flex-wrap items-center gap-2 md:justify-end">
                <ThemeToggle isZh={isZh} />
                <button
                  onClick={() => {
                    const newLang = isZh ? 'en' : 'zh'
                    i18n.changeLanguage(newLang)
                    localStorage.setItem('polyinsight-lang', newLang)
                  }}
                  className="theme-surface-button inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold transition"
                >
                  <Globe2 size={15} />
                  <span>{isZh ? 'EN' : '中文'}</span>
                </button>
                {authenticated ? (
                  <Link
                    to="/analyze"
                    className="theme-accent-button inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition"
                  >
                    {copy.navDashboard}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                ) : (
                  <button
                    onClick={() => handleAnalyze()}
                    className="theme-accent-button inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition"
                  >
                    {copy.navSignIn}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </header>

        <main className="pb-20">
          <section className="animate-section-reveal pt-8 md:pt-12">
            <div className="container px-5 md:px-6">
              <div className="grid gap-8 xl:grid-cols-[minmax(340px,0.78fr)_minmax(560px,1.22fr)] xl:items-center">
                <div className="space-y-6">
                  <div className="animate-section-reveal animate-delay-100 inline-flex items-center gap-2 rounded-full border border-charcoal/10 bg-warm-white/72 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-charcoal/55 shadow-sm">
                    <Radar className="h-3.5 w-3.5 text-terracotta" />
                    <span>{copy.hero.eyebrow}</span>
                  </div>

                  <div className="animate-section-reveal animate-delay-200 max-w-[33rem]">
                    <h1 className="max-w-[8.5ch] font-serif text-[3rem] leading-[0.92] tracking-[-0.06em] text-charcoal md:text-[4rem] xl:text-[4.45rem]">
                      {copy.hero.title}
                      <span className="mt-2 block bg-[linear-gradient(120deg,var(--accent)_0%,var(--accent-violet)_52%,var(--accent-cool)_100%)] bg-clip-text text-transparent">
                        {copy.hero.highlight}
                      </span>
                    </h1>
                    <p className="mt-6 max-w-xl text-base leading-7 text-charcoal/68 md:text-lg">
                      {copy.hero.subtitle}
                    </p>
                  </div>

                  <div className="animate-section-reveal animate-delay-300 tech-panel flex max-w-[42rem] flex-col gap-4 rounded-[30px] p-4 md:p-5">
                    <div className="flex flex-col gap-3">
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-charcoal/28" />
                        <input
                          type="url"
                          value={quickUrl}
                          onChange={(e) => setQuickUrl(e.target.value)}
                          placeholder={copy.hero.placeholder}
                          className="w-full rounded-2xl border border-charcoal/10 bg-warm-white/86 py-4 pl-12 pr-4 text-sm text-charcoal placeholder:text-charcoal/32 outline-none transition focus:border-terracotta/40 focus:ring-2 focus:ring-terracotta/15 md:text-base"
                        />
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <button
                          onClick={() => handleAnalyze()}
                          className="theme-accent-button inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-4 text-sm font-semibold transition"
                        >
                          <Sparkles className="h-4 w-4" />
                          <span>{copy.hero.primary}</span>
                        </button>
                        <a
                          href="#analysis-method"
                          className="theme-surface-button inline-flex items-center justify-center rounded-2xl px-4 py-4 text-sm font-semibold transition"
                        >
                          {copy.hero.secondary}
                        </a>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {copy.hero.marks.map((item, index) => (
                        <span
                          key={item}
                          className="signal-chip inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold text-charcoal/60"
                        >
                          <span
                            className={[
                              'h-1.5 w-1.5 rounded-full',
                              index % 3 === 0
                                ? 'bg-[#ff5a6b]'
                                : index % 3 === 1
                                  ? 'bg-[#23c9a9]'
                                  : 'bg-[#6f63ff]',
                            ].join(' ')}
                          />
                          {item}
                        </span>
                      ))}
                    </div>
                    <p className="text-sm leading-6 text-charcoal/56">
                      {copy.hero.freeCredits}
                    </p>
                  </div>
                </div>

                <div className="animate-section-reveal animate-delay-400 premium-card glass-window relative rounded-[40px] p-6 md:p-7">
                  <div className="relative">
                    <div className="mb-5 flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full bg-[#ff5f57]/80 shadow-[0_0_0_1px_rgba(0,0,0,0.04)]" />
                      <span className="h-3 w-3 rounded-full bg-[#ffbd2f]/80 shadow-[0_0_0_1px_rgba(0,0,0,0.04)]" />
                      <span className="h-3 w-3 rounded-full bg-[#28c840]/80 shadow-[0_0_0_1px_rgba(0,0,0,0.04)]" />
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-charcoal/48">
                        {copy.opportunities.eyebrow}
                      </div>
                      {featuredItems.length > 0 ? (
                        <span className="rounded-full border border-charcoal/10 bg-warm-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-charcoal/58 shadow-sm">
                          {copy.opportunities.modeLive}
                        </span>
                      ) : null}
                    </div>
                    <h2 className="mt-3 max-w-sm font-serif text-[1.7rem] leading-tight text-charcoal md:text-[1.95rem]">
                      {copy.opportunities.title}
                    </h2>

                    {showcaseItems.length > 0 ? (
                      <div className="mt-5">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-charcoal/44">
                            {copy.opportunities.stream}
                          </div>
                          <div className="rounded-full border border-charcoal/10 bg-warm-white/70 px-3 py-1 text-[11px] font-semibold text-charcoal/56 shadow-sm">
                            {isZh ? '自动滚动 / 可停留' : 'Auto-scroll / hover to pause'}
                          </div>
                        </div>
                        <div className="relative overflow-hidden rounded-[32px]">
                          <div className={`pointer-events-none absolute inset-y-0 left-0 z-10 w-16 ${isDark ? 'bg-gradient-to-r from-[rgba(10,16,32,0.98)] to-transparent' : 'bg-gradient-to-r from-[rgba(248,251,255,0.96)] to-transparent'}`} />
                          <div className={`pointer-events-none absolute inset-y-0 right-0 z-10 w-16 ${isDark ? 'bg-gradient-to-l from-[rgba(10,16,32,0.98)] to-transparent' : 'bg-gradient-to-l from-[rgba(248,251,255,0.96)] to-transparent'}`} />
                          <div className="market-marquee flex gap-5 py-1 pr-5">
                            {showcaseItems.map((item, index) => (
                              <OpportunityShowcaseCard
                                key={`${item.id}-showcase-${index}`}
                                item={item}
                                copy={copy.opportunities}
                                isZh={isZh}
                                isDark={isDark}
                                onAnalyze={() => handleAnalyze(item.polymarket_url)}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="workspace-subpanel mt-5 rounded-[28px] px-5 py-8 text-center">
                        <p className="text-sm font-medium leading-6 text-charcoal/62">
                          {copy.opportunities.empty}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section id="analysis-method" className="animate-section-reveal animate-delay-600 pt-14 md:pt-20">
            <div className="container px-5 md:px-6">
              <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-charcoal/40">
                    {copy.trust.eyebrow}
                  </div>
                  <h2 className="mt-3 font-serif text-3xl text-charcoal md:text-4xl">
                    {copy.trust.title}
                  </h2>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
                {trustCards.map((card) => {
                  const Icon = card.icon
                  return (
                    <div key={card.title} className="premium-card glass-window stagger-card card-hover rounded-[30px] p-5">
                      <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${card.iconClass}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <h3 className="mt-5 font-serif text-xl text-charcoal">
                        {card.title}
                      </h3>
                      <p className="mt-3 text-sm leading-6 text-charcoal/62">
                        {card.body}
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {card.chips.map((chip) => (
                          <span key={chip} className="signal-chip rounded-full px-3 py-1.5 text-[11px] font-semibold text-charcoal/58">
                            {chip}
                          </span>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </section>

          <section className="animate-section-reveal animate-delay-700 pt-14 md:pt-20">
            <div className="container px-5 md:px-6">
              <div className="mb-8">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-charcoal/40">
                    {copy.pulse.eyebrow}
                  </div>
                  <h2 className="mt-3 flex items-center gap-3 font-serif text-3xl text-charcoal md:text-4xl">
                    <TrendingUp className="h-6 w-6 text-terracotta" />
                    <span>{copy.pulse.title}</span>
                  </h2>
                </div>
              </div>

              {trendingLoading ? (
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="premium-card h-72 rounded-[30px] animate-pulse" />
                  ))}
                </div>
              ) : trendingItems.length === 0 ? (
                <div className="premium-card glass-window rounded-[30px] px-6 py-10 text-center">
                  <p className="text-sm font-medium text-charcoal/62">
                    {t('discovery.trending.empty')}
                  </p>
                  {trendingDegraded && (
                    <p className="mt-2 text-xs uppercase tracking-[0.22em] text-charcoal/36">
                      {isZh ? '实时数据暂时不可用' : 'Live data temporarily unavailable'}
                    </p>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {trendingItems.map((event) => (
                    <EventCard
                      key={event.slug}
                      event={event}
                      onAnalyze={() => handleAnalyze(event.url)}
                      isZh={isZh}
                      isDark={isDark}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="animate-section-reveal animate-delay-800 pt-14 md:pt-20">
            <div className="container px-5 md:px-6">
              <div className="tech-panel-dark glass-window overflow-hidden rounded-[36px] px-6 py-8 text-white md:px-8 md:py-10">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                  <div className="max-w-3xl">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/45">
                      Activation
                    </div>
                    <h2 className="mt-3 font-serif text-3xl leading-tight md:text-4xl">
                      {copy.cta.title}
                    </h2>
                    {copy.cta.subtitle ? (
                      <p className="mt-4 text-sm leading-6 text-white/68 md:text-base">
                        {copy.cta.subtitle}
                      </p>
                    ) : null}
                    <div className="mt-5 flex flex-wrap gap-2">
                      {(isZh
                        ? ['渐进结果', '多市场工作流', '真实外部信息源']
                        : ['Progressive output', 'Multi-market workflow', 'Live external sources']
                      ).map((item) => (
                        <span key={item} className="rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/74">
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => handleAnalyze()}
                    className="theme-accent-button inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-4 text-sm font-semibold transition"
                  >
                    {copy.cta.button}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </section>
        </main>

        <footer className="border-t border-charcoal/10 py-8">
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

const OpportunityShowcaseCard: React.FC<{
  item: FeaturedAnalysis
  copy: ReturnType<typeof getDiscoveryCopy>['opportunities']
  isZh: boolean
  isDark: boolean
  onAnalyze: () => void
}> = ({ item, copy, isZh, isDark, onAnalyze }) => {
  const strongest = getStrongestOption(item)
  const diff = strongest?.diff ?? item.mispricing_score ?? 0
  const bias = strongest
    ? strongest.option.ai > strongest.option.market
      ? (isZh ? '市场低估' : 'Market under')
      : (isZh ? '市场高估' : 'Market over')
    : (isZh ? '信号' : 'Signal')
  const risk = item.decision_data?.risk

  const softPanelClass = isDark
    ? 'theme-soft-panel rounded-[22px] p-4'
    : 'theme-soft-panel rounded-[22px] p-4'
  const badgeClass = isDark
    ? 'inline-flex items-center gap-2 rounded-full bg-white/8 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-charcoal/58'
    : 'inline-flex items-center gap-2 rounded-full bg-white/72 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-charcoal/44'

  return (
    <button
      onClick={onAnalyze}
      className="premium-card glass-window flex h-[30.5rem] w-[28rem] flex-shrink-0 flex-col overflow-hidden rounded-[32px] p-5 text-left transition duration-300 hover:-translate-y-1 hover:shadow-[0_30px_60px_rgba(123,109,90,0.14)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className={badgeClass}>
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
            {categoryLabel(item.category, isZh)}
          </div>
          <h3 className="mt-3 line-clamp-3 max-w-[16ch] font-serif text-[1.75rem] leading-[1.02] text-charcoal">
            {item.event_title}
          </h3>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${riskTone(risk)}`}>
          {risk || 'live'}
        </span>
      </div>

      <div className="mt-5 grid min-h-0 flex-1 gap-4 md:grid-cols-[1.02fr_0.98fr]">
        <div className="theme-score-panel rounded-[28px] p-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-charcoal/36">
            {bias}
          </div>
          <div className="theme-score-value mt-3 text-[4.2rem] font-semibold leading-none tracking-[-0.08em]">
            {formatPercent(diff)}
          </div>
          <div className="mt-4 text-sm font-semibold text-charcoal/54">
            {copy.score}
          </div>
        </div>

        <div className="min-h-0 space-y-3">
          {strongest && (
            <div className={softPanelClass}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-charcoal/34">
                    {strongest.option.name}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-5">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-charcoal/32">
                        {copy.market}
                      </div>
                      <div className="mt-1 text-xl font-semibold text-charcoal/76">
                        {formatPercent(strongest.option.market)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-charcoal/32">
                        {copy.ai}
                      </div>
                      <div className="mt-1 text-xl font-semibold text-charcoal">
                        {formatPercent(strongest.option.ai)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className={softPanelClass}>
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-1">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-charcoal/32">
                  {copy.direction}
                </div>
                <div className="mt-2 text-sm font-semibold text-charcoal">
                  {item.decision_data?.direction || '—'}
                </div>
              </div>
              {item.decision_data?.deadline && (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-charcoal/32">
                    {copy.deadline}
                  </div>
                  <div className="mt-2 text-sm font-semibold text-charcoal/72">
                    {item.decision_data.deadline}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-charcoal/8 pt-3">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-charcoal/42">
          {isZh ? '重点观察' : 'Priority signal'}
        </div>
        <div className="theme-accent-button inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold">
          {copy.analyze}
          <ChevronRight className="h-4 w-4" />
        </div>
      </div>
    </button>
  )
}

const EventCard: React.FC<{
  event: TrendingEvent
  onAnalyze: () => void
  isZh: boolean
  isDark: boolean
}> = ({ event, onAnalyze, isZh, isDark }) => {
  const topMarkets = event.markets.slice(0, 2)
  const isSingleMarket = event.markets.length === 1
  const singleMarket = isSingleMarket ? event.markets[0] : null
  const summary = singleMarket ? getOutcomeSummary(singleMarket) : null

  return (
    <article className="premium-card glass-window card-hover flex h-full flex-col rounded-[30px] p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {event.image && (
            <img
              src={event.image}
              alt=""
              className="h-12 w-12 rounded-2xl object-cover"
            />
          )}
          <div>
            <div className="accent-pill inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-charcoal/48">
              <Activity className="h-3 w-3 text-terracotta" />
              <span>{formatVolume(event.volume24hr || event.volume)} vol</span>
            </div>
            <h3 className="mt-3 line-clamp-2 font-serif text-xl leading-tight text-charcoal">
              {event.title}
            </h3>
          </div>
        </div>
      </div>

      <div className="premium-tile mt-5 flex-1 rounded-[24px] p-4">
        {isSingleMarket && singleMarket && summary ? (
          <div>
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-charcoal/42">
                  {isZh ? '主导方向' : 'Leading side'}
                </div>
                <div className="mt-2 flex items-end gap-3">
                  <div className="text-4xl font-semibold text-charcoal">
                    {summary.leader.probability}%
                  </div>
                  <div className="rounded-full bg-[linear-gradient(145deg,rgba(35,201,169,0.18),rgba(79,124,255,0.12))] px-3 py-1 text-sm font-semibold text-charcoal">
                    {summary.leader.name}
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {summary.top.map((outcome) => (
                <div
                  key={outcome.name}
                  className={`rounded-2xl border px-3 py-3 ${isDark ? 'border-white/8 bg-white/6' : 'border-charcoal/8 bg-white/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.92)]'}`}
                >
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-charcoal/36">
                    {outcome.name}
                  </div>
                  <div className="mt-1 text-lg font-semibold text-charcoal">
                    {outcome.probability}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {topMarkets.map((market, idx) => (
              <div
                key={idx}
                className={`rounded-2xl border px-3 py-3 ${isDark ? 'border-white/8 bg-white/6' : 'border-charcoal/8 bg-white/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.92)]'}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-medium text-charcoal/74" title={market.question}>
                    {shortLabel(market.question)}
                  </span>
                  <span className="text-sm font-semibold text-charcoal">
                    {Math.round(market.prices[0] * 100)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 border-t border-charcoal/8 pt-4">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-charcoal/42">
          {formatVolume(event.volume)} {isZh ? '总量' : 'total'}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onAnalyze}
            className="theme-contrast-button inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition"
          >
            {isZh ? 'AI 分析' : 'Analyze'}
            <ChevronRight className="h-4 w-4" />
          </button>
          <a
            href={event.url}
            target="_blank"
            rel="noopener noreferrer"
            className="theme-surface-button inline-flex items-center justify-center rounded-2xl px-3 py-2.5 transition"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>
    </article>
  )
}
