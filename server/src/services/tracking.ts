import { supabase } from './supabase.js'

export type SourceType = 'campaign' | 'referral' | 'organic' | 'direct' | 'unknown'
export type GrowthGroupBy = 'source_type' | 'source_platform' | 'campaign_code'

export interface AttributionSourceBucket {
  campaignCode: string | null
  sourceType: SourceType | null
  sourcePlatform: string | null
}

const VALID_SOURCE_TYPES = new Set<SourceType>([
  'campaign',
  'referral',
  'organic',
  'direct',
  'unknown',
])

function isMissingSchemaError(
  error: { code?: string; message?: string; details?: string | null; hint?: string | null },
  identifiers: string[],
): boolean {
  const message = [error.code, error.message, error.details, error.hint].filter(Boolean).join(' ')
  return identifiers.some((identifier) => new RegExp(identifier, 'i').test(message))
    && /column|schema cache|table|relation|does not exist|not found|PGRST205|42703|42P01/i.test(message)
}

export interface VisitSessionRow {
  id: string
  visitor_id: string
  user_id: string | null
  campaign_code: string | null
  referral_code: string | null
  source_type: SourceType
  source_platform: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_content: string | null
  referrer_url: string | null
  referrer_host: string | null
  landing_path: string | null
  landing_query: string | null
  locale: string | null
  user_agent: string | null
  first_seen_at: string
  last_seen_at: string
  created_at: string
  updated_at: string
}

export interface UserAttributionRow {
  user_id: string
  first_session_id: string | null
  first_campaign_code: string | null
  first_referral_code: string | null
  first_source_type: SourceType | null
  first_source_platform: string | null
  last_session_id: string | null
  last_campaign_code: string | null
  last_referral_code: string | null
  last_source_type: SourceType | null
  last_source_platform: string | null
  registered_at: string
  first_analysis_record_id: string | null
  first_analysis_at: string | null
  first_paid_order_id: string | null
  first_paid_at: string | null
  approved_order_count: number
  approved_order_revenue_tokens: number | string
  created_at: string
  updated_at: string
}

export interface TrackingSessionInput {
  sessionId: string
  visitorId: string
  userId?: string | null
  campaignCode?: string | null
  referralCode?: string | null
  sourceType?: string | null
  sourcePlatform?: string | null
  utmSource?: string | null
  utmMedium?: string | null
  utmCampaign?: string | null
  utmContent?: string | null
  referrerUrl?: string | null
  landingPath?: string | null
  landingQuery?: string | null
  locale?: string | null
  userAgent?: string | null
}

export interface GrowthEventInput {
  eventName: string
  sessionId?: string | null
  visitorId?: string | null
  userId?: string | null
  pagePath?: string | null
  campaignCode?: string | null
  referralCode?: string | null
  sourceType?: string | null
  sourcePlatform?: string | null
  metadata?: Record<string, unknown>
}

export interface AttributionSnapshot {
  sessionId: string | null
  visitorId: string | null
  campaignCode: string | null
  referralCode: string | null
  sourceType: SourceType | null
  sourcePlatform: string | null
}

interface NormalizedTrackingSessionInput {
  sessionId: string
  visitorId: string
  userId: string | null
  campaignCode: string | null
  referralCode: string | null
  sourceType: SourceType
  sourcePlatform: string | null
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  utmContent: string | null
  referrerUrl: string | null
  referrerHost: string | null
  landingPath: string | null
  landingQuery: string | null
  locale: string | null
  userAgent: string | null
}

export interface GrowthSummary {
  visits: number
  uniqueVisitors: number
  registrations: number
  firstAnalyses: number
  payers: number
  approvedOrders: number
  revenueTokens: number
}

export interface GrowthSeriesPoint {
  date: string
  visits: number
  registrations: number
  firstAnalyses: number
  payers: number
  approvedOrders: number
  revenueTokens: number
}

export interface GrowthBreakdownRow {
  key: string
  label: string
  visits: number
  uniqueVisitors: number
  registrations: number
  firstAnalyses: number
  payers: number
  approvedOrders: number
  revenueTokens: number
  visitToRegisterRate: number
  registerToFirstAnalysisRate: number
  registerToPayRate: number
}

function normalizeText(value: unknown, maxLength = 160): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, maxLength)
}

function normalizeIdentifier(value: unknown): string | null {
  const normalized = normalizeText(value, 120)
  if (!normalized) return null
  return normalized.replace(/[^A-Za-z0-9:_-]/g, '')
}

function normalizePath(value: unknown): string | null {
  const normalized = normalizeText(value, 240)
  if (!normalized) return null
  return normalized.startsWith('/') ? normalized : `/${normalized}`
}

function normalizeSourceType(value: unknown): SourceType | null {
  if (typeof value !== 'string') return null
  const lower = value.trim().toLowerCase() as SourceType
  return VALID_SOURCE_TYPES.has(lower) ? lower : null
}

