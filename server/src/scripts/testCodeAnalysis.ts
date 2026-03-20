import { extractPolymarketSlug } from '../utils/polymarket.js'
import { runStandaloneCodeAnalysis } from '../analysis-runtime/codeWorkflow.js'

const url = process.argv[2]
const lang = process.argv[3] === 'zh' ? 'zh' : 'en'

if (!url) {
  console.error('Usage: npm run test:code-analysis -- <polymarket-url> [en|zh]')
  process.exit(1)
}

const slug = extractPolymarketSlug(url)
if (!slug) {
  console.error('Invalid Polymarket URL')
  process.exit(1)
}

const result = await runStandaloneCodeAnalysis({ slug, lang })

console.log('INFO STEP')
console.log(result.info.slice(0, 1200))
console.log('\n---\n')
console.log('PROBABILITY STEP')
console.log(result.probability.slice(0, 2000))
console.log('\n---\n')
console.log('RISK STEP')
console.log(result.risk.slice(0, 1600))
console.log('\n---\n')
console.log('FINAL RESULT')
console.log(result.finalResult.slice(0, 2500))
