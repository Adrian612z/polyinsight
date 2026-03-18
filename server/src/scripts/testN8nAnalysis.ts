import { supabase } from '../services/supabase.js'
import { extractPolymarketSlug, toCanonicalPolymarketEventUrl } from '../utils/polymarket.js'
import { triggerN8nWebhook, waitForAnalysisRecordCompletion } from '../services/n8nAnalysis.js'

const url = process.argv[2]
const lang = process.argv[3] === 'zh' ? 'zh' : 'en'

if (!url) {
  console.error('Usage: npm run test:n8n-analysis -- <polymarket-url> [en|zh]')
  process.exit(1)
}

const slug = extractPolymarketSlug(url)
const canonicalUrl = toCanonicalPolymarketEventUrl(url)
if (!slug || !canonicalUrl) {
  console.error('Invalid Polymarket URL')
  process.exit(1)
}

const { data: record, error } = await supabase
  .from('analysis_records')
  .insert({
    user_id: 'system:n8n-parity-test',
    event_url: canonicalUrl,
    status: 'pending',
    credits_charged: 0,
  })
  .select('id')
  .single()

if (error || !record) {
  console.error('Failed to create test analysis record:', error?.message || 'unknown error')
  process.exit(1)
}

const recordId = record.id as string
const seenSteps = new Set<string>()

try {
  await triggerN8nWebhook({
    lang,
    payload: {
      url: canonicalUrl,
      originalUrl: url,
      slug,
      userId: 'system:n8n-parity-test',
      recordId,
      lang,
    },
  })

  const result = await waitForAnalysisRecordCompletion(recordId, {
    onProgress(partial) {
      for (const match of partial.matchAll(/<!--STEP:(\w+)-->/g)) {
        if (!seenSteps.has(match[1])) {
          seenSteps.add(match[1])
          console.log(`STEP ${match[1]}`)
        }
      }
    },
  })

  console.log('\nFINAL RESULT\n')
  console.log(result.slice(0, 5000))
} finally {
  await supabase.from('analysis_records').delete().eq('id', recordId)
}
