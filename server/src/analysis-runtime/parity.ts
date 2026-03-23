import {
  buildWeatherProfile,
  buildWeatherResolutionSpec,
  buildWeatherSettlementRisk,
  buildWeatherStructuredContext,
  detectWeatherRouting,
  summarizeWeatherRoutingReason,
  type WeatherAnalysisPath,
} from './weather.js'
import { fetchSourceLoose, type RetrievalFetchResult } from './retrievalFetch.js'

export interface PolymarketTag {
  slug?: string
  label?: string
  name?: string
}

export interface PolymarketMarket {
  id: string
  question: string
  slug: string
  outcomes?: string | string[]
  outcomePrices?: string | string[]
  active?: boolean
  closed?: boolean
  archived?: boolean
  acceptingOrders?: boolean
  enableOrderBook?: boolean
  groupItemTitle?: string
  endDate?: string
  endDateIso?: string
  liquidity?: number | string
  liquidityNum?: number
  volume?: number | string
  volumeNum?: number
}

export interface PolymarketEvent {
  id: string
  slug: string
  title: string
  description?: string
  resolutionSource?: string
  startDate?: string
  endDate?: string
  tags?: PolymarketTag[]
  markets: PolymarketMarket[]
  eventMetadata?: {
    context_description?: string
  }
}

export interface WorkflowContext {
  event: PlannedEvent
  router: Record<string, unknown>
  analysisPlan: Record<string, unknown>
  marketSnapshot: Record<string, unknown>
  retrievalPlan: Record<string, unknown>
  retrievalPack: Record<string, unknown>
}

interface RoutedEvent extends PolymarketEvent {
  router: Record<string, unknown>
  market_type: string
  analysis_path: string
}

interface PlannedEvent extends RoutedEvent {
  analysis_plan: Record<string, unknown>
  market_snapshot: Record<string, unknown>
}

interface SportsProfile {
  applies: boolean
  sport: string | null
  league: string | null
  subtype: string | null
  reportable_note: string | null
  omitted_count: number
}

interface DeadlineContext {
  has_deadline: boolean
  deadline_iso: string | null
  deadline_status: 'none' | 'active' | 'critical' | 'expired'
  urgency: 'none' | 'long_term' | 'medium_term' | 'near_term' | 'critical' | 'expired'
  hours_to_deadline: number | null
  days_to_deadline: number | null
  freshness_window_hours: number | null
}

export async function buildWorkflowContext(event: PolymarketEvent): Promise<WorkflowContext> {
  const routedEvent = routeMarketType(event)
  const plannedEvent = buildAnalysisPlan(routedEvent)
  const retrievalPlan = buildRetrievalPlan(plannedEvent)
  const retrievalPack = await fetchRetrievalPack(retrievalPlan)

  return {
    event: plannedEvent,
    router: plannedEvent.router,
    analysisPlan: plannedEvent.analysis_plan,
    marketSnapshot: plannedEvent.market_snapshot,
    retrievalPlan,
    retrievalPack,
  }
}

function routeMarketType(event: PolymarketEvent): RoutedEvent {
  const title = String(event.title || '').trim()
  const titleLower = title.toLowerCase()
  const description = String(event.description || '')
  const resolutionSource = String(event.resolutionSource || '')
  const tags = Array.isArray(event.tags)
    ? event.tags.map((tag) => String(tag.slug || tag.label || tag.name || '').toLowerCase()).filter(Boolean)
    : []
  const allMarkets = Array.isArray(event.markets) ? event.markets : []

  function isOpenMarket(market: PolymarketMarket) {
    return market?.closed !== true && market?.archived !== true
  }

  function isTradableMarket(market: PolymarketMarket) {
    return isOpenMarket(market) && market?.acceptingOrders === true && market?.enableOrderBook !== false
  }

  const tradableMarkets = allMarkets.filter(isTradableMarket)
  const analysisMarkets =
    tradableMarkets.length > 0
      ? tradableMarkets
      : (() => {
          const openActiveMarkets = allMarkets.filter((market) => isOpenMarket(market) && market?.active !== false)
          return openActiveMarkets.length > 0 ? openActiveMarkets : allMarkets.filter(isOpenMarket)
        })()
  const omittedMarkets = allMarkets.filter((market) => !analysisMarkets.includes(market))
  const marketFilterMode =
    tradableMarkets.length > 0
      ? 'tradable_open_markets'
      : analysisMarkets.length < allMarkets.length
        ? 'open_active_markets'
        : 'all_open_markets'
  const markets = analysisMarkets

  const groupTitles = markets.map((market) => String(market.groupItemTitle || '').trim()).filter(Boolean)
  const marketQuestions = markets.map((market) => String(market.question || '').trim()).filter(Boolean)
  const marketQuestionsLower = marketQuestions.map((value) => value.toLowerCase())
  const allOutcomes = markets.flatMap((market) => parseList(market.outcomes)).map((value) => value.toLowerCase())
  const uniqueOutcomes = [...new Set(allOutcomes)]
  const hasBinaryYesNo = uniqueOutcomes.length === 2 && uniqueOutcomes.includes('yes') && uniqueOutcomes.includes('no')
  const allMarketsBinaryYesNo =
    markets.length > 0 &&
    markets.every((market) => {
      const outcomes = parseList(market.outcomes).map((value) => value.toLowerCase())
      const unique = [...new Set(outcomes)]
      return unique.length === 2 && unique.includes('yes') && unique.includes('no')
    })

  const dateLikePattern =
    /january|february|march|april|may|june|july|august|september|october|november|december|\bjan\b|\bfeb\b|\bmar\b|\bapr\b|\bjun\b|\bjul\b|\baug\b|\bsep\b|\boct\b|\bnov\b|\bdec\b|\bq[1-4]\b|\d{4}|end of|by /
  const rangeLikePattern =
    /<|>|<=|>=|less than|greater than|between|\d\s*[\-–]\s*\d|\d(?:\.\d+)?\s*(k|m|b|t|%)\+|at least|at most|or more|or less/
  const residualBucketPattern = /no ipo|no launch|no release|will .* not |won't |does not |did not |not .* by /

  const dateLikeGroupTitleCount = groupTitles.filter((value) => dateLikePattern.test(value.toLowerCase())).length
  const rangeLikeGroupTitleCount = groupTitles.filter((value) => rangeLikePattern.test(value.toLowerCase())).length
  const residualBucketCount = groupTitles.filter((value) => residualBucketPattern.test(value.toLowerCase())).length

  const fullText = [title, description, resolutionSource, ...groupTitles, ...marketQuestions]
    .join(String.fromCharCode(10))
    .toLowerCase()
  const hasDeadlineSignal = /\bby\b|\bbefore\b|no later than|by the end of|deadline|cutoff/.test(fullText) || Boolean(event.endDate)
  const hasNumericSignal =
    /\b(price|market cap|fdv|valuation|inflation|cpi|gdp|unemployment|above|below|over|under|at least|at most|reach|reaches|hit|hits|less than|greater than|between|volume|yield|rate|btc|bitcoin|eth|sol|gold|oil|stock|index|%|\$\d)\b/.test(
      fullText
    )
  const hasProceduralSignal =
    /\bofficial(?:ly)?\b|\bformal(?:ly)?\b|\bselect(?:ed|ion)\b|\bappoint(?:ed|ment)?\b|\bconfirm(?:ed|ation)?\b|\bapprove(?:d|al)?\b|\belection called\b|\belection held\b|\bvote\b|\bparliament\b|\bhouse of representatives\b|\bhouse\b|\bsenate\b|\bregulator\b|\bcommission\b|\bcourt\b|\bgovernment\b|\bcabinet\b|\bipo\b|\blaunched?\b|\breleased?\b|\bacquire[sd]?\b|\bspeaker\b|\bprime minister\b|\bpresident\b|\bconvicted\b/.test(
      fullText
    )
  const hasRuleSensitiveSignal =
    /according to|resolution source|officially announced|prison time|pregnant|relationship|oracle|what counts|resolve to yes/.test(
      fullText
    )

  const looksLikeLinkedBinaryLadder =
    allMarketsBinaryYesNo &&
    groupTitles.length > 0 &&
    dateLikeGroupTitleCount >= Math.max(1, Math.ceil(groupTitles.length / 2))
  const looksLikeNumericTimingCurve = looksLikeLinkedBinaryLadder && hasNumericSignal
  const looksLikeNumericBucketDistribution =
    allMarketsBinaryYesNo &&
    markets.length > 1 &&
    hasNumericSignal &&
    rangeLikeGroupTitleCount + residualBucketCount >= Math.max(1, Math.ceil(markets.length / 2)) &&
    !looksLikeLinkedBinaryLadder

  const exclusiveFieldTitlePattern =
    /winner|nominee|balance of power|champion|next prime minister|next president|speaker|which party|runoff|who will acquire/
  const repeatedWinPatternCount = marketQuestionsLower.filter((value) => /\bwill .* win\b/.test(value)).length
  const repeatedNomineePatternCount = marketQuestionsLower.filter((value) => /\bnomination\b|\bnominee\b/.test(value)).length
  const repeatedAcquirePatternCount = marketQuestionsLower.filter((value) => /\bacquire\b/.test(value)).length
  const repeatedScenarioPatternCount = marketQuestionsLower.filter((value) => /balance of power|senate|house|runoff/.test(value)).length
  const otherLikeCount = groupTitles.filter((value) => /^(other|another person)$/i.test(value)).length
  const looksLikeEventBundle =
    allMarketsBinaryYesNo &&
    markets.length > 1 &&
    !looksLikeLinkedBinaryLadder &&
    !looksLikeNumericBucketDistribution &&
    (/^what will happen before\b/.test(titleLower) ||
      marketQuestionsLower.filter((value) => value.includes(' before ')).length >=
        Math.max(2, Math.ceil(markets.length * 0.7)))
  const looksLikeExclusiveField =
    allMarketsBinaryYesNo &&
    markets.length > 1 &&
    !looksLikeLinkedBinaryLadder &&
    !looksLikeNumericBucketDistribution &&
    !looksLikeEventBundle &&
    (exclusiveFieldTitlePattern.test(titleLower) ||
      repeatedWinPatternCount >= Math.max(2, Math.ceil(markets.length * 0.6)) ||
      repeatedNomineePatternCount >= Math.max(2, Math.ceil(markets.length * 0.4)) ||
      repeatedAcquirePatternCount >= Math.max(2, Math.ceil(markets.length * 0.5)) ||
      repeatedScenarioPatternCount >= Math.max(2, Math.ceil(markets.length * 0.5)) ||
      otherLikeCount > 0)

  const marketShape =
    markets.length > 1 || groupTitles.length > 1
      ? 'multi_market'
      : uniqueOutcomes.length > 2
        ? 'single_multi_option'
        : hasBinaryYesNo
          ? 'single_binary'
          : 'other'

  const sportsTags = new Set([
    'sports',
    'nba',
    'nfl',
    'mlb',
    'nhl',
    'soccer',
    'tennis',
    'golf',
    'mma',
    'ufc',
    'boxing',
    'f1',
    'cricket',
  ])
  const politicsTags = new Set(['politics', 'geopolitics', 'world-elections', 'elections', 'global-elections', 'us-government'])
  const financeTags = new Set(['crypto', 'finance', 'economy', 'business', 'tech', 'big-tech', 'stablecoins'])
  const weatherRouting = detectWeatherRouting({
    ...event,
    markets,
  })

  let domain = 'general'
  if (tags.some((tag) => sportsTags.has(tag))) domain = 'sports'
  else if (tags.some((tag) => politicsTags.has(tag))) domain = 'politics'
  else if (tags.some((tag) => financeTags.has(tag))) domain = 'finance'
  else if (weatherRouting) domain = weatherRouting.domain
  else if (
    tags.includes('pop-culture') ||
    tags.includes('movies') ||
    tags.includes('music') ||
    tags.includes('celebrities')
  )
    domain = 'culture'

  let marketType = 'generic_fallback'
  const reasons: string[] = []

  if (domain === 'sports') {
    marketType = 'sports_competition'
    reasons.push('sports tags dominate the event metadata')
  } else if (weatherRouting) {
    marketType = weatherRouting.marketType
    reasons.push(...weatherRouting.reasons)
    reasons.push(summarizeWeatherRoutingReason(weatherRouting.marketType))
  } else if (looksLikeNumericBucketDistribution) {
    marketType = 'numeric_bucket_distribution'
    reasons.push('event contains numeric yes/no buckets that behave like a distribution, not a single binary trade')
  } else if (looksLikeNumericTimingCurve) {
    marketType = 'numeric_timing_curve'
    reasons.push('event contains numeric threshold buckets organized by deadline')
  } else if (looksLikeLinkedBinaryLadder) {
    marketType = 'linked_binary_ladder'
    reasons.push('event contains correlated yes/no submarkets organized by date or deadline bucket')
  } else if (looksLikeExclusiveField) {
    marketType = 'exclusive_field_distribution'
    reasons.push('event contains a mutually exclusive field of candidates or scenarios represented as yes/no submarkets')
  } else if (looksLikeEventBundle) {
    marketType = 'event_bundle'
    reasons.push('event contains related but non-exclusive yes/no submarkets')
  } else if (markets.length > 1 || groupTitles.length > 1) {
    marketType = 'competitive_multi_outcome'
    reasons.push('event contains multiple linked outcomes that are not simple date buckets')
  } else if (hasBinaryYesNo && hasNumericSignal) {
    marketType = 'numeric_threshold'
    reasons.push('single yes/no market with numeric or threshold language')
  } else if (hasBinaryYesNo && hasDeadlineSignal && hasProceduralSignal) {
    marketType = 'deadline_procedural'
    reasons.push('single yes/no market with deadline language and formal process language')
  } else if (hasBinaryYesNo && hasRuleSensitiveSignal) {
    marketType = 'rule_sensitive'
    reasons.push('wording and oracle interpretation appear material to settlement')
  } else if (hasBinaryYesNo && hasDeadlineSignal) {
    marketType = 'deadline_occurrence'
    reasons.push('single yes/no market with meaningful deadline pressure')
  } else {
    reasons.push('no specialized path matched with high confidence')
  }

  const analysisPath = marketType.startsWith('numeric_')
    ? 'numeric_market'
    : marketType === 'deadline_procedural' ||
        marketType === 'linked_binary_ladder' ||
        marketType === 'sports_competition' ||
        marketType === 'weather_station_bucket' ||
        marketType === 'weather_accumulation_bucket' ||
        marketType === 'weather_first_occurrence_race' ||
        marketType === 'tropical_cyclone_event' ||
        marketType === 'climate_index_numeric'
      ? marketType
      : marketType === 'exclusive_field_distribution'
        ? 'competitive_multi_outcome'
        : 'generic_fallback'

  const routeConfidence =
    marketType === 'deadline_procedural'
      ? 0.92
      : marketType === 'numeric_timing_curve' || marketType === 'numeric_bucket_distribution'
        ? 0.9
        : marketType === 'exclusive_field_distribution'
          ? 0.88
          : marketType === 'sports_competition'
            ? 0.85
            : marketType === 'weather_station_bucket' || marketType === 'weather_accumulation_bucket'
              ? 0.88
              : marketType === 'weather_first_occurrence_race' || marketType === 'tropical_cyclone_event'
                ? 0.84
                : marketType === 'climate_index_numeric'
                  ? 0.8
            : marketType === 'numeric_threshold' ||
                marketType === 'linked_binary_ladder' ||
                marketType === 'competitive_multi_outcome'
              ? 0.8
              : marketType === 'deadline_occurrence' || marketType === 'rule_sensitive' || marketType === 'event_bundle'
                ? 0.7
                : 0.55

  const sourcePolicyByType: Record<string, string[]> = {
    deadline_procedural: ['official', 'local_major_media', 'wire'],
    linked_binary_ladder: ['official_when_available', 'deadline_specific_reporting', 'wire'],
    numeric_timing_curve: ['live_market_data', 'official_data_release', 'company_guidance', 'wire'],
    numeric_bucket_distribution: ['live_market_data', 'official_filings', 'company_guidance', 'wire'],
    numeric_threshold: ['live_market_data', 'official_data_release', 'wire'],
    exclusive_field_distribution: ['official_candidate_status', 'polling_or_odds', 'campaign_or_institutional_signals', 'major_reporting'],
    event_bundle: ['topic_specific_recent_reporting'],
    deadline_occurrence: ['primary_reporting', 'wire', 'official_when_available'],
    competitive_multi_outcome: ['official_status', 'polling_or_odds', 'major_reporting'],
    sports_competition: ['official_standings_and_schedule', 'official_injury_or_availability_reports', 'projection_or_odds_calibration', 'major_sports_reporting'],
    weather_station_bucket: ['official_station_observations', 'official_hourly_forecast', 'ensemble_weather_guidance', 'settlement_source_mirror'],
    weather_accumulation_bucket: ['official_climate_summary', 'official_precipitation_guidance', 'ensemble_weather_guidance', 'seasonal_regime_context'],
    weather_first_occurrence_race: ['official_station_observations', 'official_daily_climate_reports', 'ensemble_weather_guidance', 'settlement_tiebreak_rules'],
    tropical_cyclone_event: ['nhc_official_products', 'tropical_hazards_outlook', 'official_storm_list', 'seasonal_hurricane_context'],
    climate_index_numeric: ['official_dataset_release', 'seasonal_climate_guidance', 'official_methodology'],
    rule_sensitive: ['market_rules', 'resolution_source', 'precedent'],
    generic_fallback: ['high_quality_recent_reporting'],
  }

  const router = {
    market_type: marketType,
    analysis_path: analysisPath,
    route_confidence: routeConfidence,
    market_shape: marketShape,
    deadline_sensitivity: hasDeadlineSignal ? 'high' : 'medium',
    domain,
    source_policy: sourcePolicyByType[marketType] || sourcePolicyByType.generic_fallback,
    reasons,
    total_market_count: allMarkets.length,
    analysis_market_count: markets.length,
    omitted_market_count: omittedMarkets.length,
    market_filter_mode: marketFilterMode,
  }

  return {
    ...event,
    router,
    market_type: router.market_type,
    analysis_path: router.analysis_path,
  }
}

