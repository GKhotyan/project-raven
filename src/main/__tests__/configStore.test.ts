import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Conf from 'conf'
import { mkdtempSync, readdirSync, rmSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { openEncryptedConfig } from '../configStore'

type Settings = { apiKey: string; onboarded: boolean }
const defaults: Settings = { apiKey: '', onboarded: false }

let dir: string
let filePath: string
const log = { warn: vi.fn(), info: vi.fn() }

function open(encryptionKey: string): Conf<Settings> {
  return new Conf<Settings>({ cwd: dir, configName: 'raven-config', defaults, encryptionKey })
}

function seed(encryptionKey: string, data: Partial<Settings>): void {
  const s = open(encryptionKey)
  s.set(data as Settings)
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'raven-config-'))
  filePath = join(dir, 'raven-config.json')
  vi.clearAllMocks()
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('openEncryptedConfig', () => {
  it('opens a config written with the current key', () => {
    seed('current', { apiKey: 'sk-1', onboarded: true })

    const s = openEncryptedConfig({ filePath, key: 'current', legacyKeys: ['old'], open, log })

    expect(s.get('apiKey')).toBe('sk-1')
    expect(s.get('onboarded')).toBe(true)
  })

  it('migrates a config written with a legacy key to the current key', () => {
    seed('old', { apiKey: 'sk-1', onboarded: true })

    const s = openEncryptedConfig({ filePath, key: 'current', legacyKeys: ['old'], open, log })

    expect(s.get('apiKey')).toBe('sk-1')
    expect(open('current').get('onboarded')).toBe(true)
    expect(() => open('old')).toThrow()
    expect(readdirSync(dir)).toEqual(['raven-config.json'])
  })

  it('moves an unreadable config aside instead of deleting it', () => {
    seed('lost', { apiKey: 'sk-1', onboarded: true })

    const s = openEncryptedConfig({ filePath, key: 'current', legacyKeys: ['old'], open, log })

    expect(s.get('onboarded')).toBe(false)
    const aside = readdirSync(dir).filter((f) => f.startsWith('raven-config.unreadable-'))
    expect(aside).toHaveLength(1)
    expect(new Conf<Settings>({
      cwd: dir, configName: aside[0].replace(/\.json$/, ''), defaults, encryptionKey: 'lost',
    }).get('apiKey')).toBe('sk-1')
    expect(log.warn).toHaveBeenCalled()
  })

  it('creates a fresh config when none exists', () => {
    const s = openEncryptedConfig({ filePath, key: 'current', legacyKeys: ['old'], open, log })

    expect(s.get('onboarded')).toBe(false)
    expect(existsSync(filePath)).toBe(true)
    expect(log.warn).not.toHaveBeenCalled()
  })
})
