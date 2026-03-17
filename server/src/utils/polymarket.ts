const POLYMARKET_HOSTS = new Set(['polymarket.com', 'www.polymarket.com'])

function normalizePathSegments(pathname: string): string[] {
  return pathname
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
}

export function extractPolymarketSlug(input: string): string | null {
  try {
    const parsed = new URL(input)
    if (
      (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') ||
      (!POLYMARKET_HOSTS.has(parsed.hostname) && !parsed.hostname.endsWith('.polymarket.com'))
    ) {
      return null
    }

    const segments = normalizePathSegments(parsed.pathname)
    if (segments.length < 2) {
      return null
    }

    const slug = decodeURIComponent(segments[segments.length - 1]).trim()
    return slug || null
  } catch {
    return null
  }
}

export function isValidPolymarketUrl(input: string): boolean {
  return extractPolymarketSlug(input) !== null
}

export function toCanonicalPolymarketEventUrl(input: string): string | null {
  const slug = extractPolymarketSlug(input)
  return slug ? `https://polymarket.com/event/${slug}` : null
}
