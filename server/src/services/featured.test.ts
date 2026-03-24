// @vitest-environment node

import { describe, expect, it } from 'vitest'

import { getFeatureExpiryIso, getFeatureExpiryMs, isExpiredFeature } from './featured.js'

describe('featured expiry helpers', () => {
  it('prefers expires_at when it exists', () => {
    const expiry = getFeatureExpiryMs({
      expires_at: '2026-03-24T18:30:00Z',
      decision_data: { deadline: '2026-03-20' },
    })

    expect(expiry).toBe(Date.parse('2026-03-24T18:30:00Z'))
  })

  it('treats a YYYY-MM-DD deadline as end-of-day UTC', () => {
    const expiry = getFeatureExpiryMs({
      expires_at: null,
      decision_data: { deadline: '2026-03-24' },
    })

    expect(expiry).toBe(Date.parse('2026-03-24T23:59:59.999Z'))
  })

  it('marks a feature expired when the inferred deadline has passed', () => {
    expect(isExpiredFeature({
      expires_at: null,
      decision_data: { deadline: '2026-03-21' },
    } as never, Date.parse('2026-03-24T10:00:00Z'))).toBe(true)
  })

  it('returns a normalized ISO timestamp from deadline fallback', () => {
    expect(getFeatureExpiryIso(null, '2026-03-24')).toBe('2026-03-24T23:59:59.999Z')
  })
})
