// @vitest-environment node

import { describe, expect, it } from 'vitest'

import { buildVisitorFirstSeenMap, buildVisitorFirstTouchMap } from './tracking.js'

describe('buildVisitorFirstTouchMap', () => {
  it('keeps the earliest source for each visitor when later sessions change platform', () => {
    const map = buildVisitorFirstTouchMap([
      {
        visitor_id: 'visitor-1',
        campaign_code: null,
        source_type: 'direct',
        source_platform: 'direct',
        first_seen_at: '2026-04-20T10:00:00.000Z',
      },
      {
        visitor_id: 'visitor-1',
        campaign_code: 'featured_fed',
        source_type: 'campaign',
        source_platform: 'lark',
        first_seen_at: '2026-04-19T08:00:00.000Z',
      },
      {
        visitor_id: 'visitor-2',
        campaign_code: null,
        source_type: 'organic',
        source_platform: 'google',
        first_seen_at: '2026-04-18T08:00:00.000Z',
      },
    ])

    expect(map.get('visitor-1')).toEqual({
      campaignCode: 'featured_fed',
      sourceType: 'campaign',
      sourcePlatform: 'lark',
    })
    expect(map.get('visitor-2')).toEqual({
      campaignCode: null,
      sourceType: 'organic',
      sourcePlatform: 'google',
    })
  })
})

describe('buildVisitorFirstSeenMap', () => {
  it('keeps the earliest first_seen_at for each visitor', () => {
    const map = buildVisitorFirstSeenMap([
      {
        visitor_id: 'visitor-1',
        campaign_code: null,
        source_type: 'direct',
        source_platform: 'direct',
        first_seen_at: '2026-04-20T10:00:00.000Z',
      },
      {
        visitor_id: 'visitor-1',
        campaign_code: 'featured_fed',
        source_type: 'campaign',
        source_platform: 'lark',
        first_seen_at: '2026-04-19T08:00:00.000Z',
      },
    ])

    expect(map.get('visitor-1')).toBe(Date.parse('2026-04-19T08:00:00.000Z'))
  })
})
