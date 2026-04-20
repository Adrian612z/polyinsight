const API_BASE = '/api'
const VISITOR_ID_KEY = 'polyinsight_visitor_id'
const SESSION_ID_KEY = 'polyinsight_session_id'
const ATTRIBUTION_KEY = 'polyinsight_last_touch'
const TRACKED_LANDING_KEY = 'polyinsight_tracked_landing'
const REFERRAL_KEY = 'polyinsight_ref'

export interface TrackingContext {
  sessionId: string
  visitorId: string
  campaignCode: string | null
  referralCode: string | null
  sourceType: string | null
  sourcePlatform: string | null
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  utmContent: string | null
  referrerUrl: string | null
  landingPath: string
  landingQuery: string
  locale: string | null
}

function safeParseJson<T>(value: string | null): T | null {
  if (!value) return null
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

function normalizeText(value: string | null | undefined, maxLength = 160): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, maxLength)
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function getOrCreateStorageId(storage: Storage, key: string): string {
  const existing = storage.getItem(key)
  if (existing) return existing

  const created = generateId()
  storage.setItem(key, created)
  return created
}

function resolveExternalReferrer(): string | null {
  const referrer = normalizeText(document.referrer, 500)
  if (!referrer) return null

  try {
    const referrerUrl = new URL(referrer)
    if (referrerUrl.host === window.location.host) return null
    return referrerUrl.toString()
  } catch {
    return null
  }
}

function cleanupMarketingParams(): void {
  const url = new URL(window.location.href)
  let changed = false

  for (const key of ['c', 'ref', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content']) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key)
      changed = true
    }
  }

  if (changed) {
    const nextUrl = `${url.pathname}${url.search}${url.hash}`
    window.history.replaceState({}, '', nextUrl)
  }
}

function hasTrackingSignal(context: Omit<TrackingContext, 'sessionId' | 'visitorId' | 'landingPath' | 'landingQuery' | 'locale'>): boolean {
  return Boolean(
    context.campaignCode ||
    context.referralCode ||
    context.utmSource ||
    context.utmMedium ||
    context.utmCampaign ||
    context.utmContent ||
    context.referrerUrl
  )
}

function inferSourceType(context: {
  campaignCode: string | null
  referralCode: string | null
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  utmContent: string | null
  referrerUrl: string | null
}): string {
  if (context.campaignCode) return 'campaign'
  if (context.referralCode) return 'referral'
  if (context.utmSource || context.utmMedium || context.utmCampaign || context.utmContent || context.referrerUrl) {
    return 'organic'
  }
  return 'direct'
}

function inferSourcePlatform(context: {
  utmSource: string | null
  referrerUrl: string | null
  referralCode: string | null
  sourceType: string
}): string | null {
  if (context.utmSource) return context.utmSource
  if (context.referrerUrl) {
    try {
      return new URL(context.referrerUrl).hostname.replace(/^www\./i, '')
    } catch {
      return null
    }
  }
  if (context.referralCode) return 'referral'
  if (context.sourceType === 'direct') return 'direct'
  return null
}

export function getTrackingSessionId(): string {
  return getOrCreateStorageId(sessionStorage, SESSION_ID_KEY)
}

export function getTrackingVisitorId(): string {
  return getOrCreateStorageId(localStorage, VISITOR_ID_KEY)
}

export function getStoredReferralCode(): string | null {
  return normalizeText(localStorage.getItem(REFERRAL_KEY), 48)
}

export function clearStoredReferralCode(): void {
  localStorage.removeItem(REFERRAL_KEY)
}

export function getTrackingContext(): TrackingContext {
  const sessionId = getTrackingSessionId()
  const visitorId = getTrackingVisitorId()
  const params = new URLSearchParams(window.location.search)
  const currentContext = {
    campaignCode: normalizeText(params.get('c') || params.get('utm_campaign'), 120),
    referralCode: normalizeText(params.get('ref'), 48),
    utmSource: normalizeText(params.get('utm_source'), 120),
    utmMedium: normalizeText(params.get('utm_medium'), 120),
    utmCampaign: normalizeText(params.get('utm_campaign'), 160),
    utmContent: normalizeText(params.get('utm_content'), 160),
    referrerUrl: resolveExternalReferrer(),
    sourceType: null as string | null,
    sourcePlatform: null as string | null,
  }

  if (currentContext.referralCode) {
    localStorage.setItem(REFERRAL_KEY, currentContext.referralCode)
  }

  const storedContext = safeParseJson<Omit<TrackingContext, 'sessionId' | 'visitorId' | 'landingPath' | 'landingQuery' | 'locale'>>(
    localStorage.getItem(ATTRIBUTION_KEY),
  )

  const effectiveCore = hasTrackingSignal(currentContext)
    ? currentContext
    : {
        campaignCode: storedContext?.campaignCode || null,
        referralCode: currentContext.referralCode || storedContext?.referralCode || null,
        utmSource: storedContext?.utmSource || null,
        utmMedium: storedContext?.utmMedium || null,
        utmCampaign: storedContext?.utmCampaign || null,
        utmContent: storedContext?.utmContent || null,
        referrerUrl: storedContext?.referrerUrl || null,
        sourceType: storedContext?.sourceType || null,
        sourcePlatform: storedContext?.sourcePlatform || null,
      }

  const sourceType = effectiveCore.sourceType || inferSourceType(effectiveCore)
  const sourcePlatform = effectiveCore.sourcePlatform || inferSourcePlatform({
    utmSource: effectiveCore.utmSource,
    referrerUrl: effectiveCore.referrerUrl,
    referralCode: effectiveCore.referralCode,
    sourceType,
  })

  if (hasTrackingSignal(effectiveCore)) {
    localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify({
      ...effectiveCore,
      sourceType,
      sourcePlatform,
    }))
  }

  return {
    sessionId,
    visitorId,
    campaignCode: effectiveCore.campaignCode,
    referralCode: effectiveCore.referralCode,
    sourceType,
    sourcePlatform,
    utmSource: effectiveCore.utmSource,
    utmMedium: effectiveCore.utmMedium,
    utmCampaign: effectiveCore.utmCampaign,
    utmContent: effectiveCore.utmContent,
    referrerUrl: effectiveCore.referrerUrl,
    landingPath: window.location.pathname || '/',
    landingQuery: window.location.search || '',
    locale: normalizeText(navigator.language, 32),
  }
}

async function postTracking(path: string, body: unknown): Promise<void> {
  await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    keepalive: true,
  })
}

export async function initializeTracking(): Promise<TrackingContext> {
  const context = getTrackingContext()
  await postTracking('/tracking/session', context)

  const trackedLanding = sessionStorage.getItem(TRACKED_LANDING_KEY)
  if (trackedLanding !== context.sessionId) {
    await postTracking('/tracking/event', {
      eventName: 'landing_view',
      sessionId: context.sessionId,
      visitorId: context.visitorId,
      pagePath: context.landingPath,
      metadata: {
        landingQuery: context.landingQuery,
      },
    })
    sessionStorage.setItem(TRACKED_LANDING_KEY, context.sessionId)
  }

  cleanupMarketingParams()
  return context
}
