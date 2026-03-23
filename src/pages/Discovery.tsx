import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { usePrivy } from '@privy-io/react-auth'
import { useTranslation } from 'react-i18next'
import {
  ArrowRight,
  ChevronRight,
  GitBranch,
  Globe2,
  LineChart,
  Newspaper,
  Radar,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { api } from '../lib/backend'
import { AnimatedBackground } from '../components/AnimatedBackground'
import { Logo } from '../components/Logo'
import { ThemeToggle } from '../components/ThemeToggle'
import { useTheme } from '../lib/theme'

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

function formatPercent(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—'
  const rounded = Math.round(value * 10) / 10
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`
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

function riskLabel(risk: string | undefined, isZh: boolean): string {
  switch (risk) {
    case 'safe':
      return isZh ? '相对稳健' : 'Lower risk'
    case 'caution':
      return isZh ? '需要留意' : 'Use caution'
    case 'danger':
      return isZh ? '高风险' : 'High risk'
    case 'reject':
      return isZh ? '不建议' : 'Avoid'
    default:
      return isZh ? '持续跟踪' : 'Active'
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
        eyebrow: 'Polymarket 研究助手',
        title: 'AI洞悉',
        highlight: '市场错价',
        subtitle:
          '把市场价格、事件规则和最新信息放到同一页里，帮你更快判断这个事件值不值得继续研究。',
        placeholder: '粘贴一个 Polymarket 事件链接，例如 https://polymarket.com/event/...',
        primary: '分析这个事件',
        secondary: '看看怎么分析',
        freeCredits: '新用户可先免费体验 3 次分析，合适再继续深入使用。',
        marks: ['市场概率对比', '关键信息汇总', '逐步生成结果'],
        panelEyebrow: '分析会看到什么',
        panelTitle: '不是一句结论，而是一份能继续往下研究的起点',
        panelItems: [
          {
            label: '适合分析',
            value: '政治、体育、加密以及其他时效性强的事件',
          },
          {
            label: '重点参考',
            value: '市场价格、事件规则、相关新闻和相关数据源',
          },
          {
            label: '你会得到',
            value: '概率判断、风险提示、建议方向和逐步结果',
          },
        ],
        panelStats: ['逐步输出结果', '保留历史记录', '支持多会话并行'],
      },
      opportunities: {
        eyebrow: '精选事件',
        title: '先看这些值得研究的事件',
        subtitle:
          '先展示当前最值得点进去的一批事件，帮助你快速找到下一条研究线索。',
        empty: '当前还没有可展示的精选事件，稍后会自动更新。',
        modeLive: '持续更新',
        stream: '更多事件',
        lead: '主信号',
        score: '概率差',
        market: '市场',
        ai: 'AI',
        edge: '差距',
        deadline: '到期',
        direction: '建议方向',
        thesis: '核心判断',
        analyze: '分析该事件',
        open: '打开市场',
        carouselHint: '自动轮播，可停留查看',
        priority: '建议优先查看',
      },
      trust: {
        eyebrow: '分析流程',
        title: '每份报告，都会按这四步往下走',
        subtitle:
          '先把题目读对，再独立判断概率，接着专门检查风险和反例，最后才把结论压成一页给你。',
        cards: [
          {
            title: '第一步：先读懂题目',
            body: '先确认它到底在赌什么、何时截止、什么情况算 Yes。题目没读对，后面算得再准也没用。',
            chips: ['题目定义', '截止时间', '结算条件'],
          },
          {
            title: '第二步：先独立算概率',
            body: '不先跟着盘面跑。先基于新闻、数据和背景信息做一版独立判断，再回头看市场是不是定错价。',
            chips: ['独立判断', '新闻数据', '价格对比'],
          },
          {
            title: '第三步：专门找风险',
            body: '重点查规则陷阱、反例和时间风险，避免方向看对了，最后却输在结算口径或节点上。',
            chips: ['规则陷阱', '反例检查', '时间风险'],
          },
          {
            title: '第四步：最后才给结论',
            body: '把真正有用的结果压成一页：AI 和市场的概率差、风险等级、建议方向，以及接下来该盯什么。',
            chips: ['概率对比', '风险等级', '建议方向'],
          },
        ],
      },
      cta: {
        eyebrow: '开始使用',
        title: '把你关心的事件贴进来，马上开始分析',
        subtitle: '支持保存历史、逐步展示结果，并且可以随时回看之前的分析。',
        button: '进入工作台',
        chips: ['逐步结果', '历史记录', '多会话分析'],
      },
    }
  }

  return {
      navDashboard: 'Open Workspace',
      navSignIn: 'Sign In',
    hero: {
      eyebrow: 'Polymarket research assistant',
      title: 'AI spots',
      highlight: 'market mispricings',
      subtitle:
        'Bring price, rules, and current information into one view so you can decide faster whether a market deserves deeper research.',
      placeholder: 'Paste a Polymarket event URL, for example https://polymarket.com/event/...',
      primary: 'Analyze this market',
      secondary: 'See how it works',
      freeCredits: 'New users can try 3 analyses for free before deciding whether to go deeper.',
      marks: ['Price vs AI view', 'Key context in one place', 'Progressive results'],
      panelEyebrow: 'What the analysis looks at',
      panelTitle: 'Not just a verdict. A practical starting point for research.',
      panelItems: [
        {
          label: 'Best for',
          value: 'Politics, sports, crypto, and other time-sensitive markets',
        },
        {
          label: 'Looks at',
          value: 'Market pricing, market rules, recent news, and relevant data',
        },
        {
          label: 'You get',
          value: 'Probability judgment, risk flags, suggested direction, and progressive output',
        },
      ],
      panelStats: ['Progressive output', 'Saved history', 'Multi-session runs'],
    },
    opportunities: {
      eyebrow: 'Featured markets',
      title: 'Start with the markets worth a closer look',
      subtitle:
        'Show the most interesting opportunities first so users can move quickly into the next market worth researching.',
      empty: 'No featured markets are available right now. This area will update automatically when new signals appear.',
      modeLive: 'Live updates',
      stream: 'More markets',
      lead: 'Lead signal',
      score: 'Probability gap',
      market: 'Market',
      ai: 'AI',
      edge: 'Gap',
      deadline: 'Expires',
      direction: 'Suggested direction',
      thesis: 'Key view',
      analyze: 'Analyze this event',
      open: 'Open market',
      carouselHint: 'Auto-rotating list',
      priority: 'Suggested first look',
    },
    trust: {
      eyebrow: 'Analysis flow',
      title: 'Every report follows the same four-step process',
      subtitle:
        'First read the market correctly, then build an independent probability view, pressure-test the risk, and only then compress it into a final call.',
      cards: [
        {
          title: 'Step 1: Read the market correctly',
          body: 'Clarify what the market is actually asking, when it closes, and what counts as Yes. If the question is wrong, the rest is noise.',
          chips: ['Question', 'Deadline', 'Settlement'],
        },
        {
          title: 'Step 2: Build an independent view',
          body: 'Start from news, data, and context to form an independent probability estimate before comparing it with the market price.',
          chips: ['Independent view', 'News + data', 'Price check'],
        },
        {
          title: 'Step 3: Look for failure points',
          body: 'Check rule traps, counter-cases, and timing risk so a good thesis does not die on settlement details or calendar pressure.',
          chips: ['Rule traps', 'Counter-case', 'Timing risk'],
        },
        {
          title: 'Step 4: Only then make the call',
          body: 'Compress the useful output into one view: AI vs market probability, risk level, suggested direction, and what still needs watching.',
          chips: ['AI vs market', 'Risk level', 'Suggested direction'],
        },
      ],
    },
    cta: {
      eyebrow: 'Get started',
      title: 'Paste in a market you care about and start analyzing',
      subtitle: 'Keep your history, review progressive results, and come back to earlier sessions when you need them.',
      button: 'Open workspace',
      chips: ['Progressive output', 'Saved history', 'Multi-session analysis'],
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
  const [featured, setFeatured] = useState<FeaturedAnalysis[]>([])
  const [quickUrl, setQuickUrl] = useState('')

  useEffect(() => {
    let alive = true

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
                <Link
                  to="/markets"
                  className="theme-surface-button inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold transition"
                >
                  <span>{t('markets.nav.markets')}</span>
                </Link>
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
                    <h1 className="max-w-[8.5ch] font-serif text-[3rem] leading-[0.98] tracking-[-0.06em] text-charcoal md:text-[4rem] xl:text-[4.45rem]">
                      {copy.hero.title}
                      <span className="mt-2 block pb-[0.08em] bg-[linear-gradient(120deg,var(--accent)_0%,var(--accent-violet)_52%,var(--accent-cool)_100%)] bg-clip-text text-transparent">
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
                            {copy.opportunities.carouselHint}
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
                  {copy.trust.subtitle ? (
                    <p className="mt-4 max-w-3xl text-sm leading-6 text-charcoal/62 md:text-base">
                      {copy.trust.subtitle}
                    </p>
                  ) : null}
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

          <section className="animate-section-reveal animate-delay-800 pt-14 md:pt-20">
            <div className="container px-5 md:px-6">
              <div className="tech-panel-dark glass-window overflow-hidden rounded-[36px] px-6 py-8 text-white md:px-8 md:py-10">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                  <div className="max-w-3xl">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/45">
                      {copy.cta.eyebrow}
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
                      {copy.cta.chips.map((item) => (
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
      ? (isZh ? 'AI 高于市场' : 'AI above market')
      : (isZh ? 'AI 低于市场' : 'AI below market')
    : (isZh ? '当前信号' : 'Current signal')
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
          {riskLabel(risk, isZh)}
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
          {copy.priority}
        </div>
        <div className="theme-accent-button inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold">
          {copy.analyze}
          <ChevronRight className="h-4 w-4" />
        </div>
      </div>
    </button>
  )
}
