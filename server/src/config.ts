import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// Load .env file
try {
  const __dirname = dirname(fileURLToPath(import.meta.url))
  const envPath = resolve(__dirname, '..', '.env')
  const envContent = readFileSync(envPath, 'utf-8')
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx)
    const value = trimmed.slice(eqIdx + 1)
    if (!process.env[key]) process.env[key] = value
  }
} catch {}

export const config = {
  port: parseInt(process.env.PORT || '3001'),

  supabaseUrl: process.env.SUPABASE_URL || 'https://bdmgxchyuokxiyyfdlbo.supabase.co',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY || '',

  privyAppId: process.env.PRIVY_APP_ID || 'cmmeo6mqw004j0djm1swrhwx4',
  privyAppSecret: process.env.PRIVY_APP_SECRET || '',

  n8nWebhookUrl: process.env.N8N_WEBHOOK_URL || 'http://127.0.0.1:5678/webhook/polymarket-analysis',

  // Credit cost per analysis (in centicredits: 100 = 1.00 credit)
  analysisCost: 100,
  // Signup bonus (in centicredits)
  signupBonus: 300,
  // Referral commission rate (10%)
  referralCommissionRate: 0.10,
}
