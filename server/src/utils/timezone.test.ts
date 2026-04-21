// @vitest-environment node

import { describe, expect, it } from 'vitest'

import { formatDateKeyInTimeZone, getRecentDateKeysInTimeZone } from './timezone.js'

describe('timezone helpers', () => {
  it('formats date keys in the configured reporting timezone', () => {
    expect(formatDateKeyInTimeZone('2026-04-20T16:30:00.000Z', 'Asia/Shanghai')).toBe('2026-04-21')
    expect(formatDateKeyInTimeZone('2026-04-20T16:30:00.000Z', 'Asia/Tokyo')).toBe('2026-04-21')
    expect(formatDateKeyInTimeZone('2026-04-20T16:30:00.000Z', 'UTC')).toBe('2026-04-20')
  })

  it('builds recent date keys from the reporting timezone perspective', () => {
    expect(getRecentDateKeysInTimeZone(3, 'Asia/Shanghai', new Date('2026-04-21T01:00:00.000+08:00'))).toEqual([
      '2026-04-19',
      '2026-04-20',
      '2026-04-21',
    ])
  })
})
