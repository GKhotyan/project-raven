import type { SessionScreenshot } from '../shared/screenshots';
import { ScreenshotError, type ScreenshotStore } from './services/screenshotStore';
import { createLogger } from './logger';

const log = createLogger('ScreenshotIpc');

export type ScreenshotResult<T> = { ok: true; value: T } | { ok: false; error: string };

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

/** Renderer-facing screenshot operations. Every check lives here, not in the UI. */
export function createScreenshotHandlers(deps: {
  store: ScreenshotStore;
  getActiveSession(): { id: string } | null;
  isIncognito(): boolean;
}) {
  return {
    add(bytes: unknown): ScreenshotResult<SessionScreenshot & { sessionId: string }> {
      const session = deps.getActiveSession();
      if (!session) return fail('Start recording to add screenshots.');
      if (deps.isIncognito()) return fail('Screenshots are off in incognito mode.');
      if (!(bytes instanceof Uint8Array)) return fail('Only PNG and JPEG images can be added.');
      try {
        return { ok: true, value: { ...deps.store.add(session.id, bytes), sessionId: session.id } };
      } catch (err) {
        if (err instanceof ScreenshotError) return fail(err.message);
        log.error('Failed to save screenshot:', err);
        return fail('Could not save the screenshot.');
      }
    },

    list(sessionId?: unknown): ScreenshotResult<{ sessionId: string | null; screenshots: SessionScreenshot[] }> {
      const id = typeof sessionId === 'string' ? sessionId : deps.getActiveSession()?.id ?? null;
      return { ok: true, value: { sessionId: id, screenshots: id ? deps.store.list(id) : [] } };
    },

    read(sessionId: unknown, id: unknown): ScreenshotResult<string> {
      if (typeof sessionId !== 'string' || typeof id !== 'string') return fail('Invalid screenshot.');
      const data = deps.store.read(sessionId, id);
      if (!data) return fail('Screenshot not found.');
      return { ok: true, value: `data:${data.mediaType};base64,${data.base64}` };
    },

    remove(sessionId: unknown, id: unknown): ScreenshotResult<true> {
      if (typeof sessionId !== 'string' || typeof id !== 'string') return fail('Invalid screenshot.');
      deps.store.remove(sessionId, id);
      return { ok: true, value: true };
    },
  };
}
