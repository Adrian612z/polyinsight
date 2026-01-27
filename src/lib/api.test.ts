import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchWithRetry, parseErrorMessage } from './api'

describe('fetchWithRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('成功请求应直接返回响应', async () => {
    const mockResponse = new Response('ok', { status: 200 })
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse)

    const response = await fetchWithRetry('http://test.com')

    expect(response).toBe(mockResponse)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('5xx 错误应触发重试', async () => {
    const mockError = new Response('error', { status: 500 })
    const mockSuccess = new Response('ok', { status: 200 })

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockError)
      .mockResolvedValueOnce(mockSuccess)

    const promise = fetchWithRetry('http://test.com', {}, 3, 100)

    // 快进时间以跳过延迟
    await vi.advanceTimersByTimeAsync(100)

    const response = await promise
    expect(response.status).toBe(200)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('4xx 错误不应重试', async () => {
    const mockResponse = new Response('not found', { status: 404 })
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse)

    const response = await fetchWithRetry('http://test.com')

    expect(response.status).toBe(404)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})

describe('parseErrorMessage', () => {
  it('应处理 Failed to fetch 网络错误', () => {
    const error = new TypeError('Failed to fetch')
    const message = parseErrorMessage(error)
    expect(message).toContain('网络连接失败')
  })

  it('应处理 AbortError 超时', () => {
    const error = new DOMException('The operation was aborted', 'AbortError')
    const message = parseErrorMessage(error)
    expect(message).toContain('超时')
  })

  it('应返回普通 Error 的消息', () => {
    const error = new Error('自定义错误')
    const message = parseErrorMessage(error)
    expect(message).toBe('自定义错误')
  })

  it('应处理未知错误', () => {
    const message = parseErrorMessage('string error')
    expect(message).toContain('未知错误')
  })

  it('应处理 null 和 undefined', () => {
    expect(parseErrorMessage(null)).toContain('未知错误')
    expect(parseErrorMessage(undefined)).toContain('未知错误')
  })
})
