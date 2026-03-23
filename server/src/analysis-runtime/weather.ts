import type { PolymarketEvent, PolymarketMarket } from './parity.js'

export type WeatherAnalysisPath =
  | 'weather_station_bucket'
  | 'weather_accumulation_bucket'
  | 'weather_first_occurrence_race'
  | 'tropical_cyclone_event'
  | 'climate_index_numeric'

export interface WeatherResolutionSpec {
  subtype: WeatherAnalysisPath
  resolving_agency: string
  source_url: string | null
  source_kind: string
  station_id: string | null
  station_name: string | null
  location_name: string | null
  variable: string
  unit: string
  precision: number | null
  aggregation:
    | 'max'
    | 'min'
    | 'sum'
    | 'count'
    | 'first_occurrence'
    | 'classification'
    | 'index_value'
  window_start_iso: string | null
  window_end_iso: string | null
  timezone: string | null
  threshold: number | null
  buckets: Array<{ label: string; low: number | null; high: number | null }>
  tie_break_rule: string | null
  revision_policy: string | null
}

export interface WeatherProfile {
  subtype: WeatherAnalysisPath
  horizon_bucket: 'short_range' | 'medium_range' | 'extended' | 'seasonal'
  official_products: string[]
  observation_products: string[]
  ensemble_sources: string[]
  location_count: number
  location_labels: string[]
  modeling_notes: string[]
}

export interface WeatherSettlementRisk {
  source_mismatch: 'low' | 'medium' | 'high'
  station_mismatch: 'low' | 'medium' | 'high'
  timing_mismatch: 'low' | 'medium' | 'high'
  precision_rounding_risk: 'low' | 'medium' | 'high'
  revision_lag_risk: 'low' | 'medium' | 'high'
  comments: string[]
}

export interface WeatherRoutingResult {
  domain: 'weather'
  marketType: WeatherAnalysisPath
  reasons: string[]
}

interface LocationCatalogEntry {
  key: string
  label: string
  aliases: string[]
  stationId: string | null
  stationName: string | null
  latitude: number | null
  longitude: number | null
  timezone: string | null
  climateUrl: string | null
}

interface NormalizedWeatherMarket {
  label: string
  question: string
  deadline: string | null
  bucket_kind: string
  numeric_low: number | null
  numeric_high: number | null
}

const WEATHER_TAGS = new Set([
  'weather',
  'climate',
  'hurricane',
  'tropical',
  'storm',
  'rain',
  'snow',
  'temperature',
])

