/**
 * Publishing a session summary to Mattermost via an n8n webhook: the
 * channels the user can pick, the meeting key n8n groups posts by, and which
 * parts of the summary are sent.
 */

export const SUMMARY_CHANNELS = ['cvm-daily', 'hrm-daily', 'pim-daily'] as const
export type SummaryChannel = (typeof SUMMARY_CHANNELS)[number]

export function isSummaryChannel(value: unknown): value is SummaryChannel {
  return typeof value === 'string' && (SUMMARY_CHANNELS as readonly string[]).includes(value)
}

/** "<channel>:YYYY-MM-DD", using the local date the session started. */
export function buildMeetingKey(channel: SummaryChannel, startedAt: number): string {
  const date = new Date(startedAt)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${channel}:${date.getFullYear()}-${month}-${day}`
}

const HEADING = /^#{1,6}\s+(.*)$/
const PUBLISHABLE_HEADING = /^(summary|key\s+points?)$/i

/**
 * Only the summary prose (text before the first heading, or a "Summary"
 * section) and "Key points" are published; Action items and any other
 * sections stay in the app. Untitled leading prose gets a "## Summary"
 * heading so the post reads the same as the sections after it.
 */
export function extractPublishableSummary(summary: string | null | undefined): string {
  const preamble: string[] = []
  const kept: string[] = []
  let seenHeading = false
  let keep = true
  for (const line of (summary ?? '').split('\n')) {
    const heading = line.match(HEADING)
    if (heading) {
      seenHeading = true
      const title = heading[1].replace(/\*\*/g, '').replace(/:\s*$/, '').trim()
      keep = PUBLISHABLE_HEADING.test(title)
    }
    if (!seenHeading) preamble.push(line)
    else if (keep) kept.push(line)
  }
  const prose = preamble.join('\n').trim()
  const sections = kept.join('\n').trim()
  return [prose && `## Summary\n\n${prose}`, sections].filter(Boolean).join('\n\n')
}
