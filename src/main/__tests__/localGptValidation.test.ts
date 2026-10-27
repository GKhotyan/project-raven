import { afterEach, describe, expect, it, vi } from 'vitest'
const { create } = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('openai', () => ({ default: vi.fn(function () { return { chat: { completions: { create } } } }) }))
import { validateKeys } from '../validators'
import type { AIProviderName } from '../../shared/aiSlots'

afterEach(() => vi.unstubAllGlobals())

describe('Gemma 4 key validation', () => {
  it('checks the documented chat endpoint when Gemma 4 is the only key', async () => {
    create.mockResolvedValue({ choices: [{ message: { content: 'ok' } }] })
    expect(await validateKeys('', 'local-gpt' as AIProviderName, 'local-key', { gemma4BaseUrl: 'https://example.test/v1' })).toEqual({ valid: true })
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ model: 'detmir-gpt', stream: false, use_tools: 'never', max_tokens: 8 }))
  })
  it('does not report rejected credentials as valid', async () => {
    create.mockRejectedValue(Object.assign(new Error('unauthorized'), { status: 401 }))
    expect(await validateKeys('', 'local-gpt' as AIProviderName, 'bad-key')).toMatchObject({ valid: false, aiError: 'Invalid Gemma 4 API key.' })
  })
  it('reports a secondary Gemma 4 failure while preserving the primary result', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })))
    create.mockRejectedValue(Object.assign(new Error('forbidden'), { status: 403 }))
    expect(await validateKeys('', 'openai', 'openai-key', { localGptKey: 'bad-local-key', gemma4BaseUrl: 'https://example.test/v1' })).toMatchObject({
      valid: false, localGptError: 'Gemma 4 returned status 403.', aiError: undefined,
    })
  })

})