const LOCATION_CATALOG: LocationCatalogEntry[] = [
  {
    key: 'nyc',
    label: 'New York City',
    aliases: ['nyc', 'new york city', 'new york', 'central park', 'laguardia', 'jfk'],
    stationId: 'KNYC',
    stationName: 'Central Park',
    latitude: 40.7128,
    longitude: -74.006,
    timezone: 'America/New_York',
    climateUrl: 'https://www.weather.gov/wrh/climate?wfo=okx',
  },
  {
    key: 'boston',
    label: 'Boston',
    aliases: ['boston', 'logan airport'],
    stationId: 'KBOS',
    stationName: 'Boston Logan Airport',
    latitude: 42.3601,
    longitude: -71.0589,
    timezone: 'America/New_York',
    climateUrl: 'https://www.weather.gov/wrh/climate?wfo=box',
  },
  {
    key: 'chicago',
    label: 'Chicago',
    aliases: ['chicago', "o'hare", 'ohare'],
    stationId: 'KORD',
    stationName: "Chicago O'Hare",
    latitude: 41.9786,
    longitude: -87.9048,
    timezone: 'America/Chicago',
    climateUrl: 'https://www.weather.gov/wrh/climate?wfo=lot',
  },
  {
    key: 'washington_dc',
    label: 'Washington, DC',
    aliases: ['washington dc', 'washington, dc', 'dc', 'd.c.', 'reagan national', 'dca'],
    stationId: 'KDCA',
    stationName: 'Reagan National Airport',
    latitude: 38.8512,
    longitude: -77.0402,
    timezone: 'America/New_York',
    climateUrl: 'https://www.weather.gov/wrh/climate?wfo=lwx',
  },
  {
    key: 'atlanta',
    label: 'Atlanta',
    aliases: ['atlanta', 'hartsfield', 'atl'],
    stationId: 'KATL',
    stationName: 'Atlanta Hartsfield-Jackson',
    latitude: 33.6407,
    longitude: -84.4277,
    timezone: 'America/New_York',
    climateUrl: 'https://www.weather.gov/wrh/climate?wfo=ffc',
  },
  {
    key: 'dallas',
    label: 'Dallas',
    aliases: ['dallas', 'dfw', 'fort worth'],
    stationId: 'KDFW',
    stationName: 'Dallas/Fort Worth',
    latitude: 32.8998,
    longitude: -97.0403,
    timezone: 'America/Chicago',
    climateUrl: 'https://www.weather.gov/wrh/climate?wfo=fwd',
  },
  {
    key: 'houston',
    label: 'Houston',
    aliases: ['houston', 'iah', 'hobby airport'],
    stationId: 'KIAH',
    stationName: 'Houston Intercontinental',
    latitude: 29.9902,
    longitude: -95.3368,
    timezone: 'America/Chicago',
    climateUrl: 'https://www.weather.gov/wrh/climate?wfo=hgx',
  },
  {
    key: 'miami',
    label: 'Miami',
    aliases: ['miami', 'mia'],
    stationId: 'KMIA',
    stationName: 'Miami International',
    latitude: 25.7617,
    longitude: -80.1918,
    timezone: 'America/New_York',
    climateUrl: 'https://www.weather.gov/wrh/climate?wfo=mfl',
  },
  {
    key: 'seattle',
    label: 'Seattle',
    aliases: ['seattle', 'seatac', 'sea-tac'],
    stationId: 'KSEA',
    stationName: 'Seattle-Tacoma',
    latitude: 47.4502,
    longitude: -122.3088,
    timezone: 'America/Los_Angeles',
    climateUrl: 'https://www.weather.gov/wrh/climate?wfo=sew',
  },
  {
    key: 'los_angeles',
    label: 'Los Angeles',
    aliases: ['los angeles', 'la', 'lax'],
    stationId: 'KLAX',
    stationName: 'Los Angeles International',
    latitude: 33.9416,
    longitude: -118.4085,
    timezone: 'America/Los_Angeles',
    climateUrl: 'https://www.weather.gov/wrh/climate?wfo=lox',
  },
  {
    key: 'san_francisco',
    label: 'San Francisco',
    aliases: ['san francisco', 'sf', 'sfo'],
    stationId: 'KSFO',
    stationName: 'San Francisco International',
    latitude: 37.6213,
    longitude: -122.379,
    timezone: 'America/Los_Angeles',
    climateUrl: 'https://www.weather.gov/wrh/climate?wfo=mtr',
  },
  {
    key: 'denver',
    label: 'Denver',
    aliases: ['denver', 'dia'],
    stationId: 'KDEN',
    stationName: 'Denver International',
    latitude: 39.8561,
    longitude: -104.6737,
    timezone: 'America/Denver',
    climateUrl: 'https://www.weather.gov/wrh/climate?wfo=bou',
  },
  {
    key: 'phoenix',
    label: 'Phoenix',
    aliases: ['phoenix', 'phx'],
    stationId: 'KPHX',
    stationName: 'Phoenix Sky Harbor',
    latitude: 33.4342,
    longitude: -112.0116,
    timezone: 'America/Phoenix',
    climateUrl: 'https://www.weather.gov/wrh/climate?wfo=psr',
  },
  {
    key: 'philadelphia',
    label: 'Philadelphia',
    aliases: ['philadelphia', 'philly', 'phl'],
    stationId: 'KPHL',
    stationName: 'Philadelphia International',
    latitude: 39.8744,
    longitude: -75.2424,
    timezone: 'America/New_York',
    climateUrl: 'https://www.weather.gov/wrh/climate?wfo=phi',
  },
]