function buildAnalysisPlan(event: RoutedEvent): PlannedEvent {
  const router = event.router || {}
  const allMarkets = Array.isArray(event.markets) ? event.markets : []

  function isOpenMarket(market: PolymarketMarket) {
    return market?.closed !== true && market?.archived !== true
  }

  function isTradableMarket(market: PolymarketMarket) {
    return isOpenMarket(market) && market?.acceptingOrders === true && market?.enableOrderBook !== false
  }

  const tradableMarkets = allMarkets.filter(isTradableMarket)
  const analysisMarkets =
    tradableMarkets.length > 0
      ? tradableMarkets
      : (() => {
          const openActiveMarkets = allMarkets.filter((market) => isOpenMarket(market) && market?.active !== false)
          return openActiveMarkets.length > 0 ? openActiveMarkets : allMarkets.filter(isOpenMarket)
        })()
  const filteredOutMarkets = allMarkets.filter((market) => !analysisMarkets.includes(market))
  const marketFilterMode =
    tradableMarkets.length > 0
      ? 'tradable_open_markets'
      : analysisMarkets.length < allMarkets.length
        ? 'open_active_markets'
        : 'all_open_markets'
  const markets = analysisMarkets
  const primaryDeadline = resolvePrimaryDeadline(event)
  const deadlineContext = buildDeadlineContext(primaryDeadline)
  const title = String(event.title || '').trim()
  const titleLower = title.toLowerCase()
  const tags = Array.isArray(event.tags)
    ? event.tags.map((tag) => String(tag.slug || tag.label || tag.name || '').toLowerCase()).filter(Boolean)
    : []

  function inferBucket(label: string, question: string) {
    const text = [label, question].join(' ').toLowerCase()
    const values = extractNumericMatches(text)
    const scaledValues = values.map((entry) => entry.scaledValue)
    if (/no ipo|no launch|no release|will .* not |won't |does not |did not /.test(text)) {
      return { bucket_kind: 'residual', low: null, high: null, sort_key: Number.POSITIVE_INFINITY, sort_rank: 9 }
    }
    if ((/less than|under|below|at most|^</.test(text) || text.includes('<')) && scaledValues.length >= 1) {
      return { bucket_kind: 'upper', low: null, high: scaledValues[0], sort_key: scaledValues[0], sort_rank: 1 }
    }
    if ((/greater than|over|above|at least|or more/.test(text) || text.includes('+') || text.includes('>')) && scaledValues.length >= 1) {
      return { bucket_kind: 'lower', low: scaledValues[0], high: null, sort_key: scaledValues[0], sort_rank: 3 }
    }
    if ((/between/.test(text) || /[\-–]/.test(text)) && scaledValues.length >= 2) {
      return { bucket_kind: 'range', low: scaledValues[0], high: scaledValues[1], sort_key: scaledValues[0], sort_rank: 2 }
    }
    return {
      bucket_kind: 'other',
      low: scaledValues[0] ?? null,
      high: scaledValues[1] ?? null,
      sort_key: scaledValues[0] ?? Number.POSITIVE_INFINITY,
      sort_rank: 5,
    }
  }

  const normalizedMarkets = markets.map((market, index) => {
    const outcomes = parseList(market.outcomes).map((value) => String(value).trim())
    const prices = parseNumberList(market.outcomePrices)
    const options = outcomes.map((name, optionIndex) => ({
      name,
      probability: toPct(prices[optionIndex]),
    }))
    const yesIndex = outcomes.findIndex((value) => value.toLowerCase() === 'yes')
    const noIndex = outcomes.findIndex((value) => value.toLowerCase() === 'no')
    const label = String(market.groupItemTitle || market.question || `Market ${index + 1}`)
    const question = String(market.question || '')
    const bucket = inferBucket(label, question)

    return {
      index: index + 1,
      label,
      question,
      deadline: market.endDateIso || market.endDate || event.endDate || null,
      liquidity: market.liquidityNum ?? (Number.isFinite(Number(market.liquidity)) ? Number(market.liquidity) : null),
      volume: market.volumeNum ?? (Number.isFinite(Number(market.volume)) ? Number(market.volume) : null),
      options,
      yes_probability: yesIndex >= 0 ? toPct(prices[yesIndex]) : null,
      no_probability: noIndex >= 0 ? toPct(prices[noIndex]) : null,
      bucket_kind: bucket.bucket_kind,
      numeric_low: bucket.low,
      numeric_high: bucket.high,
      sort_key: bucket.sort_key,
      sort_rank: bucket.sort_rank,
    }
  })

  const allMarketsBinaryYesNo =
    normalizedMarkets.length > 0 &&
    normalizedMarkets.every((market) => market.yes_probability !== null && market.no_probability !== null)
  const questionsLower = normalizedMarkets.map((market) => String(market.question || '').toLowerCase())
  const labelsLower = normalizedMarkets.map((market) => String(market.label || '').toLowerCase())
  const sportsText = [titleLower, ...questionsLower, ...labelsLower].join('\n')

  const sportsProfile: SportsProfile = {
    applies: router.analysis_path === 'sports_competition',
    sport: null,
    league: null,
    subtype: null,
    reportable_note: null,
    omitted_count: 0,
  }
  const singleActiveMarketMultiOption = normalizedMarkets.length === 1 && ((normalizedMarkets[0]?.options as Array<unknown>)?.length || 0) > 2

  if (sportsProfile.applies) {
    const sportPriority = ['nba', 'nfl', 'mlb', 'nhl', 'soccer', 'golf', 'tennis', 'mma', 'ufc', 'boxing', 'f1', 'cricket']
    const genericTags = new Set(['sports', 'basketball', 'football', 'soccer', 'baseball', 'hockey', 'golf', 'tennis'])
    sportsProfile.sport = sportPriority.find((tag) => tags.includes(tag)) || 'sports'
    sportsProfile.league = tags.find((tag) => !genericTags.has(tag) && tag !== sportsProfile.sport) || null

    const winnerLike =
      /winner|champion|mvp|rookie of the year|player of the year|golden boot|conference champion|finals mvp|title/i.test(
        titleLower
      ) ||
      questionsLower.filter((value) => /\bwill .* win\b|\bwill .* be named\b|\bwill .* earn\b/.test(value)).length >=
        Math.max(2, Math.ceil(normalizedMarkets.length * 0.5))
    const qualificationLike =
      /qualify|qualified|promotion|promoted|relegated|make the playoffs|make the play-in|make the postseason|get relegated|advance to the playoffs/.test(
        sportsText
      )

    if (singleActiveMarketMultiOption) {
      sportsProfile.subtype = 'sports_multi_option_market'
    } else if (normalizedMarkets.length === 1 && allMarketsBinaryYesNo) {
      sportsProfile.subtype = 'sports_binary_outcome'
    } else if (winnerLike && normalizedMarkets.length > 1) {
      sportsProfile.subtype = 'sports_winner_field'
    } else if (qualificationLike && normalizedMarkets.length > 1) {
      sportsProfile.subtype = 'sports_qualification_bundle'
    } else if (normalizedMarkets.length > 1) {
      sportsProfile.subtype = 'sports_generic_multi'
    } else {
      sportsProfile.subtype = 'sports_binary_outcome'
    }
  }

  const weatherPathSet = new Set<WeatherAnalysisPath>([
    'weather_station_bucket',
    'weather_accumulation_bucket',
    'weather_first_occurrence_race',
    'tropical_cyclone_event',
    'climate_index_numeric',
  ])
  const weatherPath = weatherPathSet.has(router.analysis_path as WeatherAnalysisPath)
    ? (router.analysis_path as WeatherAnalysisPath)
    : null
  const weatherResolutionSpec = weatherPath
    ? buildWeatherResolutionSpec(event, weatherPath, normalizedMarkets, primaryDeadline)
    : null
  const weatherProfile =
    weatherPath && weatherResolutionSpec
      ? buildWeatherProfile(event, weatherPath, weatherResolutionSpec, normalizedMarkets)
      : null
  const weatherSettlementRisk =
    weatherPath && weatherResolutionSpec
      ? buildWeatherSettlementRisk(weatherPath, weatherResolutionSpec)
      : null

  let structureKind = 'generic'
  if (router.market_type === 'linked_binary_ladder') structureKind = 'timing_curve'
  else if (router.market_type === 'exclusive_field_distribution') structureKind = 'exclusive_field_distribution'
  else if (router.market_type === 'event_bundle') structureKind = 'event_bundle'
  else if (router.market_type === 'numeric_timing_curve') structureKind = 'numeric_timing_curve'
  else if (router.market_type === 'numeric_bucket_distribution') structureKind = 'numeric_bucket_distribution'
  else if (router.market_type === 'numeric_threshold') structureKind = 'numeric_threshold'
  else if (router.market_type === 'deadline_procedural') structureKind = 'deadline_procedural'
  else if (router.market_type === 'sports_competition') structureKind = 'sports_competition'
  else if (weatherPath) structureKind = weatherPath

  if (sportsProfile.applies) {
    if (sportsProfile.subtype === 'sports_winner_field') structureKind = 'sports_winner_field'
    else if (sportsProfile.subtype === 'sports_binary_outcome') structureKind = 'sports_binary_outcome'
    else if (sportsProfile.subtype === 'sports_multi_option_market') structureKind = 'sports_multi_option_market'
    else if (sportsProfile.subtype === 'sports_qualification_bundle') structureKind = 'sports_qualification_bundle'
    else structureKind = 'sports_generic_multi'
  }

  let orderedMarkets = normalizedMarkets
  if (structureKind === 'timing_curve' || structureKind === 'numeric_timing_curve') {
    const sortedByDeadline = [...normalizedMarkets].sort((a, b) => String(a.deadline || '').localeCompare(String(b.deadline || '')))
    const deadlineKeys = sortedByDeadline.map((market) => String(market.deadline || ''))
    const hasStrictlyUsefulDeadlines = deadlineKeys.every((value, index) => index === 0 || value > deadlineKeys[index - 1])
    orderedMarkets = hasStrictlyUsefulDeadlines ? sortedByDeadline : normalizedMarkets
  } else if (structureKind === 'numeric_bucket_distribution') {
    orderedMarkets = [...normalizedMarkets].sort((a, b) => {
      if (a.sort_key === b.sort_key) return a.sort_rank - b.sort_rank || a.index - b.index
      if (!Number.isFinite(a.sort_key)) return 1
      if (!Number.isFinite(b.sort_key)) return -1
      return a.sort_key - b.sort_key
    })
  } else if (
    structureKind === 'exclusive_field_distribution' ||
    structureKind === 'sports_winner_field' ||
    structureKind === 'sports_qualification_bundle' ||
    structureKind === 'sports_generic_multi'
  ) {
    orderedMarkets = [...normalizedMarkets].sort((a, b) => (b.yes_probability || 0) - (a.yes_probability || 0) || a.index - b.index)
  }

  if (structureKind === 'numeric_timing_curve') {
    orderedMarkets = orderedMarkets.map((market) => ({ ...market, numeric_low: null, numeric_high: null }))
  }

  const monotonicity: Record<string, unknown> = {
    applies: structureKind === 'timing_curve' || structureKind === 'numeric_timing_curve',
    is_monotonic: true,
    violations: [],
  }
  if (monotonicity.applies) {
    for (let index = 1; index < orderedMarkets.length; index += 1) {
      const prev = orderedMarkets[index - 1]
      const next = orderedMarkets[index]
      if (prev.yes_probability !== null && next.yes_probability !== null && next.yes_probability + 0.1 < prev.yes_probability) {
        monotonicity.is_monotonic = false
        ;(monotonicity.violations as Array<Record<string, unknown>>).push({
          earlier_bucket: prev.label,
          earlier_yes: prev.yes_probability,
          later_bucket: next.label,
          later_yes: next.yes_probability,
        })
      }
    }
  }

  const distributionCheck: Record<string, unknown> = {
    applies: structureKind === 'numeric_bucket_distribution',
    market_sum_yes: null,
  }
  if (distributionCheck.applies) {
    distributionCheck.market_sum_yes = Number(
      orderedMarkets.reduce((sum, market) => sum + (market.yes_probability || 0), 0).toFixed(2)
    )
  }

  const fieldSummary: Record<string, unknown> = {
    applies: structureKind === 'exclusive_field_distribution' || structureKind === 'sports_winner_field',
    market_sum_yes: null,
    reportable_count: 0,
    hidden_count: 0,
    tail_yes: null,
  }
  let reportableMarkets = orderedMarkets
  if (fieldSummary.applies) {
    fieldSummary.market_sum_yes = Number(orderedMarkets.reduce((sum, market) => sum + (market.yes_probability || 0), 0).toFixed(2))
    const rawOtherMarket = orderedMarkets.find((market) => /^(other|another person)$/i.test(market.label)) || null
    const otherMarket = rawOtherMarket && rawOtherMarket.yes_probability !== null ? rawOtherMarket : null
    const baseMarkets = rawOtherMarket ? orderedMarkets.filter((market) => market.index !== rawOtherMarket.index) : orderedMarkets
    const topCount = structureKind === 'sports_winner_field' ? 8 : 7
    const topMarkets = baseMarkets.slice(0, topCount)
    const includedIds = new Set(topMarkets.map((market) => market.index))
    reportableMarkets = [...topMarkets]
    if (otherMarket && !includedIds.has(otherMarket.index)) {
      reportableMarkets.push(otherMarket)
      includedIds.add(otherMarket.index)
    }
    const hiddenMarkets = orderedMarkets.filter((market) => !includedIds.has(market.index))
    const tailYes = Number(hiddenMarkets.reduce((sum, market) => sum + (market.yes_probability || 0), 0).toFixed(2))
    if (tailYes > 0.1) {
      reportableMarkets.push({
        index: 999999,
        label: otherMarket ? 'Field Tail Excluding Other' : 'Field Tail',
        question: 'Aggregate low-probability remainder of the field',
        deadline: event.endDate || null,
        liquidity: null,
        volume: null,
        options: [],
        yes_probability: tailYes,
        no_probability: null,
        bucket_kind: 'tail',
        numeric_low: null,
        numeric_high: null,
        sort_key: Number.POSITIVE_INFINITY,
        sort_rank: 99,
      })
    }
    fieldSummary.reportable_count = reportableMarkets.length
    fieldSummary.hidden_count = Math.max(
      0,
      orderedMarkets.length - reportableMarkets.filter((market) => market.bucket_kind !== 'tail').length
    )
    fieldSummary.tail_yes = tailYes
  }

  if (sportsProfile.applies && !fieldSummary.applies && orderedMarkets.length > 12) {
    if (sportsProfile.subtype === 'sports_qualification_bundle') {
      const favorites = orderedMarkets.slice(0, 5)
      const includedIds = new Set(favorites.map((market) => market.index))
      const bubbleMarkets = [...orderedMarkets]
        .filter((market) => !includedIds.has(market.index))
        .sort((a, b) => {
          const aDist = Math.abs((a.yes_probability || 0) - 50)
          const bDist = Math.abs((b.yes_probability || 0) - 50)
          return aDist - bDist || (b.yes_probability || 0) - (a.yes_probability || 0) || a.index - b.index
        })
        .slice(0, 5)
      reportableMarkets = [...favorites, ...bubbleMarkets].sort(
        (a, b) => (b.yes_probability || 0) - (a.yes_probability || 0) || a.index - b.index
      )
      sportsProfile.reportable_note =
        'Reportable set blends the highest-probability teams with bubble teams closest to the implied qualification or relegation cut line.'
    } else {
      reportableMarkets = orderedMarkets.slice(0, 10)
      sportsProfile.reportable_note = 'Reportable set is trimmed to the highest-probability sports outcomes for readability.'
    }
    sportsProfile.omitted_count = Math.max(0, orderedMarkets.length - reportableMarkets.length)
  }

  const specialInstructionsByPath: Record<string, string[]> = {
    deadline_procedural: [
      'Treat the market as a formal-process deadline question.',
      'Separate eventual occurrence from before-deadline completion.',
      'Identify the exact formal act, remaining steps, and key blocker.',
    ],
    linked_binary_ladder: [
      'Treat the event as a set of correlated yes/no deadline buckets, not mutually exclusive winners.',
      'Produce a coherent timing curve across all buckets.',
      'Preserve monotonicity across later deadline buckets.',
    ],
    competitive_multi_outcome: [
      'Treat the event as a mutually exclusive candidate or scenario field.',
      'Build a coherent distribution across reportable contenders plus tail.',
      'Avoid overconcentrating the frontrunner without strong evidence.',
    ],
    sports_competition: [
      'Treat the market as a sports-specific market whose structure is determined by sports_profile.subtype.',
      'For sports_winner_field, build a contender distribution across reportable contenders plus tail.',
      'For sports_multi_option_market, treat the active market as a mutually exclusive option set such as home/draw/away and score every actual option.',
      'For sports_binary_outcome or sports_qualification_bundle, focus on standings, schedule, injuries, and competition-format mechanics before telling a story.',
    ],
    weather_station_bucket: [
      'Treat the market as a station-level weather bucket market and define the settlement variable before discussing edge.',
      'Use weather_resolution_spec to identify the official source, local day, station, unit, and bucket edges.',
      'Model the daily max or min as a weather distribution rather than as a narrative yes/no claim.',
    ],
    weather_accumulation_bucket: [
      'Treat the market as an accumulated weather total over a defined window.',
      'Separate realized accumulation from remaining-window forecast and do not model the whole period as one unknown.',
      'Respect settlement precision, bucket edges, and any boundary rule in weather_resolution_spec.',
    ],
    weather_first_occurrence_race: [
      'Treat the market as a multi-location first-occurrence race with an explicit qualifying threshold.',
      'Model each location separately and apply the tie_break_rule exactly as written in weather_resolution_spec.',
      'Do not collapse the event into one generic weather headline.',
    ],
    tropical_cyclone_event: [
      'Treat the market as an official tropical-cyclone classification or count question.',
      'Use NHC classification timing and the market deadline, not generic storm chatter, as the settlement frame.',
      'Distinguish forecast formation risk from official designation risk.',
    ],
    climate_index_numeric: [
      'Treat the market as a climate dataset or climate-index measurement.',
      'Anchor on the official dataset definition, update cadence, and measurement convention before scoring buckets.',
      'Do not force short-range weather logic onto a long-range climate metric.',
    ],
    numeric_market: [
      'Determine the metric, unit, and settlement measurement exactly.',
      'Use current level, distance to threshold or bucket, and upcoming catalysts to build a calibrated distribution.',
      'Preserve monotonicity for timing curves and coherence for bucket distributions.',
    ],
    generic_fallback: [
      'Use the router context to decide which evidence matters most.',
      'Stay conservative when the structure is not covered by a specialized path.',
    ],
  }

  const decisionOptionRows = orderedMarkets.flatMap((market) => {
    const optionRows = Array.isArray(market.options) ? market.options : []
    const usePrefixedNames = orderedMarkets.length > 1
    return optionRows.map((option) => ({
      name: usePrefixedNames ? `${market.label} - ${option.name}` : option.name,
      market_label: market.label,
      option_name: option.name,
      market: option.probability,
    }))
  })

  const analysisPlan = {
    event_title: String(event.title || ''),
    analysis_path: router.analysis_path || 'generic_fallback',
    market_type: router.market_type || 'generic_fallback',
    structure_kind: structureKind,
    domain: router.domain || 'general',
    market_count: orderedMarkets.length,
    total_market_count: allMarkets.length,
    filtered_out_market_count: filteredOutMarkets.length,
    filtered_out_closed_count: filteredOutMarkets.filter((market) => market?.closed === true).length,
    filtered_out_archived_count: filteredOutMarkets.filter((market) => market?.archived === true).length,
    filtered_out_non_tradable_count: filteredOutMarkets.filter(
      (market) => market?.closed !== true && market?.archived !== true && market?.acceptingOrders !== true
    ).length,
    market_filter_mode: marketFilterMode,
    source_policy: router.source_policy || [],
    primary_deadline: primaryDeadline,
    deadline_context: deadlineContext,
    normalized_markets: orderedMarkets,
    reportable_markets: reportableMarkets,
    decision_option_rows: decisionOptionRows,
    monotonicity,
    distribution_check: distributionCheck,
    field_summary: fieldSummary,
    sports_profile: sportsProfile,
    weather_resolution_spec: weatherResolutionSpec,
    weather_profile: weatherProfile,
    weather_settlement_risk: weatherSettlementRisk,
    special_instructions: [
      'Only analyze the active/tradable market set in normalized_markets; filtered historical markets are context only and should not be scored.',
      ...((specialInstructionsByPath[router.analysis_path as string] || specialInstructionsByPath.generic_fallback) as string[]),
    ],
  }

  const marketSnapshot = {
    event_title: String(event.title || ''),
    description: String(event.description || ''),
    resolution_source: String(event.resolutionSource || ''),
    start_date: event.startDate || null,
    end_date: primaryDeadline,
    deadline_context: deadlineContext,
    market_count: orderedMarkets.length,
    total_market_count: allMarkets.length,
    filtered_out_market_count: filteredOutMarkets.length,
    market_filter_mode: marketFilterMode,
    hidden_market_count: fieldSummary.hidden_count,
    field_sum_yes: fieldSummary.market_sum_yes,
    markets: reportableMarkets,
    decision_option_rows: decisionOptionRows,
  }

  return {
    ...event,
    analysis_plan: analysisPlan,
    market_snapshot: marketSnapshot,
  }
}

