import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAnalysisProviderHeaders, formatAnalysisProviderSummary } from './provider.js'

test('buildAnalysisProviderHeaders sends bearer and compatibility api-key headers', () => {
  const headers = buildAnalysisProviderHeaders('  secret-key-value  ')

  assert.deepEqual(headers, {
    'content-type': 'application/json',
    authorization: 'Bearer secret-key-value',
    'x-api-key': 'secret-key-value',
    'x-goog-api-key': 'secret-key-value',
  })
})

test('formatAnalysisProviderSummary shows host and key state without leaking the key', () => {
  const summary = formatAnalysisProviderSummary({
    engine: 'code',
    baseUrl: 'https://athenaapi.com/v1/',
    apiKey: 'secret-key-value',
    models: {
      extract: 'gpt-5.2-chat-latest',
      analysis: 'gpt-5.4',
      audit: 'gpt-5.4',
      report: 'gpt-5.2-chat-latest',
    },
  })

  assert.match(summary, /baseUrl=https:\/\/athenaapi\.com\/v1/)
  assert.match(summary, /host=athenaapi\.com/)
  assert.match(summary, /apiKeyPresent=true/)
  assert.match(summary, /apiKeyLength=16/)
  assert.doesNotMatch(summary, /secret-key-value/)
})