const STATION_NAME_BY_ID: Record<string, string> = {
  KNYC: 'Central Park',
  KLGA: 'LaGuardia Airport',
  KJFK: 'John F. Kennedy International Airport',
  KBOS: 'Boston Logan Airport',
  KORD: "Chicago O'Hare",
  KDCA: 'Reagan National Airport',
  KATL: 'Atlanta Hartsfield-Jackson',
  KDFW: 'Dallas/Fort Worth',
  KIAH: 'Houston Intercontinental',
  KMIA: 'Miami International',
  KSEA: 'Seattle-Tacoma',
  KLAX: 'Los Angeles International',
  KSFO: 'San Francisco International',
  KDEN: 'Denver International',
  KPHX: 'Phoenix Sky Harbor',
  KPHL: 'Philadelphia International',
}

function cleanText(value: unknown) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractSourceUrl(text: string): string | null {
  const match = String(text || '').match(/https?:\/\/[^\s)]+/i)
  if (!match) return null
  return match[0].replace(/[.,;]+$/, '')
}

function extractStationId(text: string): string | null {
  const match =
    String(text || '').match(/\b([A-Z]{4})\b/) ||
    String(text || '').match(/[?&](?:ID|station|stid)=([A-Z0-9]{3,6})/i)
  if (!match) return null
  return String(match[1]).toUpperCase()
}

function parseNumericBuckets(markets: NormalizedWeatherMarket[]) {
  return markets
    .map((market) => ({
      label: market.label,
      low: market.numeric_low,
      high: market.numeric_high,
    }))
    .filter((bucket) => bucket.low !== null || bucket.high !== null)
}

function findLocation(texts: string[]) {
  const blob = texts.map((value) => cleanText(value).toLowerCase()).join(' ')
  return LOCATION_CATALOG.find((entry) => entry.aliases.some((alias) => blob.includes(alias.toLowerCase()))) || null
}

function inferVariable(path: WeatherAnalysisPath, fullText: string) {
  if (path === 'tropical_cyclone_event') {
    if (/named storm count|named storms|how many named storms/.test(fullText)) return 'named storm count'
    if (/hurricane count|how many hurricanes/.test(fullText)) return 'hurricane count'
    if (/landfall/.test(fullText)) return 'landfall event'
    return 'official tropical cyclone classification'
  }
  if (path === 'climate_index_numeric') {
    if (/sea ice/.test(fullText)) return 'sea ice extent'
    if (/anomaly/.test(fullText)) return 'climate anomaly index'
    return 'climate index value'
  }
  if (path === 'weather_first_occurrence_race') {
    if (/snow/.test(fullText)) return 'first measurable snowfall'
    if (/freeze|frost/.test(fullText)) return 'first freeze'
    return 'first qualifying weather occurrence'
  }
  if (path === 'weather_accumulation_bucket') {
    if (/snow/.test(fullText)) return 'accumulated snowfall'
    return 'accumulated precipitation'
  }
  if (/lowest temperature|low temperature|minimum temperature|min temp/.test(fullText)) {
    return 'daily minimum temperature'
  }
  return 'daily maximum temperature'
}

function inferUnit(path: WeatherAnalysisPath, fullText: string) {
  if (path === 'tropical_cyclone_event') return 'classification'
  if (path === 'weather_first_occurrence_race') return /snow|rain|precip/.test(fullText) ? 'inch' : 'event'
  if (/mm\b|millimeter/.test(fullText)) return 'mm'
  if (/celsius|\b°c\b|\bc\b/.test(fullText)) return 'C'
  if (/f|fahrenheit|temperature/.test(fullText)) return 'F'
  if (path === 'weather_accumulation_bucket') return 'inch'
  if (path === 'climate_index_numeric') return 'dataset_unit'
  return 'unit'
}

function inferPrecision(path: WeatherAnalysisPath, text: string) {
  const blob = text.toLowerCase()
  if (/0\.01/.test(blob)) return 0.01
  if (/whole degree|nearest degree|integer/.test(blob)) return 1
  if (path === 'weather_station_bucket') return 1
  if (path === 'weather_accumulation_bucket') return 0.01
  return null
}

