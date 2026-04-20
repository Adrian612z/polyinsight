// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchPolymarketEventForSlug } from './polymarketFetch.js'

describe('fetchPolymarketEventForSlug', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns the event directly when the slug is an event slug', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'event-1',
          slug: 'gemini-3pt5-released-by-june-30',
          title: 'Gemini 3.5 released by...?',
          description: 'Parent event',
          markets: [],
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      )
    )

    vi.stubGlobal('fetch', fetchMock)

    const event = await fetchPolymarketEventForSlug('gemini-3pt5-released-by-june-30')

    expect(event).toMatchObject({
      id: 'event-1',
      slug: 'gemini-3pt5-released-by-june-30',
      title: 'Gemini 3.5 released by...?',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('falls back to market lookup and synthesizes a single-market event', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('not found', { status: 404 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'market-1',
            slug: 'gemini-3pt5-released-by-march-31',
            question: 'Gemini 3.5 released by March 31?',
            description: 'Market description',
            outcomes: '["Yes","No"]',
            outcomePrices: '["0.013","0.987"]',
            active: true,
            closed: false,
            archived: false,
            acceptingOrders: true,
            enableOrderBook: true,
            groupItemTitle: 'March 31',
            endDate: '2026-03-31T23:59:59Z',
            events: [
              {
                id: 'event-1',
                slug: 'gemini-3pt5-released-by-june-30',
                title: 'Gemini 3.5 released by...?',
                description: 'Parent event',
                tags: [{ slug: 'ai' }],
                eventMetadata: { context_description: 'Context' },
              },
            ],
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }
        )
      )

    vi.stubGlobal('fetch', fetchMock)

    const event = await fetchPolymarketEventForSlug('gemini-3pt5-released-by-march-31')

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://gamma-api.polymarket.com/events/slug/gemini-3pt5-released-by-march-31',
      'https://gamma-api.polymarket.com/markets/slug/gemini-3pt5-released-by-march-31',
    ])
    expect(event).toMatchObject({
      id: 'event-1',
      slug: 'gemini-3pt5-released-by-june-30',
      title: 'Gemini 3.5 released by March 31?',
      description: 'Market description',
      tags: [{ slug: 'ai' }],
    })
    expect(event.markets).toHaveLength(1)
    expect(event.markets[0]).toMatchObject({
      slug: 'gemini-3pt5-released-by-march-31',
      question: 'Gemini 3.5 released by March 31?',
      groupItemTitle: 'March 31',
    })
  })
})