function buildRetrievalPlan(event: PlannedEvent): Record<string, unknown> {
  const analysisPlan = event.analysis_plan || {}
  const router = event.router || {}
  const sportsProfile =
    analysisPlan.sports_profile && typeof analysisPlan.sports_profile === 'object'
      ? (analysisPlan.sports_profile as Partial<SportsProfile>)
      : {}
  const weatherResolutionSpec =
    analysisPlan.weather_resolution_spec && typeof analysisPlan.weather_resolution_spec === 'object'
      ? (analysisPlan.weather_resolution_spec as Record<string, any>)
      : null
  const weatherProfile =
    analysisPlan.weather_profile && typeof analysisPlan.weather_profile === 'object'
      ? (analysisPlan.weather_profile as Record<string, any>)
      : null
  const weatherSettlementRisk =
    analysisPlan.weather_settlement_risk && typeof analysisPlan.weather_settlement_risk === 'object'
      ? (analysisPlan.weather_settlement_risk as Record<string, any>)
      : null
  const reportableMarkets = Array.isArray(analysisPlan.reportable_markets) ? analysisPlan.reportable_markets : []
  const title = String(event.title || analysisPlan.event_title || '').trim()
  const description = String(event.description || '').trim()
  const analysisPath = String(analysisPlan.analysis_path || router.analysis_path || 'generic_fallback')
  const structureKind = String(analysisPlan.structure_kind || 'generic')
  const sourcePolicy = Array.isArray(router.source_policy) ? (router.source_policy as string[]) : []
  const primaryDeadline =
    typeof analysisPlan.primary_deadline === 'string'
      ? analysisPlan.primary_deadline
      : typeof event.endDate === 'string'
        ? event.endDate
        : null
  const deadlineContext =
    analysisPlan.deadline_context && typeof analysisPlan.deadline_context === 'object'
      ? (analysisPlan.deadline_context as DeadlineContext)
      : buildDeadlineContext(primaryDeadline)

  function cleanText(value: unknown) {
    return String(value || '')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/[^\p{L}\p{N}$%&+./:'()\-\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  function unique(values: Array<string | null>) {
    return [...new Set(values.filter(Boolean))] as string[]
  }

  function stripDeadlinePhrase(text: string) {
    return cleanText(text).replace(/\bby\b.+$/i, '').replace(/\bbefore\b.+$/i, '').replace(/\bon or before\b.+$/i, '').trim()
  }

  function extractThresholdText(text: string) {
    const match = cleanText(text).match(/\$?\d+(?:\.\d+)?\s*(?:k|m|b|t|%|x)?/i)
    return match ? match[0].replace(/\s+/g, '') : null
  }

  function extractSportsTeam(text: string) {
    const cleaned = cleanText(text)
    const patterns = [
      /^will (.+?) be promoted to/i,
      /^will (.+?) be relegated/i,
      /^will (.+?) make the /i,
      /^will (.+?) make /i,
      /^will (.+?) qualify/i,
      /^will (.+?) reach /i,
      /^will (.+?) win /i,
      /^will (.+?) earn /i,
    ]
    for (const pattern of patterns) {
      const match = cleaned.match(pattern)
      if (match) return cleanText(match[1])
    }
    return null
  }

  function buildSearchQueries(path: string, baseTopic: string, notes: Record<string, string | null>) {
    const queries = [baseTopic]
    if (path === 'deadline_procedural') {
      queries.push([baseTopic, notes.procedural_terms, 'official timeline'].filter(Boolean).join(' '))
      queries.push([baseTopic, 'Reuters', 'parliament vote approval'].filter(Boolean).join(' '))
    } else if (path === 'linked_binary_ladder') {
      queries.push([baseTopic, 'timeline deadline official'].filter(Boolean).join(' '))
      queries.push([baseTopic, notes.core_entity, 'latest update'].filter(Boolean).join(' '))
    } else if (path === 'numeric_market') {
      queries.push([notes.numeric_label || baseTopic, notes.threshold_text, 'current price market cap latest'].filter(Boolean).join(' '))
      queries.push([notes.numeric_label || baseTopic, notes.threshold_text, 'forecast catalyst deadline'].filter(Boolean).join(' '))
    } else if (path === 'competitive_multi_outcome') {
      queries.push([baseTopic, notes.core_entity, 'latest poll odds endorsements'].filter(Boolean).join(' '))
      queries.push([baseTopic, 'race update Reuters'].filter(Boolean).join(' '))
    } else if (path === 'sports_competition') {
      queries.push([notes.team_label || baseTopic, notes.league_name, 'injury standings schedule'].filter(Boolean).join(' '))
      queries.push([notes.team_label || baseTopic, notes.outcome_terms, 'latest'].filter(Boolean).join(' '))
    } else if (path === 'weather_station_bucket') {
      queries.push([notes.weather_location || baseTopic, notes.weather_variable, 'official forecast hourly'].filter(Boolean).join(' '))
      queries.push([notes.weather_location || baseTopic, notes.weather_source_name, 'station observations'].filter(Boolean).join(' '))
    } else if (path === 'weather_accumulation_bucket') {
      queries.push([notes.weather_location || baseTopic, notes.weather_variable, 'monthly climate summary'].filter(Boolean).join(' '))
      queries.push([notes.weather_location || baseTopic, 'official precipitation outlook'].filter(Boolean).join(' '))
    } else if (path === 'weather_first_occurrence_race') {
      queries.push([baseTopic, notes.weather_variable, 'daily climate report'].filter(Boolean).join(' '))
      queries.push([baseTopic, 'official snow forecast'].filter(Boolean).join(' '))
    } else if (path === 'tropical_cyclone_event') {
      queries.push([baseTopic, 'NHC tropical weather outlook'].filter(Boolean).join(' '))
      queries.push([baseTopic, 'official storm update'].filter(Boolean).join(' '))
    } else if (path === 'climate_index_numeric') {
      queries.push([baseTopic, 'official dataset latest'].filter(Boolean).join(' '))
      queries.push([baseTopic, 'climate outlook official'].filter(Boolean).join(' '))
    } else {
      queries.push([baseTopic, 'latest official Reuters'].filter(Boolean).join(' '))
      queries.push([baseTopic, 'latest update'].filter(Boolean).join(' '))
    }
    return unique(queries.map(cleanText)).slice(0, 3)
  }

  function buildNewsQuery(path: string, notes: Record<string, string | null>) {
    if (path === 'deadline_procedural') return unique([notes.core_entity, notes.procedural_terms, 'official']).join(' ')
    if (path === 'linked_binary_ladder') return unique([notes.core_entity, 'timeline', 'deadline']).join(' ')
    if (path === 'numeric_market') return unique([notes.numeric_label || notes.core_entity, notes.threshold_text, 'price']).join(' ')
    if (path === 'competitive_multi_outcome') return unique([notes.core_entity, 'odds', 'poll']).join(' ')
    if (path === 'sports_competition') return unique([notes.team_label || notes.core_entity, notes.outcome_terms, notes.league_name]).join(' ')
    if (path === 'weather_station_bucket') return unique([notes.weather_location, notes.weather_variable, 'official forecast']).join(' ')
    if (path === 'weather_accumulation_bucket') return unique([notes.weather_location, notes.weather_variable, 'climate summary']).join(' ')
    if (path === 'weather_first_occurrence_race') return unique([notes.core_entity, notes.weather_variable, 'daily climate report']).join(' ')
    if (path === 'tropical_cyclone_event') return unique([notes.core_entity, 'NHC', 'official']).join(' ')
    if (path === 'climate_index_numeric') return unique([notes.core_entity, 'official dataset']).join(' ')
    return unique([notes.core_entity, 'latest']).join(' ')
  }

  function seasonGuess(deadlineIso: string | null) {
    const fallback = '2025-2026'
    if (!deadlineIso) return fallback
    const date = new Date(deadlineIso)
    if (Number.isNaN(date.getTime())) return fallback
    const year = date.getUTCFullYear()
    const month = date.getUTCMonth() + 1
    return month <= 7 ? `${year - 1}-${year}` : `${year}-${year + 1}`
  }

  const leagueIdMap: Record<string, string> = {
    'English Premier League': '4328',
    'English League Championship': '4329',
    'English League 1': '4396',
    'English League 2': '4397',
    NBA: '4387',
    NFL: '4391',
    MLB: '4424',
    NHL: '4380',
  }

  const cleanedTitle = cleanText(title)
  const cleanedDescription = cleanText(description)
  const baseTopic = stripDeadlinePhrase(cleanedTitle) || cleanedTitle
  const reportableLabels = unique(
    reportableMarkets
      .map((market: Record<string, unknown>) => cleanText(market.label || market.question || ''))
      .filter((label) => label && !/^(yes|no|field tail|field tail excluding other|other|another person)$/i.test(label))
  ).slice(0, 4)

  const lowerBlob = [cleanedTitle, cleanedDescription, ...reportableLabels].join(' ').toLowerCase()
  const thresholdText = extractThresholdText(cleanedTitle)
  const sportsTeam = analysisPath === 'sports_competition' ? extractSportsTeam(cleanedTitle) : null
  const coreEntity = sportsTeam || baseTopic || reportableLabels[0]
  const outcomeTerms = (() => {
    if (/promot/.test(lowerBlob)) return 'promotion'
    if (/relegat/.test(lowerBlob)) return 'relegation'
    if (/playoff|play-in|postseason/.test(lowerBlob)) return 'playoff'
    if (/champion|title/.test(lowerBlob)) return 'champion'
    return null
  })()
  const proceduralTerms = (() => {
    if (/prime minister/.test(lowerBlob)) return 'prime minister parliament vote'
    if (/president/.test(lowerBlob)) return 'president official vote'
    if (/ipo/.test(lowerBlob)) return 'ipo filing listing'
    if (/approval|approve/.test(lowerBlob)) return 'approval regulator filing'
    return 'official vote approval filing'
  })()

  const cryptoMap = [
    { pattern: /\bbitcoin\b|\bbtc\b/, id: 'bitcoin', label: 'Bitcoin' },
    { pattern: /\bethereum\b|\beth\b/, id: 'ethereum', label: 'Ethereum' },
    { pattern: /\bsolana\b|\bsol\b/, id: 'solana', label: 'Solana' },
    { pattern: /\bdogecoin\b|\bdoge\b/, id: 'dogecoin', label: 'Dogecoin' },
    { pattern: /\bxrp\b|\bripple\b/, id: 'ripple', label: 'XRP' },
    { pattern: /\bbnb\b|\bbinance coin\b/, id: 'binancecoin', label: 'BNB' },
  ]
  const cryptoMatch = cryptoMap.find((entry) => entry.pattern.test(lowerBlob)) || null

  function detectLeagueName() {
    const blob = lowerBlob
    if (/\bnba\b/.test(blob)) return 'NBA'
    if (/\bnfl\b/.test(blob)) return 'NFL'
    if (/\bmlb\b/.test(blob)) return 'MLB'
    if (/\bnhl\b/.test(blob)) return 'NHL'
    if (/\bpremier league\b|\bepl\b/.test(blob)) return 'English Premier League'
    if (/\bchampionship\b/.test(blob)) return 'English League Championship'
    if (/\bleague one\b/.test(blob)) return 'English League 1'
    if (/\bleague two\b/.test(blob)) return 'English League 2'
    if (/\bmls\b|major league soccer/.test(blob)) return 'American Major League Soccer'
    return cleanText(sportsProfile.league || '') || null
  }

  const leagueName = detectLeagueName()
  const leagueId = leagueName ? leagueIdMap[leagueName] || null : null
  const sportsSeason = seasonGuess(primaryDeadline)

  let structuredProvider = 'none'
  let structuredUrl = ''
  let structuredLabel = ''
  let structuredReason = 'No structured source pack configured for this market path.'
  let retrievalMode = 'news_plus_search'
  let secondaryStructuredUrls: string[] = []
  let weatherContext: Record<string, unknown> | null = null

  if (analysisPath === 'numeric_market' && cryptoMatch) {
    structuredProvider = 'coingecko'
    structuredUrl = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(cryptoMatch.id)}&vs_currencies=usd&include_market_cap=true&include_24hr_change=true`
    structuredLabel = `CoinGecko snapshot for ${cryptoMatch.label}`
    structuredReason = 'Crypto asset detected from title or option labels.'
    retrievalMode = 'news_structured_plus_search'
  } else if (analysisPath === 'sports_competition' && (sportsTeam || leagueName)) {
    structuredProvider = 'sportsdb'
    retrievalMode = 'news_structured_plus_search'
    if (sportsTeam) {
      structuredUrl = `https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${encodeURIComponent(sportsTeam)}`
      structuredLabel = `TheSportsDB team lookup for ${sportsTeam}`
      structuredReason = 'Team-specific sports market detected.'
    } else {
      structuredUrl = `https://www.thesportsdb.com/api/v1/json/3/search_all_teams.php?l=${encodeURIComponent(leagueName!)}`
      structuredLabel = `TheSportsDB league snapshot for ${leagueName}`
      structuredReason = 'League-level sports field detected.'
    }
    if (leagueId) {
      secondaryStructuredUrls = [
        `https://www.thesportsdb.com/api/v1/json/3/lookuptable.php?l=${encodeURIComponent(leagueId)}&s=${encodeURIComponent(sportsSeason)}`,
        `https://www.thesportsdb.com/api/v1/json/3/eventsnextleague.php?id=${encodeURIComponent(leagueId)}`,
      ]
    }
  } else if (
    analysisPath === 'weather_station_bucket' ||
    analysisPath === 'weather_accumulation_bucket' ||
    analysisPath === 'weather_first_occurrence_race' ||
    analysisPath === 'tropical_cyclone_event' ||
    analysisPath === 'climate_index_numeric'
  ) {
    structuredProvider = 'weather_official'
    retrievalMode = 'official_weather_plus_search'
    if (weatherResolutionSpec && weatherProfile && weatherSettlementRisk) {
      const nextWeatherContext = buildWeatherStructuredContext(
        analysisPath as WeatherAnalysisPath,
        weatherResolutionSpec as any,
        weatherProfile as any,
        weatherSettlementRisk as any
      )
      weatherContext = nextWeatherContext
      structuredUrl = String(nextWeatherContext.points_url || '')
      secondaryStructuredUrls = [
        String(nextWeatherContext.station_observation_url || ''),
        ...(((nextWeatherContext.official_links as string[] | undefined) || [])),
      ].filter(Boolean)
      structuredLabel = `${cleanText(weatherResolutionSpec.variable || analysisPath)} official weather pack`
      structuredReason = 'Weather market path detected; using settlement-aligned official weather sources.'
    }
  }

  const notes = {
    core_entity: coreEntity,
    procedural_terms: proceduralTerms,
    numeric_label: cryptoMatch ? cryptoMatch.label : null,
    threshold_text: thresholdText,
    team_label: sportsTeam,
    league_name: leagueName,
    outcome_terms: outcomeTerms,
    weather_location: cleanText(weatherResolutionSpec?.location_name || weatherResolutionSpec?.station_name || '') || null,
    weather_variable: cleanText(weatherResolutionSpec?.variable || '') || null,
    weather_source_name: cleanText(weatherResolutionSpec?.resolving_agency || '') || null,
  }

  const newsQuery = buildNewsQuery(analysisPath, notes)
  const googleRssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(newsQuery)}&hl=en-US&gl=US&ceid=US:en`
  const newsUrl = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(newsQuery)}&mode=artlist&maxrecords=4&sort=DateDesc&format=json`
  const newsUrlSecondary = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(googleRssUrl)}`
  const searchQueries = buildSearchQueries(analysisPath, baseTopic, notes)
  const sourceRecencyRule =
    deadlineContext.urgency === 'critical'
      ? 'Use sources from the last 24 hours whenever possible. Older reporting is background only unless it is an official rule or filing.'
      : deadlineContext.urgency === 'near_term'
        ? 'Prefer sources from the last 72 hours. Older reporting should be treated as context, not decisive evidence.'
        : deadlineContext.urgency === 'medium_term'
          ? 'Prefer sources from the last 7 days for time-sensitive claims, while keeping older official documents for rules context.'
          : 'Prefer the freshest reliable sources, but older official materials may still be primary for rules and structure.'

  return {
    analysis_path: analysisPath,
    structure_kind: structureKind,
    source_policy: unique([
      ...sourcePolicy,
      'gdelt_news',
      'google_news_rss',
      structuredProvider !== 'none' ? structuredProvider : null,
      'openai_web_search',
    ]),
    retrieval_mode: retrievalMode,
    deadline_context: deadlineContext,
    source_recency_rule: sourceRecencyRule,
    news_query: newsQuery,
    news_url: newsUrl,
    news_url_secondary: newsUrlSecondary,
    search_queries: searchQueries,
    structured_provider: structuredProvider,
    structured_url: structuredUrl,
    secondary_structured_urls: secondaryStructuredUrls,
    structured_label: structuredLabel || null,
    structured_reason: structuredReason,
    weather_context: weatherContext,
    weather_resolution_spec: weatherResolutionSpec,
    weather_profile: weatherProfile,
    weather_settlement_risk: weatherSettlementRisk,
    sports_context: {
      team_label: sportsTeam,
      league_name: leagueName,
      title_league_name: leagueName,
      league_id: leagueId,
      season_guess: sportsSeason,
    },
    coverage_warning:
      'Fixed-source retrieval is intentionally incomplete. Use it as an anchor, then use web search to verify, extend, and find better primary sources when needed.',
  }
}

async function fetchRetrievalPack(plan: Record<string, unknown>): Promise<Record<string, unknown>> {
  const [gdeltFetch, googleFetch] = await Promise.all([
    fetchSourceLoose(String(plan.news_url || ''), 'gdelt_news'),
    fetchSourceLoose(String(plan.news_url_secondary || ''), 'google_news_rss'),
  ])

  const newsRaw = {
    news_sources: {
      gdelt: gdeltFetch.data,
      google_news_rss: googleFetch.data,
    },
    fetches: [gdeltFetch, googleFetch],
  }

  let structuredRaw: Record<string, unknown>
  let structuredFetches: RetrievalFetchResult[] = []
  if (plan.structured_provider === 'coingecko') {
    const fetchResult = await fetchSourceLoose(String(plan.structured_url || ''), 'coingecko_snapshot')
    structuredRaw = (fetchResult.data as Record<string, unknown>) || {}
    structuredFetches = [fetchResult]
  } else if (plan.structured_provider === 'sportsdb') {
    const teamLookupFetch = await fetchSourceLoose(String(plan.structured_url || ''), 'sportsdb_team_lookup')
    const teamLookup = teamLookupFetch.data || {}
    const sportsSecondaryPlan = buildSportsSecondaryPlan(plan, teamLookup)
    const [espnLeagueTeamsFetch, standingsFetch, fixturesFetch] = await Promise.all([
      fetchSourceLoose(String(sportsSecondaryPlan.espn_teams_url || ''), 'espn_league_teams'),
      fetchSourceLoose(String(sportsSecondaryPlan.standings_url || ''), 'sportsdb_standings'),
      fetchSourceLoose(String(sportsSecondaryPlan.fixtures_url || ''), 'sportsdb_fixtures'),
    ])
    const espnLeagueTeams = espnLeagueTeamsFetch.data
    const standings = standingsFetch.data
    const fixtures = fixturesFetch.data
    const espnTeamPlan = buildEspnTeamPlan(sportsSecondaryPlan, espnLeagueTeams)
    const espnTeamScheduleFetch = await fetchSourceLoose(String(espnTeamPlan.espn_schedule_url || ''), 'espn_team_schedule')
    const espnTeamSchedule = espnTeamScheduleFetch.data || null

    structuredRaw = {
      provider: 'sportsdb',
      sports_secondary_plan: sportsSecondaryPlan,
      espn_team_plan: espnTeamPlan,
      espn_team_schedule: espnTeamSchedule,
      team_lookup: teamLookup,
      standings,
      fixtures,
    }
    structuredFetches = [teamLookupFetch, espnLeagueTeamsFetch, standingsFetch, fixturesFetch, espnTeamScheduleFetch]
  } else if (plan.structured_provider === 'weather_official') {
    const weatherStructured = await fetchWeatherStructuredData(plan)
    structuredRaw = weatherStructured.data
    structuredFetches = weatherStructured.fetches
  } else {
    structuredRaw = {
      provider: 'none',
      note: plan.structured_reason || 'No structured source requested for this path.',
    }
  }

  return assembleRetrievalPack(plan, newsRaw, structuredRaw, structuredFetches)
}

async function fetchWeatherStructuredData(plan: Record<string, unknown>) {
  const weatherContext =
    plan.weather_context && typeof plan.weather_context === 'object'
      ? (plan.weather_context as Record<string, unknown>)
      : {}
  const resolutionSpec =
    plan.weather_resolution_spec && typeof plan.weather_resolution_spec === 'object'
      ? plan.weather_resolution_spec
      : null
  const weatherProfile =
    plan.weather_profile && typeof plan.weather_profile === 'object'
      ? plan.weather_profile
      : null
  const settlementRisk =
    plan.weather_settlement_risk && typeof plan.weather_settlement_risk === 'object'
      ? plan.weather_settlement_risk
      : null

  const latestObservationUrl = String(weatherContext.station_observation_url || '')
  const pointsUrl = String(weatherContext.points_url || '')

  const [latestObservationFetch, pointsFetch] = await Promise.all([
    fetchSourceLoose(latestObservationUrl, 'weather_latest_observation'),
    fetchSourceLoose(pointsUrl, 'weather_points'),
  ])
  const latestObservationRaw = latestObservationFetch.data
  const pointsRaw = pointsFetch.data

  const forecastUrl = String(pointsRaw?.properties?.forecast || '')
  const forecastHourlyUrl = String(pointsRaw?.properties?.forecastHourly || '')
  const [forecastFetch, forecastHourlyFetch] = await Promise.all([
    fetchSourceLoose(forecastUrl, 'weather_forecast'),
    fetchSourceLoose(forecastHourlyUrl, 'weather_forecast_hourly'),
  ])
  const forecastRaw = forecastFetch.data
  const forecastHourlyRaw = forecastHourlyFetch.data

  function normalizeObservation(raw: any) {
    const properties = raw?.properties || {}
    return raw?.properties
      ? {
          timestamp: properties.timestamp || null,
          temperature_c: properties.temperature?.value ?? null,
          wind_speed_kph: properties.windSpeed?.value ?? null,
          wind_direction_deg: properties.windDirection?.value ?? null,
          text_description: properties.textDescription || null,
        }
      : null
  }

  function normalizeForecast(raw: any) {
    const periods = Array.isArray(raw?.properties?.periods) ? raw.properties.periods : []
    return periods.slice(0, 8).map((period: any) => ({
      name: period.name || null,
      start_time: period.startTime || null,
      end_time: period.endTime || null,
      temperature: period.temperature ?? null,
      temperature_unit: period.temperatureUnit || null,
      probability_of_precipitation: period.probabilityOfPrecipitation?.value ?? null,
      wind_speed: period.windSpeed || null,
      short_forecast: period.shortForecast || null,
      detailed_forecast: period.detailedForecast || null,
    }))
  }

  function normalizeForecastHourly(raw: any) {
    const periods = Array.isArray(raw?.properties?.periods) ? raw.properties.periods : []
    return periods.slice(0, 24).map((period: any) => ({
      start_time: period.startTime || null,
      temperature: period.temperature ?? null,
      temperature_unit: period.temperatureUnit || null,
      probability_of_precipitation: period.probabilityOfPrecipitation?.value ?? null,
      short_forecast: period.shortForecast || null,
    }))
  }

  return {
    data: {
      provider: 'weather_official',
      status:
        latestObservationFetch.ok || pointsFetch.ok || forecastFetch.ok || forecastHourlyFetch.ok || resolutionSpec || weatherProfile
          ? 'ok'
          : 'empty',
      resolution_spec: resolutionSpec,
      weather_profile: weatherProfile,
      settlement_risk: settlementRisk,
      official_links: Array.isArray(weatherContext.official_links) ? weatherContext.official_links : [],
      preferred_products: Array.isArray(weatherContext.preferred_products) ? weatherContext.preferred_products : [],
      ensemble_sources: Array.isArray(weatherContext.ensemble_sources) ? weatherContext.ensemble_sources : [],
      latest_observation: normalizeObservation(latestObservationRaw),
      forecast_periods: normalizeForecast(forecastRaw),
      forecast_hourly_periods: normalizeForecastHourly(forecastHourlyRaw),
      points_metadata: pointsRaw?.properties
        ? {
            grid_id: pointsRaw.properties.gridId || null,
            grid_x: pointsRaw.properties.gridX ?? null,
            grid_y: pointsRaw.properties.gridY ?? null,
            forecast_zone: pointsRaw.properties.forecastZone || null,
            county: pointsRaw.properties.county || null,
          }
        : null,
    },
    fetches: [latestObservationFetch, pointsFetch, forecastFetch, forecastHourlyFetch],
  }
}

function buildSportsSecondaryPlan(plan: Record<string, unknown>, teamLookup: any) {
  const sportsContext = (plan.sports_context || {}) as Record<string, unknown>

  function cleanText(value: unknown) {
    return String(value || '').replace(/\s+/g, ' ').trim()
  }

  const sportsDbLeagueIdMap: Record<string, string> = {
    'English Premier League': '4328',
    'English League Championship': '4329',
    'English League 1': '4396',
    'English League 2': '4397',
    NBA: '4387',
    NFL: '4391',
    MLB: '4424',
    NHL: '4380',
    'American Major League Soccer': '4346',
  }

  const espnLeagueMap: Record<string, { sport: string; league: string }> = {
    'English Premier League': { sport: 'soccer', league: 'eng.1' },
    'English League Championship': { sport: 'soccer', league: 'eng.2' },
    'English League 1': { sport: 'soccer', league: 'eng.3' },
    'English League 2': { sport: 'soccer', league: 'eng.4' },
    'American Major League Soccer': { sport: 'soccer', league: 'usa.1' },
    NBA: { sport: 'basketball', league: 'nba' },
    NFL: { sport: 'football', league: 'nfl' },
    MLB: { sport: 'baseball', league: 'mlb' },
    NHL: { sport: 'hockey', league: 'nhl' },
  }

  const team = Array.isArray(teamLookup?.teams) && teamLookup.teams.length > 0 ? teamLookup.teams[0] : null
  const currentLeagueName = cleanText(team?.strLeague || team?.strLeague2 || '') || null
  const currentLeagueId = currentLeagueName ? sportsDbLeagueIdMap[currentLeagueName] || null : null
  const targetLeagueName = cleanText(sportsContext.title_league_name || sportsContext.league_name || '') || null
  const targetLeagueId = (sportsContext.league_id as string | null) || null
  const resolvedLeagueName = currentLeagueName || targetLeagueName || null
  const resolvedLeagueId = currentLeagueId || targetLeagueId || null
  const seasonGuess = (sportsContext.season_guess as string) || '2025-2026'
  const espnTarget = resolvedLeagueName ? espnLeagueMap[resolvedLeagueName] || null : null

  return {
    team_label: cleanText(team?.strTeam || sportsContext.team_label || '') || null,
    current_league_name: currentLeagueName,
    current_league_id: currentLeagueId,
    target_league_name: targetLeagueName,
    target_league_id: targetLeagueId,
    resolved_league_name: resolvedLeagueName,
    resolved_league_id: resolvedLeagueId,
    season_guess: seasonGuess,
    standings_url: resolvedLeagueId
      ? `https://www.thesportsdb.com/api/v1/json/3/lookuptable.php?l=${encodeURIComponent(resolvedLeagueId)}&s=${encodeURIComponent(seasonGuess)}`
      : 'https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=placeholder',
    fixtures_url: resolvedLeagueId
      ? `https://www.thesportsdb.com/api/v1/json/3/eventsnextleague.php?id=${encodeURIComponent(resolvedLeagueId)}`
      : 'https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=placeholder',
    espn_sport: espnTarget?.sport || null,
    espn_league_slug: espnTarget?.league || null,
    espn_teams_url: espnTarget
      ? `https://site.api.espn.com/apis/site/v2/sports/${encodeURIComponent(espnTarget.sport)}/${encodeURIComponent(espnTarget.league)}/teams`
      : 'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.2/teams/0',
    note: currentLeagueId
      ? "Resolved standings from the team's current league returned by TheSportsDB, with ESPN available for team schedule lookups."
      : 'Fell back to title-derived league context because team lookup did not expose a mappable current league.',
  }
}