function normalizeReferrerHost(value: string | null): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return normalizeText(url.hostname.replace(/^www\./i, ''), 120)
  } catch {
    return null
  }
}

function deriveSourceType(input: {
  sourceType?: SourceType | null
  campaignCode?: string | null
  referralCode?: string | null
  utmSource?: string | null
  utmMedium?: string | null
  utmCampaign?: string | null
  utmContent?: string | null
  referrerHost?: string | null
}): SourceType {
  if (input.sourceType && VALID_SOURCE_TYPES.has(input.sourceType)) {
    return input.sourceType
  }

  if (input.campaignCode) return 'campaign'
  if (input.referralCode) return 'referral'
  if (input.utmSource || input.utmMedium || input.utmCampaign || input.utmContent || input.referrerHost) {
    return 'organic'
  }
  return 'direct'
}

function deriveSourcePlatform(input: {
  sourcePlatform?: string | null
  utmSource?: string | null
  referrerHost?: string | null
  referralCode?: string | null
  sourceType?: SourceType | null
}): string | null {
  if (input.sourcePlatform) return input.sourcePlatform
  if (input.utmSource) return input.utmSource
  if (input.referrerHost) return input.referrerHost
  if (input.referralCode) return 'referral'
  if (input.sourceType === 'direct') return 'direct'
  return null
}

function mergeText(nextValue: string | null, previousValue: string | null): string | null {
  return nextValue || previousValue || null
}

function mergeSourceType(nextValue: SourceType | null, previousValue: SourceType | null): SourceType {
  return nextValue || previousValue || 'direct'
}

function hasNonDirectAttribution(snapshot: Pick<AttributionSnapshot, 'campaignCode' | 'referralCode' | 'sourceType'>): boolean {
  return Boolean(
    snapshot.campaignCode ||
    snapshot.referralCode ||
    (snapshot.sourceType && snapshot.sourceType !== 'direct' && snapshot.sourceType !== 'unknown')
  )
}

function toDayKey(value: string | null | undefined): string | null {
  if (!value) return null
  return value.slice(0, 10)
}

function toNumeric(value: number | string | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function safeMetadata(value: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!value) return {}
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>
}

function getBreakdownLabel(groupBy: GrowthGroupBy, key: string): string {
  if (!key) {
    return groupBy === 'campaign_code' ? 'No campaign' : 'Unknown'
  }

  if (groupBy === 'source_type') {
    const labels: Record<string, string> = {
      campaign: 'Campaign',
      referral: 'Referral',
      organic: 'Organic',
      direct: 'Direct',
      unknown: 'Unknown',
    }
    return labels[key] || key
  }

  return key
}

function getGrowthBucketKey(
  groupBy: GrowthGroupBy,
  source: {
    campaignCode?: string | null
    sourceType?: string | null
    sourcePlatform?: string | null
  },
): string {
  if (groupBy === 'campaign_code') {
    return source.campaignCode || ''
  }
  if (groupBy === 'source_platform') {
    return source.sourcePlatform || ''
  }
  return source.sourceType || 'unknown'
}

function normalizeTrackingSessionInput(raw: TrackingSessionInput): NormalizedTrackingSessionInput {
  const sessionId = normalizeIdentifier(raw.sessionId)
  const visitorId = normalizeIdentifier(raw.visitorId)

  if (!sessionId) throw new Error('TRACKING_SESSION_ID_REQUIRED')
  if (!visitorId) throw new Error('TRACKING_VISITOR_ID_REQUIRED')

  const campaignCode = normalizeText(raw.campaignCode, 120)
  const referralCode = normalizeText(raw.referralCode, 48)
  const referrerUrl = normalizeText(raw.referrerUrl, 500)
  const referrerHost = normalizeReferrerHost(referrerUrl)
  const sourceType = deriveSourceType({
    sourceType: normalizeSourceType(raw.sourceType),
    campaignCode,
    referralCode,
    utmSource: normalizeText(raw.utmSource, 120),
    utmMedium: normalizeText(raw.utmMedium, 120),
    utmCampaign: normalizeText(raw.utmCampaign, 160),
    utmContent: normalizeText(raw.utmContent, 160),
    referrerHost,
  })
  const sourcePlatform = deriveSourcePlatform({
    sourcePlatform: normalizeText(raw.sourcePlatform, 120),
    utmSource: normalizeText(raw.utmSource, 120),
    referrerHost,
    referralCode,
    sourceType,
  })

  return {
    sessionId,
    visitorId,
    userId: normalizeText(raw.userId, 160),
    campaignCode,
    referralCode,
    sourceType,
    sourcePlatform,
    utmSource: normalizeText(raw.utmSource, 120),
    utmMedium: normalizeText(raw.utmMedium, 120),
    utmCampaign: normalizeText(raw.utmCampaign, 160),
    utmContent: normalizeText(raw.utmContent, 160),
    referrerUrl,
    referrerHost,
    landingPath: normalizePath(raw.landingPath),
    landingQuery: normalizeText(raw.landingQuery, 1000),
    locale: normalizeText(raw.locale, 32),
    userAgent: normalizeText(raw.userAgent, 500),
  }
}

