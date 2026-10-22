import { describe, expect, it, vi } from 'vitest'
import { createScreenshotHandlers } from '../screenshotIpc'
import { ScreenshotError } from '../services/screenshotStore'

vi.mock('../logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

const shot = { id: 'shot1', timestamp: 1, file: 'shot1.png', mediaType: 'image/png' as const }

function setup(over: { session?: { id: string } | null; incognito?: boolean } = {}) {
  const store = {
    add: vi.fn(() => shot),
    list: vi.fn(() => [shot]),
    read: vi.fn(() => ({ base64: 'AAAA', mediaType: 'image/png' as const })),
    readMany: vi.fn(),
    remove: vi.fn(),
    removeAll: vi.fn(),
  }
  const handlers = createScreenshotHandlers({
    store,
    getActiveSession: () => (over.session === undefined ? { id: 'sess1' } : over.session),
    isIncognito: () => over.incognito ?? false,
  })
  return { store, handlers }
}

describe('screenshot IPC handlers', () => {
  it('adds bytes to the active session', () => {
    const { store, handlers } = setup()
    const res = handlers.add(new Uint8Array([1, 2]))
    expect(res).toEqual({ ok: true, value: { ...shot, sessionId: 'sess1' } })
    expect(store.add).toHaveBeenCalledWith('sess1', new Uint8Array([1, 2]))
  })

  it('refuses to add without a recording, in incognito, or for non-bytes', () => {
    expect(setup({ session: null }).handlers.add(new Uint8Array([1]))).toEqual({ ok: false, error: 'Start recording to add screenshots.' })
    expect(setup({ incognito: true }).handlers.add(new Uint8Array([1]))).toEqual({ ok: false, error: 'Screenshots are off in incognito mode.' })
    expect(setup().handlers.add('nope')).toEqual({ ok: false, error: 'Only PNG and JPEG images can be added.' })
  })

  it('turns a store validation error into a readable result', () => {
    const { store, handlers } = setup()
    store.add.mockImplementationOnce(() => { throw new ScreenshotError('Screenshot is larger than 10 MB.') })
    expect(handlers.add(new Uint8Array([1]))).toEqual({ ok: false, error: 'Screenshot is larger than 10 MB.' })
  })

  it('lists the active session when no id is given, or the given session', () => {
    expect(setup().handlers.list()).toEqual({ ok: true, value: { sessionId: 'sess1', screenshots: [shot] } })
    expect(setup({ session: null }).handlers.list()).toEqual({ ok: true, value: { sessionId: null, screenshots: [] } })
    const { store, handlers } = setup()
    handlers.list('other')
    expect(store.list).toHaveBeenCalledWith('other')
  })

  it('reads a screenshot as a data URL and reports a missing one', () => {
    const { store, handlers } = setup()
    expect(handlers.read('sess1', 'shot1')).toEqual({ ok: true, value: 'data:image/png;base64,AAAA' })
    store.read.mockReturnValueOnce(null)
    expect(handlers.read('sess1', 'gone')).toEqual({ ok: false, error: 'Screenshot not found.' })
  })

  it('removes and validates argument types', () => {
    const { store, handlers } = setup()
    expect(handlers.remove('sess1', 'shot1')).toEqual({ ok: true, value: true })
    expect(store.remove).toHaveBeenCalledWith('sess1', 'shot1')
    expect(handlers.remove(42, 'shot1')).toEqual({ ok: false, error: 'Invalid screenshot.' })
  })
})