function buildEspnTeamPlan(secondaryPlan: Record<string, unknown>, teamsRaw: any) {
  function normalize(value: unknown) {
    return String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
  }

  const target = normalize(secondaryPlan.team_label)
  const teams = ((((teamsRaw?.sports || [])[0]?.leagues || [])[0]?.teams) || [])
    .map((entry: any) => entry?.team || entry)
    .filter(Boolean)

  let best: any = null
  let bestScore = 0
  for (const team of teams) {
    const candidates = [
      team.displayName,
      team.shortDisplayName,
      team.name,
      team.location,
      team.abbreviation,
      team.slug,
    ]
      .map(normalize)
      .filter(Boolean)
    let score = 0
    if (candidates.includes(target)) score = 3
    else if (candidates.some((value: string) => value.includes(target) || target.includes(value))) score = 2
    if (score > bestScore) {
      best = team
      bestScore = score
    }
  }

  const espnTeamId = best?.id || null
  const sport = secondaryPlan.espn_sport || null
  const league = secondaryPlan.espn_league_slug || null

  return {
    espn_team_id: espnTeamId,
    espn_team_name: best?.displayName || best?.shortDisplayName || best?.name || null,
    espn_team_abbreviation: best?.abbreviation || null,
    espn_sport: sport,
    espn_league_slug: league,
    espn_schedule_url:
      espnTeamId && sport && league
        ? `https://site.api.espn.com/apis/site/v2/sports/${encodeURIComponent(String(sport))}/${encodeURIComponent(String(league))}/teams/${encodeURIComponent(String(espnTeamId))}`
        : 'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.2/teams/0',
    match_score: bestScore,
    note: espnTeamId
      ? 'Resolved ESPN team id from league teams feed and will use the ESPN team endpoint for next-event data.'
      : 'No ESPN team match found for this league/team combination.',
  }
}

