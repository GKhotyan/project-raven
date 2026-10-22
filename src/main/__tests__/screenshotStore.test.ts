import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { createScreenshotStore, ScreenshotError, type ScreenshotStore } from '../services/screenshotStore'
import type { SessionScreenshot } from '../../shared/screenshots'

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])

describe('screenshotStore', () => {
  let root: string
  let lists: Map<string, SessionScreenshot[]>
  let store: ScreenshotStore
  let ids: number

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'raven-shots-'))
    lists = new Map()
    ids = 0
    store = createScreenshotStore({
      rootDir: root,
      getList: (s) => lists.get(s) ?? [],
      setList: (s, l) => { lists.set(s, l) },
      now: () => 1_000,
      newId: () => `shot${++ids}`,
    })
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('saves a PNG and a JPEG with the right type and records them in order', () => {
    const a = store.add('sess1', PNG)
    const b = store.add('sess1', JPEG)

    expect(a).toEqual({ id: 'shot1', timestamp: 1_000, file: 'shot1.png', mediaType: 'image/png' })
    expect(b.mediaType).toBe('image/jpeg')
    expect(b.file).toBe('shot2.jpg')
    expect(existsSync(join(root, 'sess1', 'shot1.png'))).toBe(true)
    expect(store.list('sess1').map((s) => s.id)).toEqual(['shot1', 'shot2'])
    expect(store.read('sess1', 'shot1')).toEqual({ base64: Buffer.from(PNG).toString('base64'), mediaType: 'image/png' })
  })

  it('rejects non-image bytes, files over 10 MB and a 21st screenshot', () => {
    expect(() => store.add('sess1', Uint8Array.from([0x47, 0x49, 0x46]))).toThrow('Only PNG and JPEG images can be added.')
    const big = new Uint8Array(10 * 1024 * 1024 + 1)
    big.set(PNG)
    expect(() => store.add('sess1', big)).toThrow('Screenshot is larger than 10 MB.')
    for (let i = 0; i < 20; i++) store.add('sess1', PNG)
    expect(() => store.add('sess1', PNG)).toThrow(ScreenshotError)
    expect(() => store.add('sess1', PNG)).toThrow('This session already has 20 screenshots.')
    expect(store.list('sess1')).toHaveLength(20)
  })

  it('removes one screenshot and its file', () => {
    store.add('sess1', PNG)
    store.add('sess1', PNG)
    store.remove('sess1', 'shot1')

    expect(store.list('sess1').map((s) => s.id)).toEqual(['shot2'])
    expect(existsSync(join(root, 'sess1', 'shot1.png'))).toBe(false)
  })

  it('removeAll deletes the session folder and clears the list', () => {
    store.add('sess1', PNG)
    store.removeAll('sess1')

    expect(existsSync(join(root, 'sess1'))).toBe(false)
    expect(store.list('sess1')).toEqual([])
  })

  it('refuses ids and session ids that could leave the session folder', () => {
    writeFileSync(join(root, 'secret.png'), Buffer.from(PNG))
    lists.set('sess1', [{ id: '../secret', timestamp: 1, file: '../secret.png', mediaType: 'image/png' }])

    expect(store.read('sess1', '../secret')).toBeNull()
    store.remove('sess1', '../secret')
    expect(existsSync(join(root, 'secret.png'))).toBe(true)
    expect(() => store.add('../evil', PNG)).toThrow()
    expect(readdirSync(root)).toEqual(['secret.png'])
  })

  it('stores what prepare returns, so oversized images are shrunk before they reach a model', () => {
    const shrunk = Uint8Array.from([0xff, 0xd8, 0xff, 0xdb, 9])
    const prepare = vi.fn(() => ({ bytes: shrunk, mediaType: 'image/jpeg' as const }))
    const shrinking = createScreenshotStore({
      rootDir: root,
      getList: (s) => lists.get(s) ?? [],
      setList: (s, l) => { lists.set(s, l) },
      now: () => 1_000,
      newId: () => 'big1',
      prepare,
    })

    const shot = shrinking.add('sess1', PNG)

    expect(prepare).toHaveBeenCalledWith(PNG, 'image/png')
    expect(shot).toEqual({ id: 'big1', timestamp: 1_000, file: 'big1.jpg', mediaType: 'image/jpeg' })
    expect(shrinking.read('sess1', 'big1')).toEqual({ base64: Buffer.from(shrunk).toString('base64'), mediaType: 'image/jpeg' })
  })

  it('readMany skips a screenshot whose file is gone', () => {
    const a = store.add('sess1', PNG)
    const b = store.add('sess1', PNG)
    rmSync(join(root, 'sess1', a.file))

    const out = store.readMany('sess1', [a, b])
    expect(out.map((r) => r.shot.id)).toEqual(['shot2'])
    expect(store.read('sess1', a.id)).toBeNull()
  })
})
