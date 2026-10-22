import { existsSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import {
  MAX_SCREENSHOT_BYTES,
  MAX_SCREENSHOTS_PER_SESSION,
  type ScreenshotMediaType,
  type SessionScreenshot,
} from '../../shared/screenshots';
import { createLogger } from '../logger';

const log = createLogger('Screenshots');

/** Message is shown to the user as is. */
export class ScreenshotError extends Error {}

export interface ScreenshotStore {
  add(sessionId: string, bytes: Uint8Array): SessionScreenshot;
  list(sessionId: string): SessionScreenshot[];
  read(sessionId: string, id: string): { base64: string; mediaType: ScreenshotMediaType } | null;
  readMany(sessionId: string, shots: SessionScreenshot[]): Array<{ shot: SessionScreenshot; base64: string }>;
  remove(sessionId: string, id: string): void;
  removeAll(sessionId: string): void;
}

// Session ids are UUIDs and screenshot ids come from newId(); anything else
// (like "../") never reaches the file system.
const SAFE_ID = /^[A-Za-z0-9-]{1,64}$/;

function sniffType(bytes: Uint8Array): ScreenshotMediaType | null {
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= png.length && png.every((b, i) => bytes[i] === b)) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  return null;
}

export function createScreenshotStore(deps: {
  rootDir: string;
  getList(sessionId: string): SessionScreenshot[];
  setList(sessionId: string, list: SessionScreenshot[]): void;
  now?: () => number;
  newId?: () => string;
  /** Shrinks or re-encodes a validated image before it is written. */
  prepare?: (bytes: Uint8Array, mediaType: ScreenshotMediaType) => { bytes: Uint8Array; mediaType: ScreenshotMediaType };
}): ScreenshotStore {
  const now = deps.now ?? Date.now;
  const newId = deps.newId ?? (() => randomUUID());
  const prepare = deps.prepare ?? ((bytes, mediaType) => ({ bytes, mediaType }));

  const sessionDir = (sessionId: string): string => {
    if (!SAFE_ID.test(sessionId)) throw new ScreenshotError('Invalid session.');
    return join(deps.rootDir, sessionId);
  };

  const fileFor = (sessionId: string, id: string): { path: string; shot: SessionScreenshot } | null => {
    if (!SAFE_ID.test(sessionId) || !SAFE_ID.test(id)) return null;
    const shot = deps.getList(sessionId).find((s) => s.id === id);
    if (!shot || !SAFE_ID.test(shot.file.replace(/\.(png|jpg)$/, ''))) return null;
    return { path: join(deps.rootDir, sessionId, shot.file), shot };
  };

  const store: ScreenshotStore = {
    add(sessionId, bytes) {
      const dir = sessionDir(sessionId);
      const sniffed = sniffType(bytes);
      if (!sniffed) throw new ScreenshotError('Only PNG and JPEG images can be added.');
      if (bytes.length > MAX_SCREENSHOT_BYTES) throw new ScreenshotError('Screenshot is larger than 10 MB.');
      const list = deps.getList(sessionId);
      if (list.length >= MAX_SCREENSHOTS_PER_SESSION) {
        throw new ScreenshotError(`This session already has ${MAX_SCREENSHOTS_PER_SESSION} screenshots.`);
      }
      const { bytes: stored, mediaType } = prepare(bytes, sniffed);
      const id = newId();
      const shot: SessionScreenshot = {
        id,
        timestamp: now(),
        file: `${id}.${mediaType === 'image/png' ? 'png' : 'jpg'}`,
        mediaType,
      };
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, shot.file), Buffer.from(stored));
      deps.setList(sessionId, [...list, shot]);
      return shot;
    },

    list(sessionId) {
      return SAFE_ID.test(sessionId) ? deps.getList(sessionId) : [];
    },

    read(sessionId, id) {
      const found = fileFor(sessionId, id);
      if (!found || !existsSync(found.path)) return null;
      return { base64: readFileSync(found.path).toString('base64'), mediaType: found.shot.mediaType };
    },

    readMany(sessionId, shots) {
      const out: Array<{ shot: SessionScreenshot; base64: string }> = [];
      for (const shot of shots) {
        const data = store.read(sessionId, shot.id);
        if (data) {
          out.push({ shot, base64: data.base64 });
        } else {
          log.warn('Screenshot file missing, skipped:', sessionId, shot.id);
        }
      }
      return out;
    },

    remove(sessionId, id) {
      const found = fileFor(sessionId, id);
      if (!found) return;
      if (existsSync(found.path)) unlinkSync(found.path);
      deps.setList(sessionId, deps.getList(sessionId).filter((s) => s.id !== id));
    },

    removeAll(sessionId) {
      if (!SAFE_ID.test(sessionId)) return;
      rmSync(join(deps.rootDir, sessionId), { recursive: true, force: true });
      // After deleteSession the row is gone and this UPDATE touches 0 rows.
      deps.setList(sessionId, []);
    },
  };
  return store;
}

let instance: ScreenshotStore | null = null;

/** Called once from main/index.ts after the database is initialized. */
export function setScreenshotStore(store: ScreenshotStore): void {
  instance = store;
}

/** App-wide store. Tests mock this module instead of calling setScreenshotStore. */
export function getScreenshotStore(): ScreenshotStore {
  if (!instance) throw new Error('Screenshot store not initialized');
  return instance;
}
