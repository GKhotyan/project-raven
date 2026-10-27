import { beforeEach, describe, expect, it, vi } from 'vitest'

const { create, ctor } = vi.hoisted(() => ({ create: vi.fn(), ctor: vi.fn() }))
vi.mock('openai', () => ({ default: vi.fn(function (opts: unknown) {
  ctor(opts)
  return { chat: { completions: { create } } }
}) }))

import { getProvider, clearProviderCache } from '../services/ai/providerFactory'
import type { AIProviderName } from '../../shared/aiSlots'

const provider = () => getProvider({ provider: 'local-gpt' as AIProviderName, apiKey: 'test-local-key', model: 'detmir-gpt', baseURL: 'https://example.test/v1' })
const callbacks = () => ({ onText: vi.fn(), onDone: vi.fn(), onError: vi.fn() })

beforeEach(() => clearProviderCache())

describe('Gemma 4', () => {
  it('uses the private endpoint and delivers a complete chat response without streaming or reasoning', async () => {
    create.mockResolvedValue({ choices: [{ message: { content: 'Привет' } }] })
    const cb = callbacks()
    await provider().streamResponse({ system: 'Be helpful', messages: [{ role: 'user', content: 'Hello' }] }, cb)
    expect(ctor).toHaveBeenCalledWith(expect.objectContaining({ baseURL: 'https://example.test/v1', apiKey: 'test-local-key' }))
    const body = create.mock.calls[0][0]
    expect(body).toMatchObject({ model: 'detmir-gpt', use_tools: 'never', stream: false, messages: [{ role: 'system', content: 'Be helpful' }, { role: 'user', content: 'Hello' }] })
    expect(body).not.toHaveProperty('reasoning_effort')
    expect(body).not.toHaveProperty('max_completion_tokens')
    expect(cb.onText).toHaveBeenCalledWith('Привет')
    expect(cb.onDone).toHaveBeenCalledWith('Привет')
    expect(cb.onError).not.toHaveBeenCalled()
  })

  it('generates notes and omits unconfirmed image payloads', async () => {
    create.mockResolvedValue({ choices: [{ message: { content: ' Notes ' } }] })
    expect(await provider().generateShort({ prompt: 'Summarize', maxTokens: 80, images: [{ base64: 'AAAA', mediaType: 'image/png' }] })).toBe('Notes')
    expect(create.mock.calls[0][0]).toMatchObject({ stream: false, use_tools: 'never', max_tokens: 80, messages: [{ role: 'user', content: 'Summarize\n[Screenshot omitted: this model cannot read images.]' }] })
  })

  it('reports authentication errors with the Gemma 4 label', async () => {
    create.mockRejectedValue(Object.assign(new Error('unauthorized'), { status: 401 }))
    const cb = callbacks()
    await expect(provider().streamResponse({ system: '', messages: [] }, cb)).rejects.toThrow('unauthorized')
    expect(cb.onError).toHaveBeenCalledWith('Invalid Gemma 4 API key. Check settings.')
    expect(cb.onDone).not.toHaveBeenCalled()
  })
})
