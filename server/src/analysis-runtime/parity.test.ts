// @vitest-environment node

import { describe, expect, it } from 'vitest'

import { buildDecisionOptionRows } from './parity.js'

describe('buildDecisionOptionRows', () => {
  const ladderMarkets = [
    {
      label: 'March 31',
      yes_probability: 1.3,
      options: [
        { name: 'Yes', probability: 1.3 },
        { name: 'No', probability: 98.7 },
      ],
    },
    {
      label: 'June 30',
      yes_probability: 51,
      options: [
        { name: 'Yes', probability: 51 },
        { name: 'No', probability: 49 },
      ],
    },
  ]

  it('uses one yes-probability row per bucket for timing curves', () => {
    expect(buildDecisionOptionRows(ladderMarkets, 'timing_curve')).toEqual([
      {
        name: 'March 31',
        market_label: 'March 31',
        option_name: 'Yes',
        market: 1.3,
      },
      {
        name: 'June 30',
        market_label: 'June 30',
        option_name: 'Yes',
        market: 51,
      },
    ])
  })

  it('uses one yes-side row per market for non-exclusive sports bundles', () => {
    expect(buildDecisionOptionRows(ladderMarkets, 'sports_generic_multi')).toEqual([
      {
        name: 'March 31',
        market_label: 'March 31',
        option_name: 'Yes',
        market: 1.3,
      },
      {
        name: 'June 30',
        market_label: 'June 30',
        option_name: 'Yes',
        market: 51,
      },
    ])
  })

  it('uses one yes-side row per contender plus tail for exclusive fields', () => {
    expect(buildDecisionOptionRows([
      ...ladderMarkets,
      {
        label: 'Field Tail',
        yes_probability: 12.4,
        options: [],
      },
    ], 'exclusive_field_distribution')).toEqual([
      {
        name: 'March 31',
        market_label: 'March 31',
        option_name: 'Yes',
        market: 1.3,
      },
      {
        name: 'June 30',
        market_label: 'June 30',
        option_name: 'Yes',
        market: 51,
      },
      {
        name: 'Field Tail',
        market_label: 'Field Tail',
        option_name: 'Yes',
        market: 12.4,
      },
    ])
  })

  it('keeps actual outcome rows for single-market multi-option structures', () => {
    expect(buildDecisionOptionRows([
      {
        label: 'Moneyline',
        yes_probability: null,
        options: [
          { name: 'Rockets', probability: 41 },
          { name: 'Bulls', probability: 59 },
        ],
      },
    ], 'sports_multi_option_market')).toEqual([
      {
        name: 'Rockets',
        market_label: 'Moneyline',
        option_name: 'Rockets',
        market: 41,
      },
      {
        name: 'Bulls',
        market_label: 'Moneyline',
        option_name: 'Bulls',
        market: 59,
      },
    ])
  })
})