export async function getVisitSession(sessionId: string): Promise<VisitSessionRow | null> {
  const normalizedId = normalizeIdentifier(sessionId)
  if (!normalizedId) return null

  const { data, error } = await supabase
    .from('visit_sessions')
    .select('*')
    .eq('id', normalizedId)
    .maybeSingle()

  if (error) {
    if (isMissingSchemaError(error, ['visit_sessions'])) {
      return null
    }
    throw error
  }
  return (data as VisitSessionRow | null) || null
}

export async function upsertVisitSession(raw: TrackingSessionInput): Promise<VisitSessionRow> {
  const input = normalizeTrackingSessionInput(raw)
  const now = new Date().toISOString()
  const existing = await getVisitSession(input.sessionId)

  const mergedSourceType = mergeSourceType(input.sourceType, existing?.source_type || null)
  const mergedSourcePlatform = deriveSourcePlatform({
    sourcePlatform: mergeText(input.sourcePlatform, existing?.source_platform || null),
    utmSource: mergeText(input.utmSource, existing?.utm_source || null),
    referrerHost: mergeText(input.referrerHost, existing?.referrer_host || null),
    referralCode: mergeText(input.referralCode, existing?.referral_code || null),
    sourceType: mergedSourceType,
  })

  const payload = {
    id: input.sessionId,
    visitor_id: existing?.visitor_id || input.visitorId,
    user_id: input.userId || existing?.user_id || null,
    campaign_code: mergeText(input.campaignCode, existing?.campaign_code || null),
    referral_code: mergeText(input.referralCode, existing?.referral_code || null),
    source_type: mergedSourceType,
    source_platform: mergedSourcePlatform,
    utm_source: mergeText(input.utmSource, existing?.utm_source || null),
    utm_medium: mergeText(input.utmMedium, existing?.utm_medium || null),
    utm_campaign: mergeText(input.utmCampaign, existing?.utm_campaign || null),
    utm_content: mergeText(input.utmContent, existing?.utm_content || null),
    referrer_url: mergeText(input.referrerUrl, existing?.referrer_url || null),
    referrer_host: mergeText(input.referrerHost, existing?.referrer_host || null),
    landing_path: mergeText(input.landingPath, existing?.landing_path || null),
    landing_query: mergeText(input.landingQuery, existing?.landing_query || null),
    locale: mergeText(input.locale, existing?.locale || null),
    user_agent: mergeText(input.userAgent, existing?.user_agent || null),
    first_seen_at: existing?.first_seen_at || now,
    last_seen_at: now,
    created_at: existing?.created_at || now,
    updated_at: now,
  }

  const { data, error } = await supabase
    .from('visit_sessions')
    .upsert(payload)
    .select('*')
    .single()

  if (error || !data) {
    if (error && isMissingSchemaError(error, ['visit_sessions'])) {
      return {
        id: payload.id,
        visitor_id: payload.visitor_id,
        user_id: payload.user_id,
        campaign_code: payload.campaign_code,
        referral_code: payload.referral_code,
        source_type: payload.source_type,
        source_platform: payload.source_platform,
        utm_source: payload.utm_source,
        utm_medium: payload.utm_medium,
        utm_campaign: payload.utm_campaign,
        utm_content: payload.utm_content,
        referrer_url: payload.referrer_url,
        referrer_host: payload.referrer_host,
        landing_path: payload.landing_path,
        landing_query: payload.landing_query,
        locale: payload.locale,
        user_agent: payload.user_agent,
        first_seen_at: payload.first_seen_at,
        last_seen_at: payload.last_seen_at,
        created_at: payload.created_at,
        updated_at: payload.updated_at,
      }
    }
    throw error || new Error('Failed to upsert visit session')
  }
  return data as VisitSessionRow
}

export function buildAttributionSnapshot(
  session: Pick<
    VisitSessionRow,
    'id' | 'visitor_id' | 'campaign_code' | 'referral_code' | 'source_type' | 'source_platform'
  >,
): AttributionSnapshot {
  return {
    sessionId: session.id,
    visitorId: session.visitor_id,
    campaignCode: session.campaign_code || null,
    referralCode: session.referral_code || null,
    sourceType: session.source_type || 'direct',
    sourcePlatform: session.source_platform || null,
  }
}

export async function getAttributionSnapshotBySessionId(sessionId?: string | null): Promise<AttributionSnapshot | null> {
  if (!sessionId) return null
  const session = await getVisitSession(sessionId)
  return session ? buildAttributionSnapshot(session) : null
}