function assembleRetrievalPack(
  plan: Record<string, unknown>,
  newsRaw: any,
  structuredRaw: any,
  structuredFetches: RetrievalFetchResult[]
) {
  function normalizeGdelt(raw: any) {
    const articles = Array.isArray(raw?.articles) ? raw.articles : []
    const rateLimited = typeof raw === 'string' && raw.includes('Please limit requests')
    return {
      rate_limited: rateLimited,
      articles: articles.slice(0, 6).map((article: any) => ({
        title: String(article.title || '').trim(),
        domain: String(article.domain || '').trim() || null,
        seen_at: String(article.seendate || '').trim() || null,
        url: String(article.url || '').trim() || null,
        provider: 'gdelt',
      })),
    }
  }

  function normalizeGoogle(raw: any) {
    const items = Array.isArray(raw?.items) ? raw.items : []
    return items.slice(0, 6).map((item: any) => ({
      title: String(item.title || '').trim(),
      domain: String(item.author || item.source || '').trim() || null,
      seen_at: String(item.pubDate || '').trim() || null,
      url: String(item.link || '').trim() || null,
      provider: 'google_news_rss',
    }))
  }

  function mergeNews(primary: Array<Record<string, unknown>>, secondary: Array<Record<string, unknown>>) {
    const seen = new Set<string>()
    const merged: Array<Record<string, unknown>> = []
    for (const article of [...primary, ...secondary]) {
      const key = String(article.url || article.title || '').toLowerCase()
      if (!key || seen.has(key)) continue
      seen.add(key)
      merged.push(article)
    }
    return merged.slice(0, 8)
  }

  function summarizeFetches(fetches: RetrievalFetchResult[]) {
    const total = fetches.length
    const ok = fetches.filter((entry) => entry.ok).length
    const timedOut = fetches.filter((entry) => entry.timed_out).length
    const failed = total - ok
    const overall =
      total === 0 ? 'not_requested' :
      ok === total ? 'good' :
      ok > 0 ? 'partial' :
      'degraded'

    return {
      overall,
      total,
      ok,
      failed,
      timed_out: timedOut,
      entries: fetches.map((entry) => ({
        label: entry.label,
        url: entry.url,
        ok: entry.ok,
        status: entry.status,
        timed_out: entry.timed_out,
        content_type: entry.content_type,
        error: entry.error,
      })),
    }
  }

  function normalizeEspnFixtures(raw: any, espnTeamPlan: any) {
    const nextEvents = Array.isArray(raw?.team?.nextEvent) ? raw.team.nextEvent : Array.isArray(raw?.nextEvent) ? raw.nextEvent : []
    const events = nextEvents.length > 0 ? nextEvents : Array.isArray(raw?.events) ? raw.events : []
    const teamId = String(espnTeamPlan?.espn_team_id || '')
    if (!teamId || events.length === 0) return []
    return events
      .filter((event: any) => {
        if (nextEvents.length > 0) return true
        const status = event?.competitions?.[0]?.status?.type || event?.status?.type || {}
        return status.completed !== true
      })
      .map((event: any) => {
        const competition = Array.isArray(event?.competitions) ? event.competitions[0] : null
        const competitors = Array.isArray(competition?.competitors) ? competition.competitors : []
        const teamSide =
          competitors.find((competitor: any) => String(competitor?.id || competitor?.team?.id || '') === teamId) || null
        const opponent =
          competitors.find((competitor: any) => String(competitor?.id || competitor?.team?.id || '') !== teamId) || null
        return {
          event:
            event?.name ||
            competition?.competitors
              ?.map((competitor: any) => competitor?.team?.displayName || competitor?.team?.shortDisplayName)
              .filter(Boolean)
              .join(' vs ') ||
            null,
          date: event?.date || competition?.date || null,
          league: event?.league?.name || raw?.team?.defaultLeague?.name || raw?.team?.league?.name || null,
          opponent: opponent?.team?.displayName || opponent?.team?.shortDisplayName || null,
          home_away: teamSide?.homeAway || null,
          status: competition?.status?.type?.shortDetail || competition?.status?.type?.detail || event?.status?.type?.shortDetail || null,
          provider: 'espn',
        }
      })
      .slice(0, 6)
  }

  function normalizeStructured(raw: any, provider: string) {
    if (provider === 'coingecko') {
      const [assetId] = Object.keys(raw || {})
      if (!assetId) return { provider: 'coingecko', status: 'empty', note: 'CoinGecko returned no asset payload.' }
      const asset = raw[assetId] || {}
      return {
        provider: 'coingecko',
        status: 'ok',
        asset: assetId,
        usd_price: asset.usd ?? null,
        usd_market_cap: asset.usd_market_cap ?? null,
        usd_24h_change: asset.usd_24h_change ?? null,
      }
    }

    if (provider === 'sportsdb') {
      const teamLookup = raw?.team_lookup || null
      const standings = raw?.standings || null
      const fixtures = raw?.fixtures || null
      const secondaryPlan = raw?.sports_secondary_plan || null
      const espnTeamPlan = raw?.espn_team_plan || null
      const espnTeamSchedule = raw?.espn_team_schedule || null
      const normalized: Record<string, unknown> = {
        provider: 'sportsdb',
        status: 'empty',
        team_lookup: null,
        standings: null,
        fixtures: null,
        fixtures_provider: null,
        team_schedule_summary: espnTeamSchedule?.team
          ? {
              record_summary: espnTeamSchedule.team.recordSummary ?? espnTeamSchedule.team.record?.items?.[0]?.summary ?? null,
              standing_summary: espnTeamSchedule.team.standingSummary ?? null,
              season_summary: espnTeamSchedule.team.seasonSummary ?? null,
            }
          : null,
        market_context: secondaryPlan
          ? {
              team_label: secondaryPlan.team_label ?? null,
              current_league_name: secondaryPlan.current_league_name ?? null,
              target_league_name: secondaryPlan.target_league_name ?? null,
              resolved_league_name: secondaryPlan.resolved_league_name ?? null,
              espn_league_slug: secondaryPlan.espn_league_slug ?? null,
              espn_team_id: espnTeamPlan?.espn_team_id ?? null,
              note: secondaryPlan.note ?? null,
            }
          : null,
        note: null,
      }

      if (Array.isArray(teamLookup?.teams) && teamLookup.teams.length > 0) {
        normalized.team_lookup = teamLookup.teams.slice(0, 5).map((team: any) => ({
          team: team.strTeam ?? null,
          league: team.strLeague ?? null,
          country: team.strCountry ?? null,
          stadium: team.strStadium ?? null,
          website: team.strWebsite ?? null,
        }))
      }
      if (Array.isArray(standings?.table) && standings.table.length > 0) {
        normalized.standings = standings.table.slice(0, 10).map((row: any) => ({
          rank: row.intRank ?? null,
          team: row.strTeam ?? null,
          played: row.intPlayed ?? null,
          points: row.intPoints ?? null,
          form: row.strForm ?? null,
          note: row.strDescription ?? null,
        }))
      }
      const espnFixtures = normalizeEspnFixtures(espnTeamSchedule, espnTeamPlan)
      if (espnFixtures.length > 0) {
        normalized.fixtures = espnFixtures
        normalized.fixtures_provider = 'espn'
      } else if (Array.isArray(fixtures?.events) && fixtures.events.length > 0) {
        const teamLabel = String(secondaryPlan?.team_label || '').toLowerCase()
        const resolvedLeagueName = String(secondaryPlan?.resolved_league_name || '').toLowerCase()
        const fixtureRows = fixtures.events
          .map((event: any) => ({
            event: event.strEvent ?? null,
            date: event.dateEvent ?? null,
            league: event.strLeague ?? null,
            status: event.strStatus ?? null,
            provider: 'sportsdb',
          }))
          .filter((row: any) => {
            const eventLabel = String(row.event || '').toLowerCase()
            const leagueLabel = String(row.league || '').toLowerCase()
            if (teamLabel && eventLabel.includes(teamLabel)) return true
            if (resolvedLeagueName && leagueLabel === resolvedLeagueName) return true
            return false
          })
        if (fixtureRows.length > 0) {
          normalized.fixtures = fixtureRows.slice(0, 8)
          normalized.fixtures_provider = 'sportsdb'
        }
      }
      if (normalized.team_lookup || normalized.standings || normalized.fixtures || normalized.team_schedule_summary) {
        normalized.status = 'ok'
        return normalized
      }
      normalized.note = 'No usable sports team, standings, or schedule payload was returned.'
      return normalized
    }

    if (provider === 'weather_official') {
      return {
        provider: 'weather_official',
        status: raw?.status || 'empty',
        resolution_spec: raw?.resolution_spec || null,
        weather_profile: raw?.weather_profile || null,
        settlement_risk: raw?.settlement_risk || null,
        official_links: Array.isArray(raw?.official_links) ? raw.official_links : [],
        preferred_products: Array.isArray(raw?.preferred_products) ? raw.preferred_products : [],
        ensemble_sources: Array.isArray(raw?.ensemble_sources) ? raw.ensemble_sources : [],
        latest_observation: raw?.latest_observation || null,
        forecast_periods: Array.isArray(raw?.forecast_periods) ? raw.forecast_periods : [],
        forecast_hourly_periods: Array.isArray(raw?.forecast_hourly_periods) ? raw.forecast_hourly_periods : [],
        points_metadata: raw?.points_metadata || null,
      }
    }

    return {
      provider: provider || 'none',
      status: provider && provider !== 'none' ? 'empty' : 'not_requested',
      note: plan.structured_reason || 'No structured source configured.',
    }
  }

  const gdelt = normalizeGdelt(newsRaw?.news_sources?.gdelt)
  const google = normalizeGoogle(newsRaw?.news_sources?.google_news_rss)
  const mergedNews = mergeNews(gdelt.articles, google)
  const newsFetches = Array.isArray(newsRaw?.fetches) ? (newsRaw.fetches as RetrievalFetchResult[]) : []
  const newsHealth = summarizeFetches(newsFetches)
  const structuredHealth = summarizeFetches(structuredFetches)

  return {
    source_policy: Array.isArray(plan.source_policy) ? plan.source_policy : [],
    retrieval_mode: plan.retrieval_mode || 'news_plus_search',
    deadline_context: plan.deadline_context || null,
    source_recency_rule: plan.source_recency_rule || null,
    search_queries: Array.isArray(plan.search_queries) ? plan.search_queries : [],
    coverage_warning: plan.coverage_warning || null,
    source_health: {
      news: newsHealth,
      structured: structuredHealth,
      overall:
        newsHealth.overall === 'good' && (structuredHealth.overall === 'good' || structuredHealth.overall === 'not_requested')
          ? 'good'
          : newsHealth.overall === 'degraded' && structuredHealth.overall === 'degraded'
            ? 'degraded'
            : 'partial',
    },
    news_pack: {
      provider: 'hybrid_news_pack',
      query: plan.news_query || null,
      gdelt_rate_limited: gdelt.rate_limited,
      google_rss_count: google.length,
      articles: mergedNews,
      fetches: newsHealth.entries,
    },
    structured_pack: normalizeStructured(structuredRaw, String(plan.structured_provider || 'none')),
  }
}

