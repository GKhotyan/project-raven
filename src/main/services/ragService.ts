import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { extname, join } from 'path';
import { createRequire } from 'module';
import { databaseService } from './database';
import { createLogger } from '../logger';
import {
  RAG_CHUNK_SIZE,
  RAG_CHUNK_OVERLAP,
  RAG_DEFAULT_TOP_K,
  RAG_MAX_CONTEXT_TOKENS,
  EMBEDDING_MODEL_ID,
} from '../constants';

const log = createLogger('RAG');

// @xenova/transformers' `pipeline` signature carries a very complex generic
// that our narrow feature-extraction usage doesn't benefit from. Keep our
// own minimal view of a pipeline factory + the returned model, and satisfy
// the SDK with `any` at the import boundary.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TransformersPipelineFn = any;

interface FeatureExtractionOutput {
  data: Float32Array;
  tolist(): number[][];
}

interface EmbeddingModel {
  (input: string | string[], options?: Record<string, unknown>): Promise<FeatureExtractionOutput>;
}

// File transformers.js loads for the default (quantized) feature-extraction model.
const MODEL_WEIGHTS_FILE = join('onnx', 'model_quantized.onnx');

let embeddingModelPromise: Promise<EmbeddingModel> | null = null;

/**
 * Persistent model cache. transformers.js defaults to `<its dist>/.cache`,
 * which is inside app.asar (read-only) in packaged builds and gets wiped with
 * `dist/` in dev — either way the model would be re-downloaded. userData
 * survives restarts and updates.
 */
async function resolveModelCacheDir(): Promise<string | null> {
  try {
    const { app } = await import('electron');
    return app ? join(app.getPath('userData'), 'models') : null;
  } catch {
    return null;
  }
}

async function loadEmbeddingModel(): Promise<EmbeddingModel> {
  const transformers = await import('@xenova/transformers');

  const cacheDir = await resolveModelCacheDir();
  if (cacheDir && transformers.env) transformers.env.cacheDir = cacheDir;
  const effectiveCacheDir: string | undefined = transformers.env?.cacheDir ?? undefined;

  const weightsPath = effectiveCacheDir
    ? join(effectiveCacheDir, EMBEDDING_MODEL_ID, MODEL_WEIGHTS_FILE)
    : null;
  const cached = weightsPath ? existsSync(weightsPath) : false;
  if (cached) {
    log.info(`Embedding model ${EMBEDDING_MODEL_ID}: loading from cache ${effectiveCacheDir}`);
  } else {
    log.info(
      `Embedding model ${EMBEDDING_MODEL_ID}: not in cache ${effectiveCacheDir ?? '(none)'}, ` +
        'downloading from Hugging Face (~118MB)...'
    );
  }

  const startedAt = Date.now();
  const lastLoggedPct = new Map<string, number>();
  const pipelineFn = transformers.pipeline as TransformersPipelineFn;
  const model = (await pipelineFn('feature-extraction', EMBEDDING_MODEL_ID, {
    // Fires for cache hits too, so only log real downloads, every 25%.
    progress_callback: cached
      ? undefined
      : (event: { status: string; file?: string; progress?: number }) => {
          if (event.status !== 'progress' || !event.file || event.progress === undefined) return;
          const pct = Math.floor(event.progress / 25) * 25;
          if (pct <= (lastLoggedPct.get(event.file) ?? -1)) return;
          lastLoggedPct.set(event.file, pct);
          log.info(`Downloading ${event.file}: ${pct}%`);
        },
  })) as EmbeddingModel;

  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  if (cached) {
    log.info(`Embedding model loaded from cache in ${seconds}s`);
  } else {
    const stored = weightsPath ? existsSync(weightsPath) : false;
    log.info(
      `Embedding model downloaded and loaded in ${seconds}s; ` +
        (stored ? `cached at ${effectiveCacheDir}` : 'WARNING: not written to cache, will re-download next launch')
    );
  }
  return model;
}

function getEmbeddingPipeline(): Promise<EmbeddingModel> {
  if (!embeddingModelPromise) {
    embeddingModelPromise = loadEmbeddingModel().catch((err) => {
      // Don't pin a failed load (e.g. offline) — retry on the next call.
      embeddingModelPromise = null;
      throw err;
    });
  }
  return embeddingModelPromise;
}

// ==================== FILE PARSING ====================

async function parseFile(filePath: string): Promise<string> {
  const ext = extname(filePath).toLowerCase();

  switch (ext) {
    case '.txt':
    case '.md': {
      return await readFile(filePath, 'utf-8');
    }
    case '.pdf': {
      const nodeRequire = createRequire(import.meta.url);
      const pdfParsePath = nodeRequire.resolve('pdf-parse');
      const { join } = await import('path');
      const { tmpdir } = await import('os');
      const { writeFileSync, existsSync } = await import('fs');
      const helperPath = join(tmpdir(), 'raven-pdf-helper.cjs');
      if (!existsSync(helperPath)) {
        writeFileSync(helperPath, `
          const { PDFParse, VerbosityLevel } = require(${JSON.stringify(pdfParsePath)});
          module.exports = async function(buffer) {
            const parser = new PDFParse({ verbosity: VerbosityLevel.ERRORS, data: new Uint8Array(buffer) });
            await parser.load();
            const result = await parser.getText();
            return typeof result === 'string' ? result : result.text;
          };
        `);
      }
      const parsePdf = nodeRequire(helperPath);
      const buffer = await readFile(filePath);
      return await parsePdf(buffer);
    }
    case '.docx': {
      const mammoth = await import('mammoth');
      const buffer = await readFile(filePath);
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }
    default:
      throw new Error(`Unsupported file type: ${ext}`);
  }
}

// ==================== CHUNKING ====================

