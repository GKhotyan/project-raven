import { vi, describe, it, expect, beforeEach } from 'vitest'

const { mockCreate, mockCtor } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockCtor: vi.fn(),
}))

vi.mock('openai', () => ({
  default: vi.fn(function (opts: unknown) {
    mockCtor(opts)
    return { chat: { completions: { create: mockCreate } } }
  }),
}))

import { ZaiProvider } from '../services/ai/zaiProvider'

const emptyStream = () => ({ [Symbol.asyncIterator]: async function* () {} })
const callbacks = () => ({ onText: vi.fn(), onDone: vi.fn(), onError: vi.fn() })
const PNG = { type: 'image' as const, base64: 'iVBORw0KGgo=', mediaType: 'image/png' }

describe('ZaiProvider', () => {
  beforeEach(() => {
    mockCreate.mockReset()
    mockCtor.mockReset()
  })

  it('has name "zai" and talks to the Z.ai base URL with the Z.ai key', async () => {
    const provider = new ZaiProvider('zai-test-key', 'glm-5.2')
    mockCreate.mockResolvedValueOnce(emptyStream())

    await provider.streamResponse({ system: 'S', messages: [{ role: 'user', content: 'Hi' }] }, callbacks())

    expect(provider.name).toBe('zai')
    expect(mockCtor).toHaveBeenCalledWith({ apiKey: 'zai-test-key', baseURL: 'https://api.z.ai/api/paas/v4/' })
  })

  it('streams with max_tokens and an explicit thinking switch, never OpenAI-only params', async () => {
    const provider = new ZaiProvider('k', 'glm-5.2', 'low')
    mockCreate.mockResolvedValueOnce(emptyStream())

    await provider.streamResponse(
      { system: 'S', messages: [{ role: 'user', content: 'Hi' }], maxTokens: 256 },
      callbacks(),
    )

    const payload = mockCreate.mock.calls[0][0] as Record<string, unknown>
    expect(payload.model).toBe('glm-5.2')
    expect(payload.max_tokens).toBe(256)
    expect(payload).not.toHaveProperty('max_completion_tokens')
    expect(payload).not.toHaveProperty('reasoning_effort')
    expect(payload.thinking).toEqual({ type: 'disabled' })
    expect(payload.stream).toBe(true)
  })

  it('enables thinking for effort high', async () => {
    const provider = new ZaiProvider('k', 'glm-5.1', 'high')
    mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: ' ok ' } }] })

    const text = await provider.generateShort({ prompt: 'title' })

    const payload = mockCreate.mock.calls[0][0] as Record<string, unknown>
    expect(text).toBe('ok')
    expect(payload.thinking).toEqual({ type: 'enabled' })
    expect(payload.max_tokens).toBe(128000)
    expect(payload).not.toHaveProperty('max_completion_tokens')
  })

  it('replaces screenshots with a note for text-only GLM models', async () => {
    const provider = new ZaiProvider('k', 'glm-5.2')
    mockCreate.mockResolvedValueOnce(emptyStream())

    await provider.streamResponse(
      { system: 'S', messages: [{ role: 'user', content: [{ type: 'text', text: 'What is on screen?' }, PNG] }] },
      callbacks(),
    )

    const payload = mockCreate.mock.calls[0][0] as { messages: Array<{ role: string; content: unknown }> }
    expect(payload.messages[1]).toEqual({
      role: 'user',
      content: 'What is on screen?\n[Screenshot omitted: this model cannot read images.]',
    })
  })

  it('keeps image_url parts for GLM-5V', async () => {
    const provider = new ZaiProvider('k', 'glm-5v-turbo')
    mockCreate.mockResolvedValueOnce(emptyStream())

    await provider.streamResponse(
      { system: 'S', messages: [{ role: 'user', content: [{ type: 'text', text: 'Look' }, PNG] }] },
      callbacks(),
    )

    const payload = mockCreate.mock.calls[0][0] as { messages: Array<{ role: string; content: unknown }> }
    expect(payload.messages[1].content).toEqual([
      { type: 'text', text: 'Look' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,iVBORw0KGgo=' } },
    ])
  })

  it('reports a bad key as a Z.ai key, not an OpenAI key', async () => {
    const provider = new ZaiProvider('bad', 'glm-5.2')
    mockCreate.mockRejectedValueOnce(Object.assign(new Error('unauthorized'), { status: 401 }))
    const cb = callbacks()

    await expect(
      provider.streamResponse({ system: 'S', messages: [{ role: 'user', content: 'Hi' }] }, cb),
    ).rejects.toThrow('unauthorized')

    expect(cb.onError).toHaveBeenCalledWith('Invalid Z.ai API key. Check settings.')
  })
})