function parseList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((value) => String(value).trim()).filter(Boolean)
  if (typeof raw !== 'string') return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map((value) => String(value).trim()).filter(Boolean) : []
  } catch {
    return raw
      .replace(/[\[\]"]/g, '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  }
}

function parseNumberList(raw: unknown): Array<number | null> {
  return parseList(raw)
    .map((value) => Number(value))
    .map((value) => (Number.isFinite(value) ? value : null))
}

function toPct(value: number | null) {
  return value === null || value === undefined || !Number.isFinite(value) ? null : Number((value * 100).toFixed(2))
}

function scaleNumeric(value: number, suffix: string) {
  const normalized = String(suffix || '').toLowerCase()
  const scale = normalized === 'k' ? 1e3 : normalized === 'm' ? 1e6 : normalized === 'b' ? 1e9 : normalized === 't' ? 1e12 : 1
  return value * scale
}

function extractNumericMatches(text: string) {
  const matches = [...String(text || '').matchAll(/(\d+(?:\.\d+)?)\s*(k|m|b|t|%|x)?/gi)].map((match) => ({
    raw: match[0],
    value: Number(match[1]),
    suffix: String(match[2] || '').toLowerCase(),
  }))
  const explicitSuffixes = [...new Set(matches.map((match) => match.suffix).filter(Boolean))]
  const inferredSuffix = explicitSuffixes.length === 1 ? explicitSuffixes[0] : ''
  return matches.map((match) => ({
    ...match,
    normalizedSuffix: match.suffix || inferredSuffix,
    scaledValue: scaleNumeric(match.value, match.suffix || inferredSuffix),
  }))
}

function resolvePrimaryDeadline(event: PolymarketEvent): string | null {
  const candidates = [event.endDate]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim())

  if (candidates.length === 0) return null

  const valid = candidates.find((value) => Number.isFinite(Date.parse(value)))
  return valid || candidates[0]
}

function buildDeadlineContext(deadlineIso: string | null): DeadlineContext {
  if (!deadlineIso || !Number.isFinite(Date.parse(deadlineIso))) {
    return {
      has_deadline: false,
      deadline_iso: null,
      deadline_status: 'none',
      urgency: 'none',
      hours_to_deadline: null,
      days_to_deadline: null,
      freshness_window_hours: null,
    }
  }

  const hoursToDeadline = (Date.parse(deadlineIso) - Date.now()) / (60 * 60 * 1000)
  const roundedHours = Number(hoursToDeadline.toFixed(1))
  const roundedDays = Number((hoursToDeadline / 24).toFixed(2))

  let urgency: DeadlineContext['urgency'] = 'long_term'
  let deadlineStatus: DeadlineContext['deadline_status'] = 'active'
  let freshnessWindowHours = 336

  if (hoursToDeadline <= 0) {
    urgency = 'expired'
    deadlineStatus = 'expired'
    freshnessWindowHours = 24
  } else if (hoursToDeadline <= 24) {
    urgency = 'critical'
    deadlineStatus = 'critical'
    freshnessWindowHours = 24
  } else if (hoursToDeadline <= 72) {
    urgency = 'near_term'
    deadlineStatus = 'active'
    freshnessWindowHours = 72
  } else if (hoursToDeadline <= 24 * 14) {
    urgency = 'medium_term'
    deadlineStatus = 'active'
    freshnessWindowHours = 24 * 7
  }

  return {
    has_deadline: true,
    deadline_iso: deadlineIso,
    deadline_status: deadlineStatus,
    urgency,
    hours_to_deadline: roundedHours,
    days_to_deadline: roundedDays,
    freshness_window_hours: freshnessWindowHours,
  }
}
