import { TITLE_TRANSCRIPT_SLICE } from '../constants'

export interface NotesTemplateSection {
  title: string
  instructions: string
}

/**
 * Normalize a mode's stored notesTemplate into the {title, instructions}
 * pairs the summary prompt sends to the model. Sections without a title are
 * dropped; a missing/blank instruction is preserved as an empty string so the
 * section still appears as a heading hint.
 */
export function notesTemplateSections(
  notesTemplate: Array<{ title: string; instructions?: string }> | null | undefined,
): NotesTemplateSection[] {
  if (!notesTemplate?.length) return []
  return notesTemplate
    .filter((section) => section.title)
    .map((section) => ({
      title: section.title,
      instructions: section.instructions?.trim() ?? '',
    }))
}

/**
 * True when the mode's notes template already has an action-items section,
 * so the summary itself carries them and the separate structured extraction
 * would only duplicate it.
 */
export function hasActionItemsSection(
  notesTemplate: Array<{ title: string; instructions?: string }> | null | undefined,
): boolean {
  return notesTemplateSections(notesTemplate).some((section) =>
    /\baction[\s-]*items?\b/i.test(section.title),
  )
}

/**
 * True when a generated summary already has an action-items heading. The
 * summary prompt asks for one whenever someone commits to a task, even in
 * modes whose template doesn't list it, so check the actual output too.
 */
export function summaryHasActionItemsSection(summary: string | null | undefined): boolean {
  return /^#{1,6}\s*action[\s-]*items?\b/im.test(summary ?? '')
}

export function buildSessionTitlePrompt(transcript: string): string {
  return `<task>Write a 3-7 word title for this session transcript. Output ONLY the title text.</task>

<rules>
- Ground the title in what people actually said. Do not invent a meeting type, product, or industry that is never named.
- Casual chat, a demo, or a YouTube video on a call is a valid topic. Do not upgrade it into a "platform" or "efficiency" discussion.
- Words like "train" or numbers do not mean AI/ML unless those words appear.
</rules>

<transcript>
${transcript.slice(0, TITLE_TRANSCRIPT_SLICE)}
</transcript>

<examples>
Good: "YouTube video call test", "Q4 sales review", "Catch-up with Sam"
Bad: "AI/ML Platform Testing and Training Efficiency Discussion" (domain not in the transcript)
Bad: "I'd be happy to help...", "Here's a title:", "The conversation is about..."
</examples>

Title:`
}

export function buildSessionSummaryPrompt(opts: {
  transcript: string
  slice: number
  modeName?: string | null
  notesSections?: NotesTemplateSection[]
}): string {
  const sections = (opts.notesSections ?? []).filter((section) => section.title)
  const modeLine = opts.modeName
    ? `\nSession mode name (do not let this invent a topic): ${opts.modeName}`
    : ''
  const sectionsBlock = sections.length
    ? `\n\nNOTES TEMPLATE — the user set up these sections for this mode. Use each section the transcript supports and follow its guidance. Skip a section only when the transcript genuinely has nothing for it:\n${sections
        .map((section) =>
          section.instructions ? `- ${section.title}: ${section.instructions}` : `- ${section.title}`,
        )
        .join('\n')}`
    : ''

  return `Write a title and notes for this transcript.${modeLine}${sectionsBlock}

The transcript may be a meeting, a casual chat, a live demo, or audio from a video playing on the call. Treat it as speech, not as a brief you must complete.

HARD RULES:
- Only state facts that appear in the transcript. Do not infer an industry, product, platform, or meeting purpose that is never named.
- Do not upgrade casual or fragmented speech into corporate or technical jargon. "Train ten minutes a day" is not "AI/ML training" unless those words appear.
- If speakers talk over each other, test a YouTube video, or the audio is incomplete, say that. Do not invent a coherent professional agenda to fill the gaps.
- If there is not enough to recap, use a short What was said section and one line that the transcript is incomplete. Do not pad with Open Questions or Next Steps the speakers did not raise.
- If anyone commits to a task, next step, or deliverable (for example "I'll send the deck", "we'll follow up next week", "due Friday"), you MUST include an "Action items" section listing them with the owner and any deadline that was stated. Only capture commitments that were actually spoken.

FORMAT:
- Title: 5-10 words, no quotes, from the actual topic.
- Use ## headings that fit THIS transcript.
- Bullets starting with "- ".
- **Bold** names and numbers that were actually said.

Respond in this exact format:
TITLE: [your title here]
SUMMARY:
[your markdown summary here]

TRANSCRIPT:
${opts.transcript.slice(0, opts.slice)}`
}