function inferAggregation(path: WeatherAnalysisPath, fullText: string) {
  if (path === 'weather_first_occurrence_race') return 'first_occurrence'
  if (path === 'tropical_cyclone_event') {
    if (/count|how many/.test(fullText)) return 'count'
    return 'classification'
  }
  if (path === 'climate_index_numeric') return 'index_value'
  if (path === 'weather_accumulation_bucket') return 'sum'
  return /lowest|min/.test(fullText) ? 'min' : 'max'
}

function inferTieBreakRule(path: WeatherAnalysisPath, text: string) {
  if (path !== 'weather_first_occurrence_race') return null
  const blob = cleanText(text)
  if (/same day|alphabetical|greater snowfall|higher snowfall/i.test(blob)) {
    return blob
  }
  return 'If multiple locations qualify on the same day, use the market rule tie-break order exactly as written.'
}

function inferRevisionPolicy(path: WeatherAnalysisPath, text: string) {
  if (path !== 'tropical_cyclone_event') return null
  const blob = cleanText(text)
  if (/resolve|midday|next day|official storm list/i.test(blob)) return blob
  return 'Use the official NHC designation and any explicit post-deadline confirmation window in the market rules.'
}

function inferSourceKind(path: WeatherAnalysisPath, sourceUrl: string | null, rawSource: string) {
  const lowerUrl = String(sourceUrl || '').toLowerCase()
  const lowerSource = String(rawSource || '').toLowerCase()
  if (lowerUrl.includes('weather.gov/wrh/climate') || lowerSource.includes('daily climate report')) return 'weather_gov_climate'
  if (lowerUrl.includes('api.weather.gov')) return 'weather_gov_api'
  if (lowerUrl.includes('wunderground') || lowerSource.includes('wunderground')) return 'wunderground_station_history'
  if (lowerUrl.includes('nhc.noaa.gov') || lowerSource.includes('national hurricane center') || lowerSource.includes('nhc')) return 'nhc_official'
  if (lowerUrl.includes('ncei.noaa.gov') || lowerSource.includes('ncei')) return 'ncei_official'
  if (lowerUrl.includes('nsidc') || lowerSource.includes('nsidc')) return 'nsidc_official'
  if (path === 'tropical_cyclone_event') return 'nhc_official'
  return 'weather_official'
}

function inferAgency(path: WeatherAnalysisPath, sourceUrl: string | null, rawSource: string) {
  const sourceKind = inferSourceKind(path, sourceUrl, rawSource)
  switch (sourceKind) {
    case 'wunderground_station_history':
      return 'Wunderground'
    case 'nhc_official':
      return 'National Hurricane Center'
    case 'ncei_official':
      return 'NOAA NCEI'
    case 'nsidc_official':
      return 'NSIDC'
    default:
      return 'National Weather Service / NOAA'
  }
}

function inferHorizonBucket(path: WeatherAnalysisPath, event: PolymarketEvent) {
  if (path === 'tropical_cyclone_event' || path === 'climate_index_numeric') return 'seasonal'
  const deadline = event.endDate ? Date.parse(event.endDate) : NaN
  if (!Number.isFinite(deadline)) return 'medium_range'
  const days = (deadline - Date.now()) / 86_400_000
  if (days <= 3) return 'short_range'
  if (days <= 7) return 'medium_range'
  if (days <= 15) return 'extended'
  return 'seasonal'
}

function inferOfficialProducts(path: WeatherAnalysisPath) {
  switch (path) {
    case 'weather_station_bucket':
      return ['NWS forecastHourly', 'api.weather.gov station observations', 'settlement source mirror']
    case 'weather_accumulation_bucket':
      return ['NWS climate summaries', 'WPC probabilistic precipitation', 'CPC outlooks']
    case 'weather_first_occurrence_race':
      return ['NWS Daily Climate Report (CLI)', 'forecastHourly', 'winter weather guidance']
    case 'tropical_cyclone_event':
      return ['NHC Tropical Weather Outlook', 'NHC advisories', 'NHC storm list']
    case 'climate_index_numeric':
      return ['official climate dataset', 'CPC outlooks', 'dataset release calendar']
  }
}

