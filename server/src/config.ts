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

function optionalEnv(key: string): string | null {
  return process.env[key] || null
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

  analysisEngine: (process.env.ANALYSIS_ENGINE || 'code') as 'n8n' | 'code',
  analysisWorkerEnabled: process.env.ANALYSIS_WORKER_ENABLED !== 'false',
  analysisWorkerConcurrency: parseInt(process.env.ANALYSIS_WORKER_CONCURRENCY || '2'),
  analysisWorkerPollMs: parseInt(process.env.ANALYSIS_WORKER_POLL_MS || '2000'),
  analysisWorkerHeartbeatMs: parseInt(process.env.ANALYSIS_WORKER_HEARTBEAT_MS || '15000'),
  analysisJobLockMs: parseInt(process.env.ANALYSIS_JOB_LOCK_MS || String(30 * 60 * 1000)),
  analysisMaxActiveJobsPerUser: parseInt(process.env.ANALYSIS_MAX_ACTIVE_JOBS_PER_USER || '3'),

  analysisCodeApiKey: optionalEnv('ANALYSIS_CODE_API_KEY'),
  analysisCodeBaseUrl: optionalEnv('ANALYSIS_CODE_BASE_URL') || 'https://api.openai.com/v1',
  analysisCodeModel: optionalEnv('ANALYSIS_CODE_MODEL') || 'gpt-5.4',
  analysisCodeAnalysisModel: optionalEnv('ANALYSIS_CODE_ANALYSIS_MODEL') || optionalEnv('ANALYSIS_CODE_MODEL') || 'gpt-5.4',
  analysisCodeAuditModel: optionalEnv('ANALYSIS_CODE_AUDIT_MODEL') || optionalEnv('ANALYSIS_CODE_MODEL') || 'gpt-5.4',
  analysisCodeExtractModel:
    optionalEnv('ANALYSIS_CODE_EXTRACT_MODEL') ||
    optionalEnv('ANALYSIS_CODE_LIGHT_MODEL') ||
    'gpt-5.2-chat-latest',
  analysisCodeReportModel:
    optionalEnv('ANALYSIS_CODE_REPORT_MODEL') ||
    optionalEnv('ANALYSIS_CODE_EXTRACT_MODEL') ||
    optionalEnv('ANALYSIS_CODE_LIGHT_MODEL') ||
    'gpt-5.2-chat-latest',
  analysisCodeUseWebSearch: process.env.ANALYSIS_CODE_USE_WEB_SEARCH !== 'false',
  analysisCodeSearchContextSize: (process.env.ANALYSIS_CODE_SEARCH_CONTEXT_SIZE || 'high') as
    | 'low'
    | 'medium'
    | 'high',
  analysisCodeRequestConcurrency: parseInt(process.env.ANALYSIS_CODE_REQUEST_CONCURRENCY || '12'),
  analysisCodeMaxRetries: parseInt(process.env.ANALYSIS_CODE_MAX_RETRIES || '3'),
  analysisCodeRetryDelayMs: parseInt(process.env.ANALYSIS_CODE_RETRY_DELAY_MS || '1000'),
  analysisCodeAnalysisRetryDelayMs: parseInt(
    process.env.ANALYSIS_CODE_ANALYSIS_RETRY_DELAY_MS || process.env.ANALYSIS_CODE_RETRY_DELAY_MS || '5000'
  ),
  analysisCodeAuditRetryDelayMs: parseInt(
    process.env.ANALYSIS_CODE_AUDIT_RETRY_DELAY_MS || process.env.ANALYSIS_CODE_RETRY_DELAY_MS || '8000'
  ),

  // Allowed frontend origins for CORS
  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'https://polyinsight.online').split(','),
}
