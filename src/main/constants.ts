/**
 * Application-wide constants for the main process.
 * Centralises magic numbers so they're easy to find, document, and change.
 */

// ── Window Dimensions ────────────────────────────────────────────────

export const DASHBOARD_DEFAULT_WIDTH = 1040
export const DASHBOARD_DEFAULT_HEIGHT = 700
export const DASHBOARD_MIN_WIDTH = 1040
export const DASHBOARD_MIN_HEIGHT = 600

export const OVERLAY_DEFAULT_WIDTH = 480
export const OVERLAY_DEFAULT_HEIGHT = 216
export const OVERLAY_MIN_WIDTH = 480
export const OVERLAY_MIN_HEIGHT = 210
export const OVERLAY_SCREEN_EDGE_OFFSET = 20

export const OVERLAY_SHOW_DELAY_MS = 500
export const WINDOW_MOVE_STEP_PX = 50

// ── AI / LLM ─────────────────────────────────────────────────────────

export const TITLE_MAX_TOKENS = 30
export const TITLE_TRANSCRIPT_SLICE = 1500
export const TITLE_MAX_LENGTH = 60
export const TITLE_TRUNCATE_AT = 50
export const TITLE_TRUNCATED_LENGTH = 47

// Assist length is the model's official max output (see streamMaxTokensFor).
// STREAM_MAX_TOKENS is only a fallback if the catalog has no entry.
export const STREAM_MAX_TOKENS = 128_000

// Hung-socket safety only. Length is not time-capped by the product;
// max-effort coding can think for minutes before the first token.
export const AI_STREAM_TIMEOUT_MS = 1_800_000

export const SUMMARY_MAX_TOKENS = 2000
// Notes see the whole meeting. 300K chars (~100K tokens for Russian
// speech) keeps a multi-hour call inside the 200K context of Haiku 4.5
// (GLM-5.3 Flash and Luna have more); past that the end is cut.
export const SUMMARY_TRANSCRIPT_SLICE = 300_000
export const SUMMARY_MIN_TRANSCRIPT_LENGTH = 20

// Follow-up email draft: a short artifact, so a smaller output budget than
// the summary. The transcript goes in whole up to the same cap as the
// summary; past it the start is cut, so the closing of the call (where
// next steps are usually agreed) is always in context.
export const FOLLOWUP_MAX_TOKENS = 1200
export const FOLLOWUP_TRANSCRIPT_SLICE = 300_000

export const RAG_QUERY_TRANSCRIPT_SLICE = 500
export const RAG_DEFAULT_TOP_K = 10
export const RAG_MAX_CONTEXT_TOKENS = 3000
// Words per chunk. The embedding model reads at most 512 tokens and Russian
// runs ~2 tokens/word, so larger chunks get silently truncated.
export const RAG_CHUNK_SIZE = 200
export const RAG_CHUNK_OVERLAP = 30

/**
 * On-device embedding model for mode documents and the session index.
 * Stored with each vector; changing it makes embeddingMigrationService
 * re-embed existing chunks.
 */
export const EMBEDDING_MODEL_ID = 'Xenova/multilingual-e5-small'
/** Delay before re-embedding stale chunks on boot, so it doesn't compete with startup. */
export const EMBEDDING_MIGRATION_BOOT_DELAY_MS = 15000

// Ask-my-meetings: local Q&A across the transcript index. Higher top-K and
// token budget than per-mode RAG because it searches across many sessions.
export const SESSION_QA_TOP_K = 8
export const SESSION_QA_MAX_CONTEXT_TOKENS = 4000
export const SESSION_QA_MAX_TOKENS = 1024
/** Single-session Q&A feeds the transcript directly (no retrieval); slice cap. */
export const SESSION_SCOPED_QA_TRANSCRIPT_SLICE = 24000
/**
 * Recent-turn budget (characters) kept VERBATIM in each Ask call. Turns older
 * than this aren't dropped — they're folded into a running summary (see below)
 * so earlier context is never lost, only compressed. ~12k chars ≈ 4k tokens.
 */
export const SESSION_QA_HISTORY_MAX_CHARS = 12000
/** Output budget for the rolling summary of older conversation turns. */
export const SESSION_QA_SUMMARY_MAX_TOKENS = 512
/**
 * Cap on how much older-turn text is fed into a single summarization pass.
 * Large enough (~13k tokens) that only extreme conversations approach it; the
 * summary itself is carried forward so memory compounds rather than resets.
 */
export const SESSION_QA_SUMMARY_INPUT_SLICE = 40000
/** Sessions scanned/indexed lazily when the Ask view first opens. */
export const SESSION_INDEX_BACKFILL_SCAN = 40
export const SESSION_INDEX_BACKFILL_LIMIT = 10

// RAM / overlay bound for stored Assist turns. The model only sees the
// last RECENT_HISTORY_MESSAGES plus session_memory / pinned opening.
// Dropping oldest UI rows must not drop the original problem — that
// lives in SessionMemory, not in this ring.
export const CONVERSATION_HISTORY_LIMIT = 100

// How many recent lines of the live transcript to include in each AI
// request. Increased from 50 to 300 to cover sessions where multiple
// problems are read aloud in sequence (each problem statement alone
// can be 30-80 transcript lines once Deepgram has finished segmenting
// it). The `[...earlier conversation omitted - N lines]` marker still
// appears beyond the cap.
export const TRANSCRIPT_LINE_LIMIT = 300

// Assist sends only this many of the newest pasted screenshots as images;
// older ones go as their background text description once it exists.
export const ASSIST_IMAGE_SCREENSHOTS = 2

// ── Audio / Transcription ────────────────────────────────────────────

export const AUDIO_SAMPLE_RATE = 16000
export const AUDIO_CHANNELS = 1

export const DEEPGRAM_KEEPALIVE_MS = 8000
export const DEEPGRAM_ENDPOINTING_MS = 300
export const DEEPGRAM_UTTERANCE_END_MS = 1500

export const TRANSCRIPT_MERGE_WINDOW_MS = 5000
export const TRANSCRIPT_FLUSH_TIMEOUT_MS = 3000

// ── Session / Auto-save ──────────────────────────────────────────────

export const SESSION_AUTOSAVE_INTERVAL_MS = 60_000

// ── Auth ─────────────────────────────────────────────────────────────

export const TOKEN_REFRESH_INTERVAL_MS = 13 * 60 * 1000
