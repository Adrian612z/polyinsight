import test from 'node:test'
import assert from 'node:assert/strict'
import type { WorkflowContext } from './parity.js'
import { normalizeProbabilityEstimateWithRepair } from './codeWorkflow.js'

function buildContext(): WorkflowContext {
  return {
    event: {
      id: 'evt-test',
      slug: 'cricket-test',
      title: 'Indian Premier League: Sunrisers Hyderabad vs Lucknow Super Giants',
      markets: [],
      router: {},
      market_type: 'sports_competition',
      analysis_path: 'sports_competition',
      analysis_plan: {},
      market_snapshot: {},
    } as WorkflowContext['event'],
    router: {
      analysis_path: 'sports_competition',
    },
    analysisPlan: {
      decision_option_rows: [
        {
          name: 'Indian Premier League: Sunrisers Hyderabad vs Lucknow Super Giants - Winner',
          market: 56,
        },
        {
          name: 'Indian Premier League: Sunrisers Hyderabad vs Lucknow Super Giants - Completed match?',
          market: 88,
        },
      ],
    },
    marketSnapshot: {},
    retrievalPlan: {},
    retrievalPack: {},
  }
}

test('repairs missing structured probability options with a JSON-only retry', async () => {
  const originalFetch = globalThis.fetch
  let repairCalls = 0

  globalThis.fetch = async (_url, init) => {
    repairCalls += 1
    const body = JSON.parse(String(init?.body || '{}')) as {
      input?: Array<{ content?: Array<{ text?: string }> }>
    }
    const promptText = body.input?.[0]?.content?.[0]?.text || ''
    assert.match(promptText, /Completed match\?/)
    assert.match(promptText, /Missing Option Names/)

    return new Response(
      JSON.stringify({
        output_text: JSON.stringify({
          event: 'Indian Premier League: Sunrisers Hyderabad vs Lucknow Super Giants',
          deadline: '2026-04-05',
          options: [
            {
              name: 'Indian Premier League: Sunrisers Hyderabad vs Lucknow Super Giants - Winner',
              market: 56,
              fair_low: 52,
              fair_high: 61,
              fair_mid: 57,
              confidence: 'medium',
              sources: ['Source 1', 'Source 0.5'],
              rationale: 'Winner market remains close, with only a modest edge.',
            },
            {
              name: 'Indian Premier League: Sunrisers Hyderabad vs Lucknow Super Giants - Completed match?',
              market: 88,
              fair_low: 83,
              fair_high: 91,
              fair_mid: 87,
              confidence: 'medium',
              sources: ['Source 1', 'Source 0.5'],
              rationale: 'Completion risk is limited, so the match should usually finish.',
            },
          ],
          recommendation: 'No clear edge.',
          direction: 'Do not participate',
          summary_markdown: 'The repair pass restored the missing option and preserved the rest of the structure.',
        }),
      }),
      {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      }
    )
  }

  try {
    const result = await normalizeProbabilityEstimateWithRepair({
      rawText: JSON.stringify({
        event: 'Indian Premier League: Sunrisers Hyderabad vs Lucknow Super Giants',
        deadline: '2026-04-05',
        options: [
          {
            name: 'Indian Premier League: Sunrisers Hyderabad vs Lucknow Super Giants - Winner',
            market: 56,
            fair_low: 52,
            fair_high: 61,
            fair_mid: 57,
            confidence: 'medium',
            sources: ['Source 1', 'Source 0.5'],
            rationale: 'Winner market remains close, with only a modest edge.',
          },
        ],
        recommendation: 'No clear edge.',
        direction: 'Do not participate',
        summary_markdown: 'The original output omitted one required option.',
      }),
      context: buildContext(),
      info: 'The market set includes a winner market and a separate Completed match? submarket.',
      lang: 'en',
    })

    assert.equal(repairCalls, 1)
    assert.deepEqual(
      result.options.map((option) => option.name),
      [
        'Indian Premier League: Sunrisers Hyderabad vs Lucknow Super Giants - Winner',
        'Indian Premier League: Sunrisers Hyderabad vs Lucknow Super Giants - Completed match?',
      ]
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})
