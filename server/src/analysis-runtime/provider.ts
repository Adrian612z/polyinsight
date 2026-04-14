export function normalizeAnalysisProviderBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '')
}

export function buildAnalysisProviderHeaders(apiKey: string): Record<string, string> {
  const normalizedApiKey = apiKey.trim()

  return {
    'content-type': 'application/json',
    authorization: `Bearer ${normalizedApiKey}`,
    'x-api-key': normalizedApiKey,
    'x-goog-api-key': normalizedApiKey,
  }
}

export function formatAnalysisProviderSummary(input: {
  engine: 'code' | 'n8n'
  baseUrl: string
  apiKey: string | null | undefined
  models: {
    extract: string
    analysis: string
    audit: string
    report: string
  }
}): string {
  const normalizedBaseUrl = normalizeAnalysisProviderBaseUrl(input.baseUrl)
  const trimmedApiKey = input.apiKey?.trim() || ''

  try {
    const url = new URL(normalizedBaseUrl)
    return [
      `engine=${input.engine}`,
      `baseUrl=${normalizedBaseUrl}`,
      `host=${url.host}`,
      `path=${url.pathname || '/'}`,
      `apiKeyPresent=${trimmedApiKey ? 'true' : 'false'}`,
      `apiKeyLength=${trimmedApiKey.length}`,
      `models=${input.models.extract}|${input.models.analysis}|${input.models.audit}|${input.models.report}`,
      'authHeaders=authorization,x-api-key,x-goog-api-key',
    ].join(', ')
  } catch {
    return [
      `engine=${input.engine}`,
      `baseUrl=${normalizedBaseUrl}`,
      'host=<invalid-url>',
      `apiKeyPresent=${trimmedApiKey ? 'true' : 'false'}`,
      `apiKeyLength=${trimmedApiKey.length}`,
      `models=${input.models.extract}|${input.models.analysis}|${input.models.audit}|${input.models.report}`,
      'authHeaders=authorization,x-api-key,x-goog-api-key',
    ].join(', ')
  }
}
