import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export function getOutboundProxyUrl(): string | null {
  return (
    process.env.OUTBOUND_HTTP_PROXY ||
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    process.env.ALL_PROXY ||
    null
  )
}

export function buildCurlArgs(url: string, extraArgs: string[] = []): string[] {
  const args = [...extraArgs]
  const proxyUrl = getOutboundProxyUrl()
  if (proxyUrl) {
    args.push('--proxy', proxyUrl)
  }
  args.push(url)
  return args
}

export async function fetchJsonWithCurl<T>(
  url: string,
  extraArgs: string[] = [],
  options?: { maxBuffer?: number },
): Promise<T> {
  const { stdout } = await execFileAsync('curl', buildCurlArgs(url, extraArgs), {
    ...(options?.maxBuffer ? { maxBuffer: options.maxBuffer } : {}),
  })

  return JSON.parse(stdout) as T
}

export async function fetchResponseWithCurl(
  url: string,
  extraArgs: string[] = [],
): Promise<Response> {
  const { stdout } = await execFileAsync(
    'curl',
    buildCurlArgs(url, [
      ...extraArgs,
      '-w', '\n%{http_code}',
    ]),
  )

  const lines = stdout.split(/\r?\n/)
  const status = Number(lines.pop() || '0') || 200
  const body = lines.join('\n')

  return new Response(body, {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
