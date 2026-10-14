import { createLogger } from '../logger'

const log = createLogger('SummaryPublish')

const PUBLISH_TIMEOUT_MS = 15_000

export type PublishSummaryResult = { ok: true } | { ok: false; error: string }

function isElectronRuntime(): boolean {
  return typeof process.versions.electron === 'string'
}

/**
 * Electron's Node fetch can fail on corporate TLS; Chromium `net.fetch` uses
 * the system cert store. Tests and non-Electron callers use global fetch.
 */
async function post(url: string, init: RequestInit): Promise<Response> {
  if (isElectronRuntime()) {
    const { net } = await import('electron')
    if (typeof net?.fetch === 'function') return (await net.fetch(url, init)) as Response
  }
  return fetch(url, init)
}

const ERROR_BODY_LIMIT = 200

/**
 * Short, readable reason from an error response: n8n's JSON `message` when
 * present, otherwise the body text with any HTML tags stripped.
 */
async function readErrorDetail(response: Response): Promise<string> {
  let body: string
  try {
    body = await response.text()
  } catch {
    return ''
  }
  let detail = body
  try {
    const parsed = JSON.parse(body) as { message?: unknown }
    if (typeof parsed?.message === 'string') detail = parsed.message
  } catch {
    detail = body.replace(/<[^>]*>/g, ' ')
  }
  detail = detail.replace(/\s+/g, ' ').trim()
  return detail.length > ERROR_BODY_LIMIT ? `${detail.slice(0, ERROR_BODY_LIMIT)}…` : detail
}

/** "abcd…wxyz (32 chars)" — enough to compare with the n8n credential. */
function maskToken(token: string): string {
  const visible = token.length > 12 ? `${token.slice(0, 4)}…${token.slice(-4)}` : '****'
  return `${visible} (${token.length} chars)`
}

/** POST the summary to the n8n webhook that publishes it to Mattermost. */
export async function publishSummary(params: {
  url: string
  token: string
  meetingKey: string
  summary: string
}): Promise<PublishSummaryResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PUBLISH_TIMEOUT_MS)
  try {
    const body = JSON.stringify({ meeting_key: params.meetingKey, summary: params.summary })
    const headers = { 'X-API-Key': params.token, 'Content-Type': 'application/json' }
    const response = await post(params.url, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    })
    if (!response.ok) {
      const detail = await readErrorDetail(response)
      log.warn('n8n webhook rejected summary:', response.status, detail)
      // Logged at warn so it survives production builds; mask the token.
      log.warn('n8n webhook request headers:', { ...headers, 'X-API-Key': maskToken(params.token) })
      log.warn('n8n webhook request body:', body)
      return {
        ok: false,
        error: `n8n responded with HTTP ${response.status}${detail ? `: ${detail}` : '.'}`,
      }
    }
    return { ok: true }
  } catch (err) {
    const detail = controller.signal.aborted
      ? `timed out after ${PUBLISH_TIMEOUT_MS / 1000}s`
      : err instanceof Error && err.message.trim()
        ? err.message.trim()
        : 'network error'
    log.warn('n8n webhook unreachable:', detail)
    return { ok: false, error: `Could not reach n8n (${detail}).` }
  } finally {
    clearTimeout(timer)
  }
}