export async function bindVisitSessionToUser(
  sessionId: string,
  userId: string,
  registeredAt?: string,
): Promise<VisitSessionRow | null> {
  const session = await getVisitSession(sessionId)
  if (!session) return null

  let nextSession = session
  if (session.user_id !== userId) {
    const { data, error } = await supabase
      .from('visit_sessions')
      .update({
        user_id: userId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', session.id)
      .select('*')
      .single()

    if (error || !data) throw error || new Error('Failed to bind visit session to user')
    nextSession = data as VisitSessionRow
  }

  await upsertUserAttributionFromSession(userId, nextSession, registeredAt)
  return nextSession
}

async function upsertUserAttributionFromSession(
  userId: string,
  session: VisitSessionRow,
  registeredAt?: string,
): Promise<UserAttributionRow> {
  const now = new Date().toISOString()
  const existing = await getUserAttribution(userId)
  const snapshot = buildAttributionSnapshot(session)
  const shouldUpdateLast = hasNonDirectAttribution(snapshot) || !existing
  const effectiveRegisteredAt = existing?.registered_at || await resolveRegisteredAt(userId, registeredAt || null)

  const payload = {
    user_id: userId,
    first_session_id: existing?.first_session_id || session.id,
    first_campaign_code: existing?.first_campaign_code ?? session.campaign_code ?? null,
    first_referral_code: existing?.first_referral_code ?? session.referral_code ?? null,
    first_source_type: existing?.first_source_type ?? session.source_type ?? 'direct',
    first_source_platform: existing?.first_source_platform ?? session.source_platform ?? null,
    last_session_id: shouldUpdateLast ? session.id : existing?.last_session_id || session.id,
    last_campaign_code: shouldUpdateLast ? session.campaign_code || null : existing?.last_campaign_code || null,
    last_referral_code: shouldUpdateLast ? session.referral_code || null : existing?.last_referral_code || null,
    last_source_type: shouldUpdateLast ? session.source_type || 'direct' : existing?.last_source_type || 'direct',
    last_source_platform: shouldUpdateLast
      ? session.source_platform || null
      : existing?.last_source_platform || null,
    registered_at: effectiveRegisteredAt,
    first_analysis_record_id: existing?.first_analysis_record_id || null,
    first_analysis_at: existing?.first_analysis_at || null,
    first_paid_order_id: existing?.first_paid_order_id || null,
    first_paid_at: existing?.first_paid_at || null,
    approved_order_count: existing?.approved_order_count || 0,
    approved_order_revenue_tokens: toNumeric(existing?.approved_order_revenue_tokens),
    created_at: existing?.created_at || now,
    updated_at: now,
  }

  const { data, error } = await supabase
    .from('user_attribution')
    .upsert(payload)
    .select('*')
    .single()

  if (error || !data) {
    if (error && isMissingSchemaError(error, ['user_attribution'])) {
      return {
        user_id: userId,
        first_session_id: payload.first_session_id,
        first_campaign_code: payload.first_campaign_code,
        first_referral_code: payload.first_referral_code,
        first_source_type: payload.first_source_type,
        first_source_platform: payload.first_source_platform,
        last_session_id: payload.last_session_id,
        last_campaign_code: payload.last_campaign_code,
        last_referral_code: payload.last_referral_code,
        last_source_type: payload.last_source_type,
        last_source_platform: payload.last_source_platform,
        registered_at: payload.registered_at,
        first_analysis_record_id: null,
        first_analysis_at: null,
        first_paid_order_id: null,
        first_paid_at: null,
        approved_order_count: 0,
        approved_order_revenue_tokens: 0,
        created_at: payload.created_at,
        updated_at: payload.updated_at,
      }
    }
    throw error || new Error('Failed to upsert user attribution')
  }
  return data as UserAttributionRow
}

export async function getUserAttribution(userId: string): Promise<UserAttributionRow | null> {
  const { data, error } = await supabase
    .from('user_attribution')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    if (isMissingSchemaError(error, ['user_attribution'])) {
      return null
    }
    throw error
  }
  return (data as UserAttributionRow | null) || null
}

export async function recordGrowthEvent(input: GrowthEventInput): Promise<void> {
  const eventName = normalizeText(input.eventName, 80)
  if (!eventName) {
    throw new Error('TRACKING_EVENT_NAME_REQUIRED')
  }

  const session = input.sessionId ? await getVisitSession(input.sessionId) : null
  const snapshot = session ? buildAttributionSnapshot(session) : null

  const payload = {
    session_id: normalizeIdentifier(input.sessionId) || snapshot?.sessionId || null,
    visitor_id: normalizeIdentifier(input.visitorId) || snapshot?.visitorId || null,
    user_id: normalizeText(input.userId, 160) || session?.user_id || null,
    event_name: eventName,
    page_path: normalizePath(input.pagePath),
    campaign_code: normalizeText(input.campaignCode, 120) || snapshot?.campaignCode || null,
    referral_code: normalizeText(input.referralCode, 48) || snapshot?.referralCode || null,
    source_type:
      normalizeSourceType(input.sourceType) ||
      snapshot?.sourceType ||
      session?.source_type ||
      'direct',
    source_platform:
      normalizeText(input.sourcePlatform, 120) ||
      snapshot?.sourcePlatform ||
      session?.source_platform ||
      null,
    metadata: safeMetadata(input.metadata),
  }

  const { error } = await supabase.from('growth_events').insert(payload)
  if (error) {
    if (isMissingSchemaError(error, ['growth_events'])) {
      return
    }
    throw error
  }
}

export async function markFirstCompletedAnalysis(params: {
  userId: string
  analysisRecordId: string
  sessionId?: string | null
  completedAt?: string
  campaignCode?: string | null
  referralCode?: string | null
  sourceType?: string | null
  sourcePlatform?: string | null
  eventUrl?: string | null
}): Promise<void> {
  const now = params.completedAt || new Date().toISOString()
  const existing = await getUserAttribution(params.userId)

  if (!existing) {
    const fallbackSessionId = normalizeIdentifier(params.sessionId)
    const fallbackSession = fallbackSessionId ? await getVisitSession(fallbackSessionId) : null
    if (fallbackSession) {
      await upsertUserAttributionFromSession(params.userId, fallbackSession)
    } else {
      const fallbackSourceType = normalizeSourceType(params.sourceType) || 'direct'
      const registeredAt = await resolveRegisteredAt(params.userId)
      const { error } = await supabase
        .from('user_attribution')
        .upsert({
          user_id: params.userId,
          first_session_id: fallbackSessionId || null,
          first_campaign_code: normalizeText(params.campaignCode, 120),
          first_referral_code: normalizeText(params.referralCode, 48),
          first_source_type: fallbackSourceType,
          first_source_platform: normalizeText(params.sourcePlatform, 120),
          last_session_id: fallbackSessionId || null,
          last_campaign_code: normalizeText(params.campaignCode, 120),
          last_referral_code: normalizeText(params.referralCode, 48),
          last_source_type: fallbackSourceType,
          last_source_platform: normalizeText(params.sourcePlatform, 120),
          registered_at: registeredAt,
          created_at: now,
          updated_at: now,
        })

      if (error) throw error
    }
  }

  const current = await getUserAttribution(params.userId)
  if (!current) return

  const updatePayload: Record<string, unknown> = {
    updated_at: now,
  }

  if (!current.first_analysis_at) {
    updatePayload.first_analysis_at = now
    updatePayload.first_analysis_record_id = params.analysisRecordId
  }

  const { error } = await supabase
    .from('user_attribution')
    .update(updatePayload)
    .eq('user_id', params.userId)

  if (error) throw error

  await recordGrowthEvent({
    eventName: 'analysis_completed',
    sessionId: params.sessionId,
    userId: params.userId,
    pagePath: '/analyze',
    campaignCode: params.campaignCode,
    referralCode: params.referralCode,
    sourceType: params.sourceType,
    sourcePlatform: params.sourcePlatform,
    metadata: {
      analysisRecordId: params.analysisRecordId,
      eventUrl: params.eventUrl || null,
    },
  })
}

export async function markApprovedBillingOrder(params: {
  orderId: string
  userId: string
  sessionId?: string | null
  approvedAt?: string | null
  campaignCode?: string | null
  referralCode?: string | null
  sourceType?: string | null
  sourcePlatform?: string | null
  amountTokens: number
  planId: string
}): Promise<void> {
  const now = params.approvedAt || new Date().toISOString()
  const existing = await getUserAttribution(params.userId)

  if (!existing) {
    const sessionId = normalizeIdentifier(params.sessionId)
    const fallbackSession = sessionId ? await getVisitSession(sessionId) : null
    if (fallbackSession) {
      await upsertUserAttributionFromSession(params.userId, fallbackSession)
    } else {
      const fallbackSourceType = normalizeSourceType(params.sourceType) || 'direct'
      const registeredAt = await resolveRegisteredAt(params.userId)
      const { error } = await supabase
        .from('user_attribution')
        .upsert({
          user_id: params.userId,
          first_session_id: sessionId || null,
          first_campaign_code: normalizeText(params.campaignCode, 120),
          first_referral_code: normalizeText(params.referralCode, 48),
          first_source_type: fallbackSourceType,
          first_source_platform: normalizeText(params.sourcePlatform, 120),
          last_session_id: sessionId || null,
          last_campaign_code: normalizeText(params.campaignCode, 120),
          last_referral_code: normalizeText(params.referralCode, 48),
          last_source_type: fallbackSourceType,
          last_source_platform: normalizeText(params.sourcePlatform, 120),
          registered_at: registeredAt,
          created_at: now,
          updated_at: now,
        })

      if (error) throw error
    }
  }

  const current = await getUserAttribution(params.userId)
  if (!current) return

  const updatePayload: Record<string, unknown> = {
    approved_order_count: (current.approved_order_count || 0) + 1,
    approved_order_revenue_tokens:
      toNumeric(current.approved_order_revenue_tokens) + params.amountTokens,
    updated_at: now,
  }

  if (!current.first_paid_at) {
    updatePayload.first_paid_at = now
    updatePayload.first_paid_order_id = params.orderId
  }

  const { error } = await supabase
    .from('user_attribution')
    .update(updatePayload)
    .eq('user_id', params.userId)

  if (error) throw error

  await recordGrowthEvent({
    eventName: 'payment_approved',
    sessionId: params.sessionId,
    userId: params.userId,
    pagePath: '/billing',
    campaignCode: params.campaignCode,
    referralCode: params.referralCode,
    sourceType: params.sourceType,
    sourcePlatform: params.sourcePlatform,
    metadata: {
      orderId: params.orderId,
      amountTokens: params.amountTokens,
      planId: params.planId,
    },
  })
}

interface SessionSourceRecord {
  visitor_id?: string | null
  campaign_code: string | null
  source_type: string | null
  source_platform: string | null
  first_seen_at?: string | null
}

function toAttributionSourceBucket(source: {
  campaignCode?: string | null
  sourceType?: string | null
  sourcePlatform?: string | null
}): AttributionSourceBucket {
  return {
    campaignCode: source.campaignCode || null,
    sourceType: (normalizeSourceType(source.sourceType) || 'direct'),
    sourcePlatform: source.sourcePlatform || null,
  }
}

export function buildVisitorFirstTouchMap(
  sessions: SessionSourceRecord[],
): Map<string, AttributionSourceBucket> {
  const sorted = [...sessions].sort((left, right) => {
    const leftTime = Date.parse(left.first_seen_at || '')
    const rightTime = Date.parse(right.first_seen_at || '')
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
      return leftTime - rightTime
    }
    return 0
  })

  const map = new Map<string, AttributionSourceBucket>()
  for (const session of sorted) {
    const visitorId = normalizeIdentifier(session.visitor_id)
    if (!visitorId || map.has(visitorId)) continue

    map.set(visitorId, toAttributionSourceBucket({
      campaignCode: session.campaign_code,
      sourceType: session.source_type,
      sourcePlatform: session.source_platform,
    }))
  }

  return map
}