function inferObservationProducts(path: WeatherAnalysisPath) {
  switch (path) {
    case 'weather_station_bucket':
      return ['api.weather.gov observations/latest', 'station daily climate page']
    case 'weather_accumulation_bucket':
      return ['NCEI daily summaries', 'weather.gov climate page']
    case 'weather_first_occurrence_race':
      return ['Daily Climate Report (CLI)', 'station observations']
    case 'tropical_cyclone_event':
      return ['NHC advisories', 'official storm list']
    case 'climate_index_numeric':
      return ['official dataset history']
  }
}

function inferEnsembleSources(path: WeatherAnalysisPath) {
  switch (path) {
    case 'weather_station_bucket':
    case 'weather_accumulation_bucket':
    case 'weather_first_occurrence_race':
      return ['NBM', 'GEFS', 'ECMWF ENS']
    case 'tropical_cyclone_event':
      return ['NHC official probabilities', 'CPC tropical hazards outlook']
    case 'climate_index_numeric':
      return ['seasonal outlooks', 'ensemble climate guidance']
  }
}

export function detectWeatherRouting(event: PolymarketEvent): WeatherRoutingResult | null {
  const title = cleanText(event.title).toLowerCase()
  const description = cleanText(event.description).toLowerCase()
  const resolutionSource = cleanText(event.resolutionSource).toLowerCase()
  const tags = Array.isArray(event.tags)
    ? event.tags.map((tag) => cleanText(tag.slug || tag.label || tag.name).toLowerCase()).filter(Boolean)
    : []
  const marketQuestions = (event.markets || []).map((market) => cleanText(market.question).toLowerCase())
  const fullText = [title, description, resolutionSource, ...marketQuestions].join('\n')
  const hasWeatherSignal =
    tags.some((tag) => WEATHER_TAGS.has(tag)) ||
    /\b(weather|temperature|precipitation|rainfall|snowfall|snow|rain|climate|hurricane|tropical storm|named storm|cyclone|sea ice)\b/.test(
      fullText
    )

  if (!hasWeatherSignal) return null

  const reasons: string[] = []
  let marketType: WeatherAnalysisPath

  if (/\b(hurricane|tropical storm|named storm|cyclone|landfall|tropical depression|hurricane season)\b/.test(fullText)) {
    marketType = 'tropical_cyclone_event'
    reasons.push('weather text contains tropical cyclone or hurricane settlement language')
  } else if (
    /where will .* first|which city .* first|first snow|first freeze|first measurable/.test(fullText) ||
    ((event.markets || []).length > 1 && /first/.test(title) && /(snow|freeze|precipitation|rain)/.test(fullText))
  ) {
    marketType = 'weather_first_occurrence_race'
    reasons.push('weather event compares multiple locations by first qualifying occurrence')
  } else if (
    /\b(precipitation|rainfall|snowfall|accumulation|snow in |rain in |precipitation in )\b/.test(fullText)
  ) {
    marketType = 'weather_accumulation_bucket'
    reasons.push('weather event settles on accumulated precipitation or snowfall over a window')
  } else if (
    /\b(highest temperature|lowest temperature|high temperature|low temperature|max temperature|min temperature|temperature in .* on )\b/.test(
      fullText
    )
  ) {
    marketType = 'weather_station_bucket'
    reasons.push('weather event settles on a station-level daily temperature extreme')
  } else if (/\b(sea ice|anomaly|climate index|enso|el nino|la nina)\b/.test(fullText)) {
    marketType = 'climate_index_numeric'
    reasons.push('weather event settles on a climate index or long-range climate dataset value')
  } else {
    marketType = 'weather_station_bucket'
    reasons.push('weather domain detected and defaulted to station-style settlement analysis')
  }

  return {
    domain: 'weather',
    marketType,
    reasons,
  }
}

