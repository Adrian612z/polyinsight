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
          '不盲从价格，不复述市场噪声。PolyInsight 用独立逻辑 + AI推理，把复杂事件拆解成清晰概率、风险和可执行建议。',
        placeholder: '粘贴一个 Polymarket 事件链接，例如 https://polymarket.com/event/...',
        primary: '立即生成独立分析',
        secondary: '查看分析流程与逻辑',
        freeCredits: '新用户可先免费体验 3 次分析。数据来源透明，AI逻辑可追踪，判断独立于市场价格。',
        marks: ['数据来源透明', 'AI逻辑可追踪', '独立于市场价格'],
        panelEyebrow: '分析会看到什么',
        panelTitle: '不是一句结论，而是一份可验证、可执行的研究起点',
        panelItems: [
          {
            label: '适合分析',
            value: '政治、体育、加密以及其他时效性强的事件',
          },
          {
            label: '重点参考',
            value: '事件规则、链上市场定价、新闻信息和关键数据源',
          },
          {
            label: '你会得到',
            value: '独立概率判断、风险审查、建议方向和逐步推理过程',
          },
        ],
        panelStats: ['分析过程透明', '支持历史回看', '支持多会话并行'],
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
          '每一步都围绕规则、数据和风险展开，不靠复述市场，不靠一句黑箱判断。',
        cards: [
          {
            title: '解析事件规则与结算条件',
            body: 'AI 自动拆解事件结构、结算条件和截止时间，确保整个分析从正确问题出发。',
            chips: ['规则解析', '结算条件', '截止时间'],
          },
          {
            title: '独立概率判断',
            body: '结合新闻、数据和上下文形成独立概率，再回头对比市场价格，识别市场偏差。',
            chips: ['独立逻辑', '新闻数据', '概率判断'],
          },
          {
            title: '全面风险审查',
            body: '检查规则陷阱、结算风险和时间风险，让潜在隐患在下判断前就暴露出来。',
            chips: ['规则陷阱', '结算风险', '时间风险'],
          },
          {
            title: '结构化可操作结论',
            body: '输出概率差、风险等级和建议方向，生成一页式可操作报告，帮助你快速决策。',
            chips: ['概率差', '风险等级', '可执行建议'],
          },
        ],
      },
      cta: {
        eyebrow: '开始使用',
        title: '把你关心的事件贴进来，AI将独立分析并生成透明可追踪的报告',
        subtitle: '支持历史记录与逐步展示，方便你随时回看每一步分析逻辑，而不只是看最终结论。',
        button: '开始透明分析',
        chips: ['数据来源透明', 'AI逻辑可追踪', '独立于市场价格'],
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
        'Stop following prices. PolyInsight uses independent logic + AI reasoning to turn complex events into clear probabilities, risk insights, and actionable recommendations.',
      placeholder: 'Paste a Polymarket event URL, for example https://polymarket.com/event/...',
      primary: 'Generate Independent Analysis',
      secondary: 'See the Analysis Logic',
      freeCredits: 'New users can try 3 analyses for free. Source transparency, traceable AI logic, and views that do not blindly follow market price.',
      marks: ['Transparent sources', 'Traceable AI logic', 'Independent from market price'],
      panelEyebrow: 'What the analysis looks at',
      panelTitle: 'Not just a verdict. A transparent and actionable starting point for research.',
      panelItems: [
        {
          label: 'Best for',
          value: 'Politics, sports, crypto, and other time-sensitive markets',
        },
        {
          label: 'Looks at',
          value: 'Market rules, on-chain pricing, recent reporting, and the most relevant data sources',
        },
        {
          label: 'You get',
          value: 'Independent probabilities, risk review, suggested direction, and traceable reasoning output',
        },
      ],
      panelStats: ['Transparent reasoning', 'Saved history', 'Multi-session runs'],
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
        'Every step is grounded in rules, data, and risk review, not in parroting the market or hiding logic behind a black box.',
      cards: [
        {
          title: 'Parse Rules and Settlement',
          body: 'The system breaks down market structure, settlement conditions, and deadlines so the analysis starts from the correct question.',
          chips: ['Rule parsing', 'Settlement', 'Deadline'],
        },
        {
          title: 'Build an Independent Probability View',
          body: 'News, data, and context are used to form an independent probability estimate before comparing it with the market price.',
          chips: ['Independent logic', 'News + data', 'Probability view'],
        },
        {
          title: 'Run a Full Risk Review',
          body: 'The analysis checks settlement traps, timing pressure, and failure cases so hidden risks are visible before action.',
          chips: ['Settlement risk', 'Timing risk', 'Failure cases'],
        },
        {
          title: 'Deliver an Actionable Report',
          body: 'The final output compresses probability gaps, risk level, and suggested direction into a report you can actually use.',
          chips: ['Probability gap', 'Risk level', 'Actionable call'],
        },
      ],
    },
    cta: {
      eyebrow: 'Get started',
      title: 'Paste in a market you care about and get a transparent, independent report',
      subtitle: 'Keep the history, review the step-by-step output, and come back to inspect the reasoning whenever you need it.',
      button: 'Start Transparent Analysis',
      chips: ['Transparent sources', 'Traceable AI logic', 'Independent from price'],
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