async function getUserCreatedAt(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('users')
    .select('created_at')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw error
  return normalizeText(data?.created_at, 64)
}

async function resolveRegisteredAt(userId: string, preferred?: string | null): Promise<string> {
  const normalizedPreferred = normalizeText(preferred, 64)
  if (normalizedPreferred) return normalizedPreferred

  const userCreatedAt = await getUserCreatedAt(userId)
  return userCreatedAt || new Date().toISOString()
}

function ensureGrowthBreakdownRow(
  map: Map<string, GrowthBreakdownRow & { visitorIds: Set<string> }>,
  groupBy: GrowthGroupBy,
  source: {
    campaignCode?: string | null
    sourceType?: string | null
    sourcePlatform?: string | null
  },
): GrowthBreakdownRow & { visitorIds: Set<string> } {
  const key = getGrowthBucketKey(groupBy, source)
  const existing = map.get(key)
  if (existing) return existing

  const created = {
    key,
    label: getBreakdownLabel(groupBy, key),
    visits: 0,
    uniqueVisitors: 0,
    registrations: 0,
    firstAnalyses: 0,
    payers: 0,
    approvedOrders: 0,
    revenueTokens: 0,
    visitToRegisterRate: 0,
    registerToFirstAnalysisRate: 0,
    registerToPayRate: 0,
    visitorIds: new Set<string>(),
  }

  map.set(key, created)
  return created
}

