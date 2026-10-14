import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { publishSummary } from '../services/summaryPublishService'

const { warn } = vi.hoisted(() => ({ warn: vi.fn() }))
vi.mock('../logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() }),
}))

describe('publishSummary', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('posts the meeting key and summary as JSON with the X-API-Key header', async () => {
    fetchMock.mockResolvedValue(new Response('ok', { status: 200 }))

    const result = await publishSummary({
      url: 'https://n8n.example.com/webhook/x',
      token: 'secret',
      meetingKey: 'hrm-daily:2026-10-14',
      summary: 'Text',
    })

    expect(result).toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://n8n.example.com/webhook/x')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'X-API-Key': 'secret', 'Content-Type': 'application/json' })
    expect(JSON.parse(init.body)).toEqual({ meeting_key: 'hrm-daily:2026-10-14', summary: 'Text' })
  })

  const send = () =>
    publishSummary({ url: 'https://n8n.example.com/w', token: 't', meetingKey: 'k', summary: 's' })

  it('includes the n8n JSON message in the error', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ code: 403, message: 'Authorization data is wrong!' }), { status: 403 }),
    )

    expect(await send()).toEqual({
      ok: false,
      error: 'n8n responded with HTTP 403: Authorization data is wrong!',
    })
  })

  it('logs the request headers and full body, but not the token, when n8n rejects it', async () => {
    warn.mockClear()
    fetchMock.mockResolvedValue(new Response('', { status: 403 }))

    await publishSummary({ url: 'https://n8n.example.com/w', token: 'secret-token', meetingKey: 'k', summary: 's' })

    expect(warn).toHaveBeenCalledWith('n8n webhook request body:', '{"meeting_key":"k","summary":"s"}')
    expect(warn).toHaveBeenCalledWith('n8n webhook request headers:', {
      'X-API-Key': '**** (12 chars)',
      'Content-Type': 'application/json',
    })
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret-token')
  })

  it('shows only the ends of a long token in the logged headers', async () => {
    warn.mockClear()
    fetchMock.mockResolvedValue(new Response('', { status: 403 }))

    await publishSummary({ url: 'https://n8n.example.com/w', token: 'abcd1234567890wxyz', meetingKey: 'k', summary: 's' })

    expect(warn).toHaveBeenCalledWith('n8n webhook request headers:', {
      'X-API-Key': 'abcd…wxyz (18 chars)',
      'Content-Type': 'application/json',
    })
  })

  it('strips HTML and truncates a long error body', async () => {
    const page = `<html><body><h1>Forbidden</h1><p>${'x'.repeat(300)}</p></body></html>`
    fetchMock.mockResolvedValue(new Response(page, { status: 403 }))

    const result = await send()

    expect(result.ok).toBe(false)
    const error = (result as { error: string }).error
    expect(error.startsWith('n8n responded with HTTP 403: Forbidden x')).toBe(true)
    expect(error).not.toContain('<')
    expect(error.endsWith('…')).toBe(true)
  })

  it('reports a non-2xx response with an empty body by status only', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 502 }))

    expect(await send()).toEqual({ ok: false, error: 'n8n responded with HTTP 502.' })
  })

  it('reports a network failure as an error', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'))

    const result = await publishSummary({ url: 'https://n8n.example.com/w', token: 't', meetingKey: 'k', summary: 's' })

    expect(result).toEqual({ ok: false, error: 'Could not reach n8n (ECONNREFUSED).' })
  })
})
