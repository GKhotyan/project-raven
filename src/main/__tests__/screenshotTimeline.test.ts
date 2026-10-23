import { describe, expect, it } from 'vitest'
import {
  buildTimeline,
  formatElapsed,
  markTranscriptWithScreenshots,
  modelAcceptsImages,
  pickScreenshotDescriber,
  placeScreenshots,
  screenshotLabel,
  splitAssistScreenshots,
  type SessionScreenshot,
  type TimelineEntry,
} from '../../shared/screenshots'

const START = 1_000_000
const entry = (source: 'mic' | 'system', text: string, at: number, isFinal = true): TimelineEntry => ({
  source, text, timestamp: START + at, isFinal,
})
const shot = (id: string, at: number): SessionScreenshot => ({
  id, timestamp: START + at, file: `${id}.png`, mediaType: 'image/png',
})

describe('formatElapsed / screenshotLabel', () => {
  it('formats mm:ss from the session start, minutes uncapped', () => {
    expect(formatElapsed(0)).toBe('00:00')
    expect(formatElapsed(65_000)).toBe('01:05')
    expect(formatElapsed(75 * 60_000 + 3_000)).toBe('75:03')
    expect(formatElapsed(-500)).toBe('00:00')
  })

  it('labels a screenshot with its number and elapsed time', () => {
    expect(screenshotLabel(2, START + 754_000, START)).toBe('Screenshot 2 · 12:34')
  })
})

describe('buildTimeline', () => {
  it('matches the plain transcript format when there are no screenshots', () => {
    const out = buildTimeline({
      entries: [entry('mic', 'Hi', 1_000), entry('system', 'Hello', 2_000), entry('system', 'draft', 3_000, false)],
      screenshots: [],
      startedAt: START,
      displayName: 'Alice',
    })
    expect(out.text).toBe('Alice: Hi\nThem: Hello')
    expect(out.ordered).toEqual([])
  })

  it('inserts numbered markers after the last line spoken before each screenshot', () => {
    const a = shot('a', 1_500)
    const b = shot('b', 2_500)
    const out = buildTimeline({
      entries: [entry('mic', 'Hi', 1_000), entry('system', 'Look at this', 2_000), entry('mic', 'Nice', 3_000)],
      screenshots: [b, a],
      startedAt: START,
      displayName: 'Alice',
    })
    expect(out.text).toBe(
      'Alice: Hi\n[Screenshot 1 · 00:01]\nThem: Look at this\n[Screenshot 2 · 00:02]\nAlice: Nice',
    )
    expect(out.ordered.map((s) => s.id)).toEqual(['a', 'b'])
  })

  it('puts screenshots before the first line at the top and after the last line at the bottom', () => {
    const out = buildTimeline({
      entries: [entry('mic', 'Hi', 5_000)],
      screenshots: [shot('late', 9_000), shot('early', 1_000)],
      startedAt: START,
      displayName: 'Alice',
    })
    expect(out.text).toBe('[Screenshot 1 · 00:01]\nAlice: Hi\n[Screenshot 2 · 00:09]')
  })

  it('keeps screenshots when the transcript is empty', () => {
    const out = buildTimeline({ entries: [], screenshots: [shot('a', 0)], startedAt: START, displayName: 'Alice' })
    expect(out.text).toBe('[Screenshot 1 · 00:00]')
    expect(out.ordered).toHaveLength(1)
  })
})

describe('placeScreenshots', () => {
  it('groups screenshots after the index of the last earlier entry', () => {
    const placed = placeScreenshots([START + 1_000, START + 3_000], [shot('x', 500), shot('y', 2_000), shot('z', 4_000)])
    expect(placed.leading.map((s) => s.id)).toEqual(['x'])
    expect(placed.after.get(0)?.map((s) => s.id)).toEqual(['y'])
    expect(placed.after.get(1)?.map((s) => s.id)).toEqual(['z'])
  })
})