function buildDateSeries(days: number): string[] {
  const dates: string[] = []
  for (let index = days - 1; index >= 0; index -= 1) {
    const date = new Date(Date.now() - index * 24 * 60 * 60 * 1000)
    dates.push(date.toISOString().slice(0, 10))
  }
  return dates
}

export async function getGrowthAnalytics(days = 30, groupBy: GrowthGroupBy = 'source_platform'): Promise<{
  summary: GrowthSummary
  series: GrowthSeriesPoint[]
  breakdown: GrowthBreakdownRow[]
}> {
  const normalizedDays = Math.min(Math.max(Math.trunc(days) || 30, 1), 180)
  const cutoff = new Date(Date.now() - (normalizedDays - 1) * 24 * 60 * 60 * 1000)
  cutoff.setUTCHours(0, 0, 0, 0)
  const cutoffIso = cutoff.toISOString()

  const [
    { data: sessions, error: sessionsError },
    { data: registrations, error: registrationsError },
    { data: firstAnalyses, error: firstAnalysesError },
    { data: firstPayers, error: firstPayersError },
    { data: approvedOrders, error: approvedOrdersError },
  ] = await Promise.all([
    supabase
      .from('visit_sessions')
      .select('id, visitor_id, campaign_code, source_type, source_platform, first_seen_at')
      .gte('first_seen_at', cutoffIso),
    supabase
      .from('user_attribution')
      .select('user_id, first_campaign_code, first_source_type, first_source_platform, registered_at')
      .gte('registered_at', cutoffIso),
    supabase
      .from('user_attribution')
      .select('user_id, first_campaign_code, first_source_type, first_source_platform, first_analysis_at')
      .not('first_analysis_at', 'is', null)
      .gte('first_analysis_at', cutoffIso),
    supabase
      .from('user_attribution')
      .select('user_id, first_campaign_code, first_source_type, first_source_platform, first_paid_at')
      .not('first_paid_at', 'is', null)
      .gte('first_paid_at', cutoffIso),
    supabase
      .from('billing_orders')
      .select(`
        id,
        user_id,
        expected_amount_tokens,
        approved_at,
        attribution_campaign_code,
        attribution_source_type,
        attribution_source_platform
      `)
      .eq('status', 'approved')
      .not('approved_at', 'is', null)
      .gte('approved_at', cutoffIso),
  ])

  const schemaMissing = [sessionsError, registrationsError, firstAnalysesError, firstPayersError, approvedOrdersError]
    .filter(Boolean)
    .some((error) => isMissingSchemaError(error!, [
      'visit_sessions',
      'user_attribution',
      'analysis_records\\.attribution_',
      'billing_orders\\.attribution_',
    ]))

  if (schemaMissing) {
    const seriesDates = buildDateSeries(normalizedDays)
    return {
      summary: {
        visits: 0,
        uniqueVisitors: 0,
        registrations: 0,
        firstAnalyses: 0,
        payers: 0,
        approvedOrders: 0,
        revenueTokens: 0,
      },
      series: seriesDates.map((date) => ({
        date,
        visits: 0,
        registrations: 0,
        firstAnalyses: 0,
        payers: 0,
        approvedOrders: 0,
        revenueTokens: 0,
      })),
      breakdown: [],
    }
  }

  if (sessionsError) throw sessionsError
  if (registrationsError) throw registrationsError
  if (firstAnalysesError) throw firstAnalysesError
  if (firstPayersError) throw firstPayersError
  if (approvedOrdersError) throw approvedOrdersError

  const visitorIds = [...new Set(
    (sessions || [])
      .map((session) => normalizeIdentifier(session.visitor_id))
      .filter((visitorId): visitorId is string => Boolean(visitorId))
  )]
  const { data: visitorSourceSessions, error: visitorSourceSessionsError } =
    visitorIds.length > 0
      ? await supabase
          .from('visit_sessions')
          .select('visitor_id, campaign_code, source_type, source_platform, first_seen_at')
          .in('visitor_id', visitorIds)
      : { data: [], error: null }

  if (visitorSourceSessionsError) throw visitorSourceSessionsError

  const visitorFirstTouchMap = buildVisitorFirstTouchMap(
    (visitorSourceSessions || []) as SessionSourceRecord[],
  )

  const approvedOrderUserIds = [...new Set(
    (approvedOrders || [])
      .map((order) => normalizeText(order.user_id, 160))
      .filter((userId): userId is string => Boolean(userId))
  )]
  const { data: approvedOrderAttribution, error: approvedOrderAttributionError } =
    approvedOrderUserIds.length > 0
      ? await supabase
          .from('user_attribution')
          .select('user_id, first_campaign_code, first_source_type, first_source_platform')
          .in('user_id', approvedOrderUserIds)
      : { data: [], error: null }

  if (approvedOrderAttributionError) throw approvedOrderAttributionError

  const approvedOrderAttributionMap = new Map(
    (approvedOrderAttribution || []).map((row) => [
      row.user_id,
      {
        campaignCode: row.first_campaign_code,
        sourceType: row.first_source_type,
        sourcePlatform: row.first_source_platform,
      },
    ]),
  )

  const seriesDates = buildDateSeries(normalizedDays)
  const seriesMap = new Map<string, GrowthSeriesPoint>(
    seriesDates.map((date) => [
      date,
      {
        date,
        visits: 0,
        registrations: 0,
        firstAnalyses: 0,
        payers: 0,
        approvedOrders: 0,
        revenueTokens: 0,
      },
    ]),
  )
  const breakdownMap = new Map<string, GrowthBreakdownRow & { visitorIds: Set<string> }>()

  for (const session of (sessions || []) as Array<VisitSessionRow>) {
    const acquisitionSource = visitorFirstTouchMap.get(session.visitor_id) || toAttributionSourceBucket({
      campaignCode: session.campaign_code,
      sourceType: session.source_type,
      sourcePlatform: session.source_platform,
    })
    const bucket = ensureGrowthBreakdownRow(breakdownMap, groupBy, {
      campaignCode: acquisitionSource.campaignCode,
      sourceType: acquisitionSource.sourceType,
      sourcePlatform: acquisitionSource.sourcePlatform,
    })
    bucket.visits += 1
    if (session.visitor_id) {
      bucket.visitorIds.add(session.visitor_id)
    }

    const dayKey = toDayKey(session.first_seen_at)
    const point = dayKey ? seriesMap.get(dayKey) : null
    if (point) {
      point.visits += 1
    }
  }

  for (const row of registrations || []) {
    const bucket = ensureGrowthBreakdownRow(breakdownMap, groupBy, {
      campaignCode: row.first_campaign_code,
      sourceType: row.first_source_type,
      sourcePlatform: row.first_source_platform,
    })
    bucket.registrations += 1

    const dayKey = toDayKey(row.registered_at)
    const point = dayKey ? seriesMap.get(dayKey) : null
    if (point) {
      point.registrations += 1
    }
  }

  for (const row of firstAnalyses || []) {
    const bucket = ensureGrowthBreakdownRow(breakdownMap, groupBy, {
      campaignCode: row.first_campaign_code,
      sourceType: row.first_source_type,
      sourcePlatform: row.first_source_platform,
    })
    bucket.firstAnalyses += 1

    const dayKey = toDayKey(row.first_analysis_at)
    const point = dayKey ? seriesMap.get(dayKey) : null
    if (point) {
      point.firstAnalyses += 1
    }
  }

  for (const row of firstPayers || []) {
    const bucket = ensureGrowthBreakdownRow(breakdownMap, groupBy, {
      campaignCode: row.first_campaign_code,
      sourceType: row.first_source_type,
      sourcePlatform: row.first_source_platform,
    })
    bucket.payers += 1

    const dayKey = toDayKey(row.first_paid_at)
    const point = dayKey ? seriesMap.get(dayKey) : null
    if (point) {
      point.payers += 1
    }
  }

  for (const order of approvedOrders || []) {
    const acquisitionSource = approvedOrderAttributionMap.get(order.user_id || '') || {
      campaignCode: order.attribution_campaign_code,
      sourceType: order.attribution_source_type,
      sourcePlatform: order.attribution_source_platform,
    }
    const bucket = ensureGrowthBreakdownRow(breakdownMap, groupBy, {
      campaignCode: acquisitionSource.campaignCode,
      sourceType: acquisitionSource.sourceType,
      sourcePlatform: acquisitionSource.sourcePlatform,
    })
    const amountTokens = toNumeric(order.expected_amount_tokens)
    bucket.approvedOrders += 1
    bucket.revenueTokens += amountTokens

    const dayKey = toDayKey(order.approved_at)
    const point = dayKey ? seriesMap.get(dayKey) : null
    if (point) {
      point.approvedOrders += 1
      point.revenueTokens += amountTokens
    }
  }

  const breakdown = [...breakdownMap.values()]
    .map((row) => {
      const uniqueVisitors = row.visitorIds.size
      return {
        key: row.key,
        label: row.label,
        visits: row.visits,
        uniqueVisitors,
        registrations: row.registrations,
        firstAnalyses: row.firstAnalyses,
        payers: row.payers,
        approvedOrders: row.approvedOrders,
        revenueTokens: Math.round(row.revenueTokens * 1_000_000) / 1_000_000,
        visitToRegisterRate: uniqueVisitors > 0 ? row.registrations / uniqueVisitors : 0,
        registerToFirstAnalysisRate: row.registrations > 0 ? row.firstAnalyses / row.registrations : 0,
        registerToPayRate: row.registrations > 0 ? row.payers / row.registrations : 0,
      }
    })
    .sort((left, right) => {
      if (right.revenueTokens !== left.revenueTokens) return right.revenueTokens - left.revenueTokens
      if (right.registrations !== left.registrations) return right.registrations - left.registrations
      return right.visits - left.visits
    })

  const summary: GrowthSummary = {
    visits: (sessions || []).length,
    uniqueVisitors: new Set((sessions || []).map((session) => session.visitor_id).filter(Boolean)).size,
    registrations: (registrations || []).length,
    firstAnalyses: (firstAnalyses || []).length,
    payers: (firstPayers || []).length,
    approvedOrders: (approvedOrders || []).length,
    revenueTokens:
      Math.round(
        (approvedOrders || []).reduce(
          (sum, order) => sum + toNumeric(order.expected_amount_tokens),
          0,
        ) * 1_000_000,
      ) / 1_000_000,
  }

  return {
    summary,
    series: seriesDates.map((date) => seriesMap.get(date) || {
      date,
      visits: 0,
      registrations: 0,
      firstAnalyses: 0,
      payers: 0,
      approvedOrders: 0,
      revenueTokens: 0,
    }),
    breakdown,
  }
}
