export interface RetrievalFetchResult {
  label: string
  url: string | null
  ok: boolean
  status: number | null
  timed_out: boolean
  content_type: string | null
  error: string | null
  data: any
}

const RETRIEVAL_FETCH_TIMEOUT_MS = 5_000

export async function fetchSourceLoose(url: string, label: string): Promise<RetrievalFetchResult> {
  if (!url) {
    return {
      label,
      url: null,
      ok: false,
      status: null,
      timed_out: false,
      content_type: null,
      error: 'URL not provided',
      data: null,
    }
  }

  const signal = AbortSignal.timeout(RETRIEVAL_FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(url, { signal })
    const text = await response.text()
    const contentType = response.headers.get('content-type')
    let data: unknown = null
    if (text) {
      try {
        data = JSON.parse(text)
      } catch {
        data = text
      }
    }

    return {
      label,
      url,
      ok: response.ok,
      status: response.status,
      timed_out: false,
      content_type: contentType,
      error: response.ok ? null : `${response.status} ${response.statusText}`.trim(),
      data,
    }
  } catch (error) {
    const timedOut =
      error instanceof Error &&
      (error.name === 'TimeoutError' || /aborted|timeout/i.test(error.message))

    return {
      label,
      url,
      ok: false,
      status: null,
      timed_out: timedOut,
      content_type: null,
      error: error instanceof Error ? error.message.slice(0, 240) : 'Unknown fetch error',
      data: null,
    }
  }
}
