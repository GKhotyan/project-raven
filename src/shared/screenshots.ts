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

const ZAI_VISION_MODELS = new Set(['glm-5v-turbo', 'glm-5.3-flash', 'glm-5.3-flashx'])

/** Text-only GLM models answer 400 on image parts; every other catalog model reads images. */
export function modelAcceptsImages(provider: 'anthropic' | 'openai' | 'zai', model: string): boolean {
  return provider === 'zai' ? ZAI_VISION_MODELS.has(model) : true
}
