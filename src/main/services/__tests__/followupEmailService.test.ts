import { describe, it, expect, vi, beforeEach } from 'vitest'

const generateShort = vi.fn()

vi.mock('../ai/providerFactory', () => ({
  getNotesProvider: vi.fn(),
}))

vi.mock('../../logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { buildFollowupEmailPrompt, draftFollowupEmail } from '../followupEmailService'
import { getNotesProvider } from '../ai/providerFactory'

describe('buildFollowupEmailPrompt', () => {
  it('includes the summary, action items with owners/deadlines, and transcript tail', () => {
    const prompt = buildFollowupEmailPrompt({
      title: 'Acme discovery call',
      summary: '## Key points\n- Discussed pricing tiers',
      actionItemsJson: JSON.stringify([
        { task: 'Send proposal', assignee: 'Sam', deadline: 'Friday' },
      ]),
      transcript: 'You: Hi there\nThem: Hello, thanks for joining',
      senderName: 'Sam',
    })

    expect(prompt).toContain('Discussed pricing tiers')
    expect(prompt).toContain('Send proposal')
    expect(prompt).toContain('owner: Sam')
    expect(prompt).toContain('due: Friday')
    expect(prompt).toContain('Them: Hello, thanks for joining')
  })

  it('keeps an hour-long transcript whole, from the opening line to the close', () => {
    // ~1 hour of talk is 60-80K characters.
    const transcript =
      'You: OPENING_CONTEXT budget is 50K\n' + 'Them: ' + 'word '.repeat(16_000) + '\nYou: CLOSING_STEP send the deck'
    const prompt = buildFollowupEmailPrompt({
      title: 't',
      summary: 's',
      actionItemsJson: null,
      transcript,
      senderName: 'Sam',
    })

    expect(prompt).toContain('OPENING_CONTEXT budget is 50K')
    expect(prompt).toContain('CLOSING_STEP send the deck')
  })

  it('drops the start of a transcript past 300K characters and keeps the close', () => {
    const prompt = buildFollowupEmailPrompt({
      title: 't',
      summary: 's',
      actionItemsJson: null,
      transcript: 'BEFORE_THE_CAP' + 'x'.repeat(300_000) + 'CLOSING_STEP',
      senderName: 'Sam',
    })

    expect(prompt).not.toContain('BEFORE_THE_CAP')
    expect(prompt).toContain('CLOSING_STEP')
  })

  it('marks action items as none captured when there are none', () => {
    const prompt = buildFollowupEmailPrompt({
      title: 't',
      summary: 's',
      actionItemsJson: null,
      transcript: 'You: hi',
    })
    expect(prompt).toContain('(none captured)')
  })
})

describe('draftFollowupEmail', () => {
  beforeEach(() => {
    generateShort.mockReset()
    vi.mocked(getNotesProvider).mockResolvedValue({
      name: 'anthropic',
      generateShort,
      streamResponse: vi.fn(),
    } as unknown as Awaited<ReturnType<typeof getNotesProvider>>)
  })

  it('returns the drafted email on success', async () => {
    generateShort.mockResolvedValueOnce('Subject: Thanks\n\nHi, great chatting today...')

    const result = await draftFollowupEmail({
      title: 't',
      summary: 'Discussed pricing',
      actionItemsJson: null,
      transcript: 'You: hi\nThem: hello',
    })

    expect(result).toEqual({ email: 'Subject: Thanks\n\nHi, great chatting today...' })
  })

  it('returns an error (does not throw) when no provider/key is configured', async () => {
    vi.mocked(getNotesProvider).mockRejectedValueOnce(
      new Error('No API key configured for anthropic'),
    )

    const result = await draftFollowupEmail({
      title: 't',
      summary: 's',
      actionItemsJson: null,
      transcript: 'You: hi',
    })

    expect(result).toEqual({ error: 'No API key configured for anthropic' })
    expect(generateShort).not.toHaveBeenCalled()
  })

  it('returns an error when the model yields an empty draft', async () => {
    generateShort.mockResolvedValueOnce('   ')

    const result = await draftFollowupEmail({
      title: 't',
      summary: 's',
      actionItemsJson: null,
      transcript: 'You: hi',
    })

    expect('error' in result).toBe(true)
  })

  it('returns an error without calling the model when there is no content', async () => {
    const result = await draftFollowupEmail({
      title: 't',
      summary: null,
      actionItemsJson: null,
      transcript: '',
    })

    expect('error' in result).toBe(true)
    expect(getNotesProvider).not.toHaveBeenCalled()
  })

  it('surfaces provider generation errors as an error result rather than throwing', async () => {
    generateShort.mockRejectedValueOnce(new Error('rate limited'))

    const result = await draftFollowupEmail({
      title: 't',
      summary: 's',
      actionItemsJson: null,
      transcript: 'You: hi',
    })

    expect(result).toEqual({ error: 'rate limited' })
  })
})
