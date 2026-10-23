/**
 * Background text descriptions of pasted screenshots.
 *
 * Right after a paste, a vision model writes down what the screenshot shows.
 * Assist then sends older screenshots as that text instead of re-uploading
 * every image on every request (see splitAssistScreenshots). Until the
 * description lands - or if it never does - the image itself is sent.
 */

import type { AIProvider } from './ai/types';
import type { ScreenshotStore } from './screenshotStore';
import { createLogger } from '../logger';

const log = createLogger('ScreenshotDescriber');

export const SCREENSHOT_DESCRIPTION_MAX_TOKENS = 1_200;
export const SCREENSHOT_DESCRIPTION_CHAR_CAP = 4_000;

export const SCREENSHOT_DESCRIPTION_PROMPT = `The user pasted this screenshot during a live call. Another assistant will later answer questions about the call WITHOUT seeing the image, using only your description.

Describe what is on the screen so nothing useful is lost:
- Copy all readable text, code, numbers, error messages and table cells verbatim.
- Say what kind of screen it is (app, page, document, chart, diagram) and how it is laid out.
- For charts and diagrams, give the values, labels and relationships they show.
- Do not guess at anything you cannot read; say it is unreadable instead.

Reply with the description only, no preamble. Use the language of the text on the screen.`;

export async function describeScreenshot(deps: {
  store: Pick<ScreenshotStore, 'read' | 'setDescription'>;
  getProvider: () => Promise<AIProvider | null>;
  sessionId: string;
  shotId: string;
}): Promise<boolean> {
  try {
    const provider = await deps.getProvider();
    if (!provider) return false;
    const image = deps.store.read(deps.sessionId, deps.shotId);
    if (!image) return false;

    const raw = await provider.generateShort({
      prompt: SCREENSHOT_DESCRIPTION_PROMPT,
      maxTokens: SCREENSHOT_DESCRIPTION_MAX_TOKENS,
      images: [{ base64: image.base64, mediaType: image.mediaType }],
    });
    const text = (typeof raw === 'string' ? raw : '').trim();
    if (!text) return false;

    const description = text.length > SCREENSHOT_DESCRIPTION_CHAR_CAP
      ? `${text.slice(0, SCREENSHOT_DESCRIPTION_CHAR_CAP)}\n[...truncated]`
      : text;
    deps.store.setDescription(deps.sessionId, deps.shotId, description);
    return true;
  } catch (err) {
    log.warn('Screenshot description failed (Assist will send the image):', err);
    return false;
  }
}
