// @vitest-environment node

import { describe, expect, it } from 'vitest'

import { rankAutoDiscoveryEvents } from './trending.js'

describe('auto-discovery trending selection', () => {
  it('keeps all events and sorts them by 24h volume first', () => {
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
    ])

    expect(ranked.map((event) => event.slug)).toEqual([
      'long-high-volume',
      'soon',
      'long-lower-volume',
    ])
  })
})
