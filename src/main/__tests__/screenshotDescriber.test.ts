import { describe, expect, it, vi } from 'vitest'

vi.mock('../logger', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import {
  describeScreenshot,
  SCREENSHOT_DESCRIPTION_CHAR_CAP,
} from '../services/screenshotDescriber'

function setup(reply: string | Error = 'A login form with an error "Invalid token"') {
  const generateShort = vi.fn(async () => {
    if (reply instanceof Error) throw reply
    return reply
  })
  const store = {
    read: vi.fn(() => ({ base64: 'AAA', mediaType: 'image/png' as const })),
    setDescription: vi.fn(),
  }
  const getProvider = vi.fn(async () => ({ generateShort }) as never)
  return { generateShort, store, getProvider }
}

describe('describeScreenshot', () => {
  it('asks a vision model about the image and stores its answer', async () => {
    const { generateShort, store, getProvider } = setup()

    const ok = await describeScreenshot({ store, getProvider, sessionId: 's1', shotId: 'a' })

    expect(ok).toBe(true)
    expect(generateShort).toHaveBeenCalledWith(
      expect.objectContaining({ images: [{ base64: 'AAA', mediaType: 'image/png' }] }),
    )
    expect(store.setDescription).toHaveBeenCalledWith('s1', 'a', 'A login form with an error "Invalid token"')
  })

  it('skips when no configured model reads images', async () => {
    const { store } = setup()

    const ok = await describeScreenshot({ store, getProvider: async () => null, sessionId: 's1', shotId: 'a' })

    expect(ok).toBe(false)
    expect(store.setDescription).not.toHaveBeenCalled()
  })

  it('skips a screenshot whose file is already gone', async () => {
    const { store, getProvider, generateShort } = setup()
    store.read.mockReturnValueOnce(null as never)

    expect(await describeScreenshot({ store, getProvider, sessionId: 's1', shotId: 'a' })).toBe(false)
    expect(generateShort).not.toHaveBeenCalled()
  })

  it('swallows model errors and empty replies, leaving the image path in place', async () => {
    for (const reply of [new Error('rate limited'), '   ']) {
      const { store, getProvider } = setup(reply)
      expect(await describeScreenshot({ store, getProvider, sessionId: 's1', shotId: 'a' })).toBe(false)
      expect(store.setDescription).not.toHaveBeenCalled()
    }
  })

  it('caps a runaway description', async () => {
    const { store, getProvider } = setup('x'.repeat(SCREENSHOT_DESCRIPTION_CHAR_CAP + 500))

    await describeScreenshot({ store, getProvider, sessionId: 's1', shotId: 'a' })

    const stored = store.setDescription.mock.calls[0][2] as string
    expect(stored.length).toBeLessThanOrEqual(SCREENSHOT_DESCRIPTION_CHAR_CAP + 20)
    expect(stored.endsWith('[...truncated]')).toBe(true)
  })
})
