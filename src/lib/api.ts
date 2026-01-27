/**
 * 带重试的 fetch 请求
 * @param url 请求 URL
 * @param options fetch 选项
 * @param retries 重试次数，默认 3 次
 * @param delay 重试延迟（毫秒），默认 1000ms
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retries = 3,
  delay = 1000
): Promise<Response> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options)

      // 如果是服务器错误（5xx），尝试重试
      if (response.status >= 500 && attempt < retries) {
        await sleep(delay * (attempt + 1)) // 指数退避
        continue
      }

      return response
    } catch (error) {
      lastError = error as Error

      // 网络错误时重试
      if (attempt < retries) {
        await sleep(delay * (attempt + 1))
        continue
      }
    }
  }

  throw lastError || new Error('请求失败')
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 解析错误信息，返回用户友好的提示
 */
export function parseErrorMessage(error: unknown): string {
  if (error instanceof TypeError && error.message === 'Failed to fetch') {
    return '网络连接失败。请检查网络连接，或确认 n8n Webhook 已正确配置 CORS。'
  }

  // DOMException (包括 AbortError)
  if (error instanceof DOMException) {
    if (error.name === 'AbortError') {
      return '请求超时，请稍后重试。'
    }
    return error.message
  }

  if (error instanceof Error) {
    // 超时错误 (某些环境下可能是普通 Error)
    if (error.name === 'AbortError') {
      return '请求超时，请稍后重试。'
    }
    return error.message
  }

  return '发生未知错误，请稍后重试。'
}