describe('modelAcceptsImages', () => {
  it('knows which catalog models take images', () => {
    expect(modelAcceptsImages('anthropic', 'claude-haiku-4-5')).toBe(true)
    expect(modelAcceptsImages('openai', 'gpt-5.6-luna')).toBe(true)
    expect(modelAcceptsImages('zai', 'glm-5.3-flash')).toBe(true)
    expect(modelAcceptsImages('zai', 'glm-5.3-flashx')).toBe(true)
    expect(modelAcceptsImages('zai', 'glm-5v-turbo')).toBe(true)
    for (const m of ['glm-5.3', 'glm-5.2', 'glm-5.1', 'glm-4.7', 'glm-4.7-flash']) {
      expect(modelAcceptsImages('zai', m)).toBe(false)
    }
  })
})

describe('markTranscriptWithScreenshots', () => {
  const entries = [entry('mic', 'Look at this', 1_000), entry('system', 'Yes, the chart', 5_000)]
  const plain = 'Alice: Look at this\nThem: Yes, the chart'

  it('puts a marker after the line spoken before the paste and keeps interim lines', () => {
    const out = markTranscriptWithScreenshots({
      transcript: `${plain}\nThem (still speaking): and`,
      entries,
      screenshots: [shot('a', 2_000)],
      startedAt: START,
      displayName: 'Alice',
    })
    expect(out).toBe(
      'Alice: Look at this\n[Screenshot 1 · 00:02]\nThem: Yes, the chart\nThem (still speaking): and',
    )
  })

  it('returns the transcript untouched without screenshots', () => {
    const out = markTranscriptWithScreenshots({
      transcript: plain, entries, screenshots: [], startedAt: START, displayName: 'Alice',
    })
    expect(out).toBe(plain)
  })

  it('leaves the transcript alone when the entries do not match its text', () => {
    const out = markTranscriptWithScreenshots({
      transcript: 'Alice: something else',
      entries,
      screenshots: [shot('a', 2_000)],
      startedAt: START,
      displayName: 'Alice',
    })
    expect(out).toBe('Alice: something else')
  })
})

describe('splitAssistScreenshots', () => {
  const described = (id: string, at: number, description: string): SessionScreenshot => ({
    ...shot(id, at), description,
  })

  it('sends the newest screenshots as images and older described ones as text', () => {
    const list = [described('a', 1_000, 'old chart'), described('b', 2_000, 'b'), shot('c', 3_000)]
    const out = splitAssistScreenshots(list, 2)
    expect(out.map((p) => [p.number, p.shot.id, p.asImage])).toEqual([
      [1, 'a', false],
      [2, 'b', true],
      [3, 'c', true],
    ])
  })

  it('keeps an older screenshot as an image until its description is ready', () => {
    const list = [shot('a', 1_000), described('b', 2_000, '  '), shot('c', 3_000), shot('d', 4_000)]
    const out = splitAssistScreenshots(list, 2)
    expect(out.map((p) => p.asImage)).toEqual([true, true, true, true])
  })

  it('numbers screenshots in paste order', () => {
    const out = splitAssistScreenshots([shot('b', 5_000), described('a', 1_000, 'x')], 1)
    expect(out.map((p) => [p.number, p.shot.id, p.asImage])).toEqual([
      [1, 'a', false],
      [2, 'b', true],
    ])
  })
})

describe('pickScreenshotDescriber', () => {
  it('uses the session-memory model when it reads images', () => {
    expect(pickScreenshotDescriber({ provider: 'anthropic', memoryModel: 'claude-sonnet-5', assistModel: 'claude-haiku-4-5' }))
      .toBe('memory')
  })

  it('falls back to the Live assist model when the memory model is text-only', () => {
    expect(pickScreenshotDescriber({ provider: 'zai', memoryModel: 'glm-5.1', assistModel: 'glm-5.3-flash' }))
      .toBe('assist')
  })

  it('gives up when neither model reads images', () => {
    expect(pickScreenshotDescriber({ provider: 'zai', memoryModel: 'glm-5.1', assistModel: 'glm-5.1' }))
      .toBeNull()
  })
})
