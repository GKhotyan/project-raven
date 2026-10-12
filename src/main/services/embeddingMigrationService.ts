/**
 * Re-embeds stored chunks whose vectors came from a different embedding model
 * than EMBEDDING_MODEL_ID. Vectors from different models live in different
 * spaces, so until this runs retrieval simply skips stale chunks (see
 * getContextChunks / getAllSessionChunks).
 *
 * Mode documents: the original files aren't kept, so the text is rebuilt from
 * the stored chunks (dropping the overlap), re-chunked with the current
 * settings and re-embedded. Sessions: re-indexed from their transcripts.
 *
 * Only loads the embedding model when there is stale data, so users without
 * documents or an Ask index never pay the download.
 */

import { databaseService } from './database'
import { chunkText, embedPassages, invalidateEmbeddingCache } from './ragService'
import { indexSession } from './sessionIndexService'
import { invalidateSessionQaCache } from './sessionQaService'
import { EMBEDDING_MODEL_ID } from '../constants'
import { createLogger } from '../logger'

const log = createLogger('EmbeddingMigration')

/**
 * Join consecutive chunks back into the original word sequence. Each chunk
 * repeats the last N words of the previous one; N is detected per pair as the
 * longest tail/head match, so it works for any past chunk size or overlap.
 */
export function mergeOverlappingChunks(chunks: string[]): string {
  const words: string[] = []
  for (const chunk of chunks) {
    const next = chunk.split(/\s+/).filter(Boolean)
    let overlap = Math.min(words.length, next.length)
    while (overlap > 0) {
      let matches = true
      for (let i = 0; i < overlap; i++) {
        if (words[words.length - overlap + i] !== next[i]) {
          matches = false
          break
        }
      }
      if (matches) break
      overlap--
    }
    words.push(...next.slice(overlap))
  }
  return words.join(' ')
}

async function reembedContextFile(fileId: string, modeId: string, fileName: string): Promise<number> {
  const oldChunks = databaseService.getContextChunksForFile(fileId)
  const text = mergeOverlappingChunks(oldChunks.map((c) => c.chunkText))
  const chunks = chunkText(text)
  const embeddings = await embedPassages(chunks)

  databaseService.replaceContextChunks(
    fileId,
    chunks.map((chunk, i) => ({
      id: globalThis.crypto.randomUUID(),
      modeId,
      fileName,
      chunkIndex: i,
      chunkText: chunk,
      embeddingJson: JSON.stringify(embeddings[i]),
      embeddingModel: EMBEDDING_MODEL_ID,
    })),
  )
  invalidateEmbeddingCache(modeId)
  return chunks.length
}

let inFlight: Promise<void> | null = null

async function run(): Promise<void> {
  const staleFiles = databaseService.getStaleContextFiles(EMBEDDING_MODEL_ID)
  const staleSessions = databaseService.getStaleSessionChunkIds(EMBEDDING_MODEL_ID)
  if (staleFiles.length === 0 && staleSessions.length === 0) return

  log.info(
    `Re-embedding with ${EMBEDDING_MODEL_ID}: ${staleFiles.length} document(s), ${staleSessions.length} session(s)`,
  )
  const startedAt = Date.now()

  for (const file of staleFiles) {
    try {
      const count = await reembedContextFile(file.fileId, file.modeId, file.fileName)
      log.info(`Re-embedded "${file.fileName}" (${count} chunks)`)
    } catch (err) {
      log.error(`Failed to re-embed "${file.fileName}", will retry next launch:`, err)
    }
  }

  for (const sessionId of staleSessions) {
    try {
      // indexSession bails out early on short transcripts without touching
      // existing rows; clear first so stale vectors never linger.
      databaseService.deleteSessionChunks(sessionId)
      await indexSession(sessionId)
    } catch (err) {
      log.error(`Failed to re-index session ${sessionId}:`, err)
    }
  }
  invalidateSessionQaCache()

  log.info(`Re-embedding finished in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`)
}

/** Re-embed stale chunks. Concurrent callers share one run; never throws. */
export function migrateStaleEmbeddings(): Promise<void> {
  if (!inFlight) {
    inFlight = run()
      .catch((err) => log.error('Embedding migration failed (non-fatal):', err))
      .finally(() => {
        inFlight = null
      })
  }
  return inFlight
}
