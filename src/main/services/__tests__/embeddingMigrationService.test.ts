import { vi, describe, it, expect, beforeEach } from 'vitest'

const { embedPassages, invalidateEmbeddingCache, indexSession, invalidateSessionQaCache, db } = vi.hoisted(() => ({
  embedPassages: vi.fn(),
  invalidateEmbeddingCache: vi.fn(),
  indexSession: vi.fn(),
  invalidateSessionQaCache: vi.fn(),
  db: {
    getStaleContextFiles: vi.fn(),
    getStaleSessionChunkIds: vi.fn(),
    getContextChunksForFile: vi.fn(),
    replaceContextChunks: vi.fn(),
    deleteSessionChunks: vi.fn(),
  },
}))

vi.mock('../ragService', async () => {
  const { chunkText } = await vi.importActual<typeof import('../ragService')>('../ragService')
  return { chunkText, embedPassages, invalidateEmbeddingCache }
})
vi.mock('../sessionIndexService', () => ({ indexSession }))
vi.mock('../sessionQaService', () => ({ invalidateSessionQaCache }))
vi.mock('../database', () => ({ databaseService: db }))
vi.mock('../../logger', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { mergeOverlappingChunks, migrateStaleEmbeddings } from '../embeddingMigrationService'
import { chunkText } from '../ragService'

const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ')

describe('mergeOverlappingChunks', () => {
  it('rebuilds text chunked with the legacy 500/50 settings', () => {
    const text = words(1234)
    expect(mergeOverlappingChunks(chunkText(text, 500, 50))).toBe(text)
  })

  it('rebuilds text chunked with the current settings', () => {
    const text = words(777)
    expect(mergeOverlappingChunks(chunkText(text))).toBe(text)
  })

  it('handles a single chunk and no chunks', () => {
    expect(mergeOverlappingChunks(['a b c'])).toBe('a b c')
    expect(mergeOverlappingChunks([])).toBe('')
  })

  it('concatenates chunks that do not overlap', () => {
    expect(mergeOverlappingChunks(['a b', 'c d'])).toBe('a b c d')
  })
})

describe('migrateStaleEmbeddings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.getStaleContextFiles.mockReturnValue([])
    db.getStaleSessionChunkIds.mockReturnValue([])
  })

  it('does nothing (and loads no model) when every chunk is current', async () => {
    await migrateStaleEmbeddings()

    expect(db.getStaleContextFiles).toHaveBeenCalledWith('Xenova/multilingual-e5-small')
    expect(embedPassages).not.toHaveBeenCalled()
    expect(indexSession).not.toHaveBeenCalled()
  })

  it('re-chunks and re-embeds a stale document from its stored chunks', async () => {
    const text = words(600)
    db.getStaleContextFiles.mockReturnValue([{ fileId: 'f1', modeId: 'm1', fileName: 'doc.pdf' }])
    db.getContextChunksForFile.mockReturnValue(
      chunkText(text, 500, 50).map((chunkText, i) => ({ id: `old${i}`, chunkIndex: i, chunkText, embeddingJson: '[]', fileName: 'doc.pdf' })),
    )
    embedPassages.mockImplementation(async (chunks: string[]) => chunks.map(() => [0.5]))

    await migrateStaleEmbeddings()

    const expected = chunkText(text)
    expect(embedPassages).toHaveBeenCalledWith(expected)
    const [fileId, rows] = db.replaceContextChunks.mock.calls[0]
    expect(fileId).toBe('f1')
    expect(rows.map((r: { chunkText: string }) => r.chunkText)).toEqual(expected)
    expect(rows[0]).toEqual(
      expect.objectContaining({ modeId: 'm1', fileName: 'doc.pdf', chunkIndex: 0, embeddingModel: 'Xenova/multilingual-e5-small' }),
    )
    expect(invalidateEmbeddingCache).toHaveBeenCalledWith('m1')
  })

  it('clears and re-indexes stale sessions', async () => {
    db.getStaleSessionChunkIds.mockReturnValue(['s1', 's2'])

    await migrateStaleEmbeddings()

    expect(db.deleteSessionChunks).toHaveBeenCalledWith('s1')
    expect(db.deleteSessionChunks).toHaveBeenCalledWith('s2')
    expect(indexSession).toHaveBeenCalledWith('s1')
    expect(indexSession).toHaveBeenCalledWith('s2')
    expect(invalidateSessionQaCache).toHaveBeenCalled()
  })

  it('keeps going when one document fails, and never throws', async () => {
    db.getStaleContextFiles.mockReturnValue([
      { fileId: 'bad', modeId: 'm1', fileName: 'bad.pdf' },
      { fileId: 'good', modeId: 'm1', fileName: 'good.pdf' },
    ])
    db.getContextChunksForFile.mockReturnValue([{ id: 'x', chunkIndex: 0, chunkText: 'a b', embeddingJson: '[]', fileName: 'x' }])
    embedPassages.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([[0.1]])

    await expect(migrateStaleEmbeddings()).resolves.toBeUndefined()

    expect(db.replaceContextChunks).toHaveBeenCalledTimes(1)
    expect(db.replaceContextChunks.mock.calls[0][0]).toBe('good')
  })

  it('shares one run between concurrent callers', async () => {
    db.getStaleSessionChunkIds.mockReturnValue(['s1'])
    let finish!: () => void
    indexSession.mockReturnValue(new Promise<void>((r) => { finish = r }))

    const a = migrateStaleEmbeddings()
    const b = migrateStaleEmbeddings()
    finish()
    await Promise.all([a, b])

    expect(db.getStaleSessionChunkIds).toHaveBeenCalledTimes(1)
  })
})
