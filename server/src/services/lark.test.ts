// @vitest-environment node

import { describe, expect, it } from 'vitest'

import { buildFeaturedLarkText, resolveFeaturedLarkGuidance } from './lark.js'
import type { FeaturedRecord } from './featured.js'

describe('buildFeaturedLarkText', () => {
  it('includes the event summary, edge, and tracked product link', () => {
    const featured: FeaturedRecord = {
      id: 'featured-1',
      event_slug: 'btc-above-120k',
      event_title: 'Bitcoin above 120k by year end',
      category: 'crypto',
      polymarket_url: 'https://polymarket.com/event/btc-above-120k',
      analysis_record_id: 'analysis-1',
      mispricing_score: 12,
      decision_data: {
        event: 'Bitcoin above 120k by year end',
        risk: 'caution',
        direction: 'Buy Yes',
        recommendation: 'Small tactical position only',
        risk_reason: 'Macro volatility remains high',
        deadline: '2026-12-31',
        options: [
          {
            name: 'Yes',
            market: 41,
            ai: 53,
          },
        ],
      },
    }

    const text = buildFeaturedLarkText(featured)

    expect(text).toContain('【PolyInsight 热门事件提醒】')
    expect(text).toContain('事件: Bitcoin above 120k by year end')
    expect(text).toContain('主信号: Yes: AI 53% vs market 41% (edge 12%)')
    expect(text).toContain('建议方向: Buy Yes')
    expect(text).toContain('内部预览链接: https://polyinsight.online/?c=featured_btc-above-120k&internal_preview=1')
    expect(text).toContain('utm_source=x')
    expect(text).toContain('c=featured_btc-above-120k')
  })

  it('downgrades to manual review when strongest signal contradicts model direction', () => {
    const featured: FeaturedRecord = {
      id: 'featured-2',
      event_slug: 'fed-cut-test',
      event_title: 'Fed cut test',
      category: 'economics',
      polymarket_url: 'https://polymarket.com/event/fed-decision-in-april',
      analysis_record_id: 'analysis-2',
      mispricing_score: 2,
      decision_data: {
        event: 'Fed cut test',
        risk: 'caution',
        direction: 'Buy Yes',
        recommendation: 'Original model recommendation',
        risk_reason: 'Risk note',
        deadline: '2026-04-29',
        options: [
          {
            name: 'Yes',
            market: 60,
            ai: 40,
          },
        ],
      },
    }

    const guidance = resolveFeaturedLarkGuidance(featured)
    const text = buildFeaturedLarkText(featured)

    expect(guidance.requiresManualReview).toBe(true)
    expect(guidance.direction).toBe('Review manually')
    expect(text).toContain('建议方向: Review manually')
    expect(text).toContain('系统提示: Signal implied Buy No, but model output said Buy Yes.')
  })
})
