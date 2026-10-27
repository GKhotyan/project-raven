/**
 * Screenshots the user pastes into a session. Files live under
 * <userData>/data/screenshots/<sessionId>/; this module is the shared,
 * pure part: types, limits, and how screenshots sit in the transcript.
 */

export type ScreenshotMediaType = 'image/png' | 'image/jpeg'

export interface SessionScreenshot {
  id: string
  /** ms epoch when the user pasted it */
  timestamp: number
  /** file name inside the session's screenshot folder */
  file: string
  mediaType: ScreenshotMediaType
  /** Text description written in the background after the paste, for Assist. */
  description?: string
}

export const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024
export const MAX_SCREENSHOTS_PER_SESSION = 20

export interface TimelineEntry {
  source: 'mic' | 'system'
  text: string
  timestamp: number
  isFinal: boolean
}

export function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function screenshotLabel(n: number, timestamp: number, startedAt: number): string {
  return `Screenshot ${n} · ${formatElapsed(timestamp - startedAt)}`
}

/**
 * Slot each screenshot after the last entry spoken before it was pasted.
 * Screenshots older than every entry go to `leading`.
 */
export function placeScreenshots(
  entryTimestamps: number[],
  screenshots: SessionScreenshot[],
): { leading: SessionScreenshot[]; after: Map<number, SessionScreenshot[]> } {
  const sorted = [...screenshots].sort((a, b) => a.timestamp - b.timestamp)
  const leading: SessionScreenshot[] = []
  const after = new Map<number, SessionScreenshot[]>()
  for (const s of sorted) {
    let index = -1
    for (let i = 0; i < entryTimestamps.length; i++) {
      if (entryTimestamps[i] <= s.timestamp) index = i
    }
    if (index === -1) {
      leading.push(s)
    } else {
      after.set(index, [...(after.get(index) ?? []), s])
    }
  }
  return { leading, after }
}

/**
 * Transcript text for the notes model with `[Screenshot N · mm:ss]` markers
 * in place, and the screenshots in marker order. Without screenshots the
 * text is exactly the old `Name: text` lines of final entries.
 */
export function buildTimeline(params: {
  entries: TimelineEntry[]
  screenshots: SessionScreenshot[]
  startedAt: number
  displayName: string
}): { text: string; ordered: SessionScreenshot[] } {
  const finals = params.entries.filter((e) => e.isFinal)
  const { leading, after } = placeScreenshots(finals.map((e) => e.timestamp), params.screenshots)
  const lines: string[] = []
  const ordered: SessionScreenshot[] = []
  const mark = (s: SessionScreenshot) => {
    ordered.push(s)
    lines.push(`[${screenshotLabel(ordered.length, s.timestamp, params.startedAt)}]`)
  }
  leading.forEach(mark)
  finals.forEach((e, i) => {
    lines.push(`${e.source === 'mic' ? params.displayName : 'Them'}: ${e.text}`)
    after.get(i)?.forEach(mark)
  })
  return { text: lines.join('\n'), ordered }
}

/**
 * The live Assist transcript with the same `[Screenshot N · mm:ss]` markers
 * the notes get. `transcript` is the final lines followed by any
 * "(still speaking)" lines; if its final part doesn't match `entries`
 * exactly, the transcript is returned unchanged rather than mis-marked.
 */
export function markTranscriptWithScreenshots(params: {
  transcript: string
  entries: TimelineEntry[]
  screenshots: SessionScreenshot[]
  startedAt: number
  displayName: string
}): string {
  if (params.screenshots.length === 0) return params.transcript
  const plain = buildTimeline({ ...params, screenshots: [] }).text
  if (!plain || !params.transcript.startsWith(plain)) return params.transcript
  const marked = buildTimeline(params).text
  return marked + params.transcript.slice(plain.length)
}

export interface AssistScreenshotPlan {
  /** 1-based, in paste order; matches the transcript markers. */
  number: number
  shot: SessionScreenshot
  /** false: send `shot.description` as text instead of the image. */
  asImage: boolean
}

/**
 * Hybrid for Assist: the newest `keepImages` screenshots go as images (they
 * are what the user is most likely asking about); older ones go as their
 * text description once it exists, which keeps each request light.
 */
export function splitAssistScreenshots(
  screenshots: SessionScreenshot[],
  keepImages: number,
): AssistScreenshotPlan[] {
  const sorted = [...screenshots].sort((a, b) => a.timestamp - b.timestamp)
  const firstImage = sorted.length - keepImages
  return sorted.map((shot, i) => ({
    number: i + 1,
    shot,
    asImage: i >= firstImage || !shot.description?.trim(),
  }))
}

const ZAI_VISION_MODELS = new Set(['glm-5v-turbo', 'glm-5.3-flash', 'glm-5.3-flashx'])

/** Text-only GLM models answer 400 on image parts; every other catalog model reads images. */
export function modelAcceptsImages(provider: 'anthropic' | 'openai' | 'zai' | 'local-gpt', model: string): boolean {
  if (provider === 'local-gpt') return false
  return provider === 'zai' ? ZAI_VISION_MODELS.has(model) : true
}

/**
 * Which model writes the background screenshot descriptions: the cheap
 * session-memory model when it reads images, else the Live assist model.
 * null means neither can, and Assist keeps sending every screenshot as an image.
 */
export function pickScreenshotDescriber(params: {
  provider: 'anthropic' | 'openai' | 'zai' | 'local-gpt'
  memoryModel: string
  assistModel: string
}): 'memory' | 'assist' | null {
  if (modelAcceptsImages(params.provider, params.memoryModel)) return 'memory'
  if (modelAcceptsImages(params.provider, params.assistModel)) return 'assist'
  return null
}

/** Note under an Assist request: how many screenshots went, and how. */
export function sentScreenshotsLabel(total: number, asText: number): string {
  const base = `Sent with ${total} screenshot${total === 1 ? '' : 's'}`
  if (asText <= 0) return base
  const images = total - asText
  return `${base} · ${images} as image${images === 1 ? '' : 's'}, ${asText} as text`
}