export function buildWeatherResolutionSpec(
  event: PolymarketEvent,
  path: WeatherAnalysisPath,
  normalizedMarkets: NormalizedWeatherMarket[],
  primaryDeadline: string | null
): WeatherResolutionSpec {
  const sourceText = [cleanText(event.resolutionSource), cleanText(event.description)].filter(Boolean).join(' ')
  const sourceUrl = extractSourceUrl(sourceText)
  const title = cleanText(event.title)
  const description = cleanText(event.description)
  const location = findLocation([
    title,
    description,
    event.resolutionSource || '',
    ...normalizedMarkets.map((market) => market.label),
    ...normalizedMarkets.map((market) => market.question),
  ])
  const stationId = extractStationId(sourceText) || location?.stationId || null
  const stationName = stationId ? STATION_NAME_BY_ID[stationId] || location?.stationName || null : location?.stationName || null
  const fullText = [title, description, sourceText, ...normalizedMarkets.map((market) => market.label)].join(' ').toLowerCase()
  const buckets = parseNumericBuckets(normalizedMarkets)

  return {
    subtype: path,
    resolving_agency: inferAgency(path, sourceUrl, sourceText),
    source_url: sourceUrl || null,
    source_kind: inferSourceKind(path, sourceUrl, sourceText),
    station_id: stationId,
    station_name: stationName,
    location_name: location?.label || null,
    variable: inferVariable(path, fullText),
    unit: inferUnit(path, fullText),
    precision: inferPrecision(path, sourceText || fullText),
    aggregation: inferAggregation(path, fullText),
    window_start_iso: event.startDate || null,
    window_end_iso: primaryDeadline,
    timezone: location?.timezone || null,
    threshold:
      normalizedMarkets.length === 1 && normalizedMarkets[0]?.numeric_low !== null
        ? normalizedMarkets[0].numeric_low
        : null,
    buckets,
    tie_break_rule: inferTieBreakRule(path, `${event.description || ''} ${event.resolutionSource || ''}`),
    revision_policy: inferRevisionPolicy(path, `${event.description || ''} ${event.resolutionSource || ''}`),
  }
}

export function buildWeatherProfile(
  event: PolymarketEvent,
  path: WeatherAnalysisPath,
  spec: WeatherResolutionSpec,
  normalizedMarkets: NormalizedWeatherMarket[]
): WeatherProfile {
  const locationLabels =
    path === 'weather_first_occurrence_race'
      ? normalizedMarkets.map((market) => market.label).filter(Boolean).slice(0, 8)
      : [spec.location_name || spec.station_name || cleanText(event.title)].filter(Boolean)

  const modelingNotes = [
    'Treat the settlement variable definition as primary and model the weather only in that settlement frame.',
    'Prefer official forecast and observation products over generic weather commentary.',
  ]

  if (path === 'weather_accumulation_bucket') {
    modelingNotes.push('Split realized accumulation from remaining-window forecast instead of treating the whole month as one unknown.')
  } else if (path === 'weather_first_occurrence_race') {
    modelingNotes.push('Model each location separately and apply the market tie-break rule explicitly.')
  } else if (path === 'tropical_cyclone_event') {
    modelingNotes.push('Use official classification and timing from NHC, not generic model commentary.')
  }

  return {
    subtype: path,
    horizon_bucket: inferHorizonBucket(path, event),
    official_products: inferOfficialProducts(path),
    observation_products: inferObservationProducts(path),
    ensemble_sources: inferEnsembleSources(path),
    location_count: locationLabels.length,
    location_labels: locationLabels,
    modeling_notes: modelingNotes,
  }
}

