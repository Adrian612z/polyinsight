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

function requireEnv(key: string): string {
  const val = process.env[key]
  if (!val) {
    console.error(`FATAL: Missing required environment variable: ${key}`)
    process.exit(1)
  }
  return val
}

export const config = {
  port: parseInt(process.env.PORT || '3001'),

  supabaseUrl: requireEnv('SUPABASE_URL'),
  supabaseServiceKey: requireEnv('SUPABASE_SERVICE_KEY'),

  privyAppId: requireEnv('PRIVY_APP_ID'),
  privyAppSecret: requireEnv('PRIVY_APP_SECRET'),

  n8nWebhookUrl: requireEnv('N8N_WEBHOOK_URL'),
  n8nWebhookUrlZh: requireEnv('N8N_WEBHOOK_URL_ZH'),

  // Credit cost per analysis (in centicredits: 100 = 1.00 credit)
  analysisCost: 100,
  // Signup bonus (in centicredits)
  signupBonus: 300,
  // Referral commission rate (10%)
  referralCommissionRate: 0.10,

  adminPassword: requireEnv('ADMIN_PASSWORD'),
  adminJwtSecret: requireEnv('ADMIN_JWT_SECRET'),

  // Allowed frontend origins for CORS
  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'https://polyinsight.online').split(','),
}
