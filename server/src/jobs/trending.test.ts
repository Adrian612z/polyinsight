// @vitest-environment node

import { describe, expect, it } from 'vitest'

import { hasAutoDiscoveryRunway, rankAutoDiscoveryEvents } from './trending.js'

describe('auto-discovery trending selection', () => {
  const now = Date.parse('2026-03-24T10:00:00Z')

  it('rejects events that are ending too soon', () => {
    expect(hasAutoDiscoveryRunway({ endDate: '2026-03-25T09:59:59Z' }, now)).toBe(false)
    expect(hasAutoDiscoveryRunway({ endDate: '2026-03-27T10:00:00Z' }, now)).toBe(true)
  })

  it('keeps only long-runway events and sorts them by 24h volume first', () => {
    const ranked = rankAutoDiscoveryEvents([
      {
        slug: 'soon',
        title: 'Soon',
        image: '',
        volume: 500000,
        volume24hr: 300000,
        endDate: '2026-03-25T00:00:00Z',
        markets: [],
      },
      {
        slug: 'long-high-volume',
        title: 'Long High Volume',
        image: '',
        volume: 900000,
        volume24hr: 400000,
        endDate: '2026-04-10T00:00:00Z',
        markets: [],
      },
      {
        slug: 'long-lower-volume',
        title: 'Long Lower Volume',
        image: '',
        volume: 1000000,
        volume24hr: 200000,
        endDate: '2026-05-10T00:00:00Z',
        markets: [],
      },
    ], now)

    expect(ranked.map((event) => event.slug)).toEqual([
      'long-high-volume',
      'long-lower-volume',
    ])
  })
})