export function chunkText(text: string, chunkSize = RAG_CHUNK_SIZE, overlap = RAG_CHUNK_OVERLAP): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  if (words.length <= chunkSize) return [words.join(' ')];

  const chunks: string[] = [];
  let start = 0;

  while (start < words.length) {
    const end = Math.min(start + chunkSize, words.length);
    chunks.push(words.slice(start, end).join(' '));
    if (end >= words.length) break;
    start += chunkSize - overlap;
  }

  return chunks;
}

// ==================== EMBEDDING ====================

// multilingual-e5 is trained with these role prefixes; omitting them
// noticeably hurts retrieval quality.
const QUERY_PREFIX = 'query: ';
const PASSAGE_PREFIX = 'passage: ';

async function embed(text: string): Promise<number[]> {
  const model = await getEmbeddingPipeline();
  const output = await model(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

/** Embed a search query (user question, live transcript slice). */
export function embedQuery(text: string): Promise<number[]> {
  return embed(QUERY_PREFIX + text);
}

/** Embed a stored chunk (document or transcript text). */
export function embedPassage(text: string): Promise<number[]> {
  return embed(PASSAGE_PREFIX + text);
}

export async function embedPassages(
  chunks: string[],
  onProgress?: (current: number, total: number) => void
): Promise<number[][]> {
  const embeddings: number[][] = [];
  for (let i = 0; i < chunks.length; i++) {
    embeddings.push(await embedPassage(chunks[i]));
    onProgress?.(i + 1, chunks.length);
  }
  return embeddings;
}

// ==================== COSINE SIMILARITY ====================

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ==================== PUBLIC API ====================

export interface ContextFile {
  id: string;
  modeId: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  chunkCount: number;
  createdAt: number;
}

export async function uploadContextFile(
  modeId: string,
  filePath: string,
  fileName: string,
  fileSize: number,
  onProgress?: (stage: string, current: number, total: number) => void
): Promise<ContextFile> {
  onProgress?.('parsing', 0, 1);
  const text = await parseFile(filePath);

  if (!text.trim()) {
    throw new Error('File contains no extractable text');
  }

  onProgress?.('chunking', 0, 1);
  const chunks = chunkText(text);

  if (chunks.length === 0) {
    throw new Error('File produced no chunks');
  }

  onProgress?.('embedding', 0, chunks.length);
  const embeddings = await embedPassages(chunks, (current, total) => {
    onProgress?.('embedding', current, total);
  });

  const fileId = globalThis.crypto.randomUUID();
  const ext = extname(filePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };

  onProgress?.('storing', 0, chunks.length);

  databaseService.insertContextFile({
    id: fileId,
    modeId,
    fileName,
    fileSize,
    fileType: mimeMap[ext] || 'text/plain',
    chunkCount: chunks.length,
  });

  for (let i = 0; i < chunks.length; i++) {
    databaseService.insertContextChunk({
      id: globalThis.crypto.randomUUID(),
      modeId,
      fileId,
      fileName,
      chunkIndex: i,
      chunkText: chunks[i],
      embeddingJson: JSON.stringify(embeddings[i]),
      embeddingModel: EMBEDDING_MODEL_ID,
    });
    onProgress?.('storing', i + 1, chunks.length);
  }

  invalidateEmbeddingCache(modeId);
  log.info(`Stored ${chunks.length} chunks for file "${fileName}" in mode ${modeId}`);

  return {
    id: fileId,
    modeId,
    fileName,
    fileSize,
    fileType: mimeMap[ext] || 'text/plain',
    chunkCount: chunks.length,
    createdAt: Date.now(),
  };
}

export function getContextFiles(modeId: string): ContextFile[] {
  return databaseService.getContextFiles(modeId);
}

export function deleteContextFile(fileId: string): boolean {
  return databaseService.deleteContextFile(fileId);
}

const parsedEmbeddingCache = new Map<string, Array<{ chunkText: string; fileName: string; embedding: number[] }>>();

export function invalidateEmbeddingCache(modeId: string): void {
  parsedEmbeddingCache.delete(modeId);
}

function getParsedChunks(modeId: string): Array<{ chunkText: string; fileName: string; embedding: number[] }> {
  const cached = parsedEmbeddingCache.get(modeId);
  if (cached) return cached;

  // Vectors from another model live in a different space; skip them until
  // embeddingMigrationService re-embeds them.
  const allChunks = databaseService.getContextChunks(modeId, EMBEDDING_MODEL_ID);
  const parsed = allChunks.map((chunk) => ({
    chunkText: chunk.chunkText,
    fileName: chunk.fileName,
    embedding: JSON.parse(chunk.embeddingJson) as number[],
  }));
  parsedEmbeddingCache.set(modeId, parsed);
  return parsed;
}

export async function retrieveRelevantChunks(
  modeId: string,
  query: string,
  topK = RAG_DEFAULT_TOP_K
): Promise<Array<{ chunkText: string; fileName: string; score: number }>> {
  const parsedChunks = getParsedChunks(modeId);
  if (parsedChunks.length === 0) return [];

  const queryEmbedding = await embedQuery(query);

  const scored = parsedChunks.map((chunk) => {
    const score = cosineSimilarity(queryEmbedding, chunk.embedding);
    return {
      chunkText: chunk.chunkText,
      fileName: chunk.fileName,
      score,
    };
  });

  scored.sort((a, b) => b.score - a.score);

  const maxTokens = RAG_MAX_CONTEXT_TOKENS;
  const results: typeof scored = [];
  let tokenCount = 0;

  for (const item of scored.slice(0, topK)) {
    const approxTokens = item.chunkText.split(/\s+/).length;
    if (tokenCount + approxTokens > maxTokens) break;
    results.push(item);
    tokenCount += approxTokens;
  }

  return results;
}
