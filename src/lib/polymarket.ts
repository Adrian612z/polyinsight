function getPathSegments(url: string): string[] {
  try {
    return new URL(url)
      .pathname
      .split('/')
      .map((segment) => segment.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

export function extractPolymarketSlug(url: string): string | null {
  const segments = getPathSegments(url)
  if (segments.length < 2) return null
  return decodeURIComponent(segments[segments.length - 1]) || null
}

export function formatPolymarketSlugLabel(url: string, maxLength = 50): string {
  const slug = extractPolymarketSlug(url)
  if (!slug) return url.slice(0, maxLength)
  return slug.replace(/-/g, ' ').slice(0, maxLength)
}
