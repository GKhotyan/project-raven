import { describe, expect, it } from 'vitest'
import {
  buildTimeline,
  formatElapsed,
  modelAcceptsImages,
  placeScreenshots,
  screenshotLabel,
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