export function buildWeatherSettlementRisk(
  path: WeatherAnalysisPath,
  spec: WeatherResolutionSpec
): WeatherSettlementRisk {
  const comments: string[] = []
  let sourceMismatch: 'low' | 'medium' | 'high' = spec.source_url ? 'low' : 'high'
  let stationMismatch: 'low' | 'medium' | 'high' =
    path === 'weather_station_bucket' || path === 'weather_accumulation_bucket'
      ? spec.station_id || spec.location_name
        ? 'medium'
        : 'high'
      : 'low'
  let timingMismatch: 'low' | 'medium' | 'high' = spec.window_end_iso ? 'medium' : 'high'
  let precisionRisk: 'low' | 'medium' | 'high' = spec.precision === null ? 'medium' : 'low'
  let revisionLagRisk: 'low' | 'medium' | 'high' = path === 'tropical_cyclone_event' ? 'high' : 'low'

  if (!spec.source_url) {
    comments.push('No explicit official resolution URL was parsed from the market rules.')
  }
  if ((path === 'weather_station_bucket' || path === 'weather_accumulation_bucket') && !spec.station_id) {
    comments.push('Station-level settlement appears likely, but no explicit station id was resolved.')
  }
  if (!spec.window_end_iso) {
    comments.push('Settlement window end could not be resolved from the event metadata.')
  }
  if (spec.precision === null) {
    comments.push('Precision or bucket edge rounding was not explicit in the parsed rules.')
  }
  if (path === 'tropical_cyclone_event') {
    comments.push('Official cyclone classification can lag the forecast signal and may resolve after the raw meteorological event begins.')
    sourceMismatch = spec.source_kind === 'nhc_official' ? 'low' : sourceMismatch
  }
  if (spec.source_kind === 'wunderground_station_history') {
    comments.push('Settlement mirrors a third-party station-history page, so the forecast source and settlement source may not match exactly.')
    sourceMismatch = sourceMismatch === 'low' ? 'medium' : sourceMismatch
  }

  return {
    source_mismatch: sourceMismatch,
    station_mismatch: stationMismatch,
    timing_mismatch: timingMismatch,
    precision_rounding_risk: precisionRisk,
    revision_lag_risk: revisionLagRisk,
    comments,
  }
}

export function buildWeatherStructuredContext(
  path: WeatherAnalysisPath,
  spec: WeatherResolutionSpec,
  profile: WeatherProfile,
  settlementRisk: WeatherSettlementRisk
  ) {
  const location = findLocation([spec.location_name || '', spec.station_name || ''])
  const pointsUrl =
    location && location.latitude !== null && location.longitude !== null
      ? `https://api.weather.gov/points/${location.latitude},${location.longitude}`
      : null
  const stationObservationUrl = spec.station_id
    ? `https://api.weather.gov/stations/${encodeURIComponent(spec.station_id)}/observations/latest`
    : null

  const officialLinks = [
    spec.source_url,
    location?.climateUrl || null,
    path === 'tropical_cyclone_event' ? 'https://www.nhc.noaa.gov/' : null,
    path === 'weather_accumulation_bucket' ? 'https://www.wpc.ncep.noaa.gov/Prob_Precip/' : null,
    path === 'weather_accumulation_bucket' || path === 'tropical_cyclone_event'
      ? 'https://www.cpc.ncep.noaa.gov/products/precip/CWlink/ghazards/'
      : null,
  ].filter(Boolean) as string[]

  return {
    subtype: path,
    location_name: spec.location_name,
    station_id: spec.station_id,
    station_name: spec.station_name,
    unit: spec.unit,
    variable: spec.variable,
    points_url: pointsUrl,
    station_observation_url: stationObservationUrl,
    official_links: officialLinks,
    preferred_products: profile.official_products,
    ensemble_sources: profile.ensemble_sources,
    settlement_risk: settlementRisk,
  }
}

export function summarizeWeatherRoutingReason(path: WeatherAnalysisPath) {
  switch (path) {
    case 'weather_station_bucket':
      return 'station-level weather bucket market'
    case 'weather_accumulation_bucket':
      return 'accumulated precipitation or snowfall market'
    case 'weather_first_occurrence_race':
      return 'multi-location first-occurrence weather race'
    case 'tropical_cyclone_event':
      return 'official tropical cyclone classification market'
    case 'climate_index_numeric':
      return 'climate dataset or long-range weather index market'
  }
}
