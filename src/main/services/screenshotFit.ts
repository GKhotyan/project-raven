import { nativeImage } from 'electron';
import type { ScreenshotMediaType } from '../../shared/screenshots';

// Models downscale anything past a 2576 px long edge (Claude's high-res
// tier), so larger pixels only cost bytes. Every Assist call sends all of a
// session's screenshots: at ~1 MB each, 20 of them stay under the Claude
// API's 10 MB-per-image and 32 MB-per-request limits once base64-encoded.
const MAX_LONG_EDGE = 2576;
const MAX_STORED_BYTES = 1024 * 1024;
const JPEG_QUALITY = 85;

/** Shrink a pasted screenshot so every provider accepts it. */
export function fitScreenshot(
  bytes: Uint8Array,
  mediaType: ScreenshotMediaType,
): { bytes: Uint8Array; mediaType: ScreenshotMediaType } {
  let image = nativeImage.createFromBuffer(Buffer.from(bytes));
  if (image.isEmpty()) return { bytes, mediaType };

  const { width, height } = image.getSize();
  const tooLarge = Math.max(width, height) > MAX_LONG_EDGE;
  if (!tooLarge && bytes.length <= MAX_STORED_BYTES) return { bytes, mediaType };

  if (tooLarge) {
    image = image.resize(
      width >= height
        ? { width: MAX_LONG_EDGE, quality: 'best' }
        : { height: MAX_LONG_EDGE, quality: 'best' },
    );
  }
  if (mediaType === 'image/png') {
    const png = image.toPNG();
    if (png.length <= MAX_STORED_BYTES) return { bytes: png, mediaType: 'image/png' };
  }
  return { bytes: image.toJPEG(JPEG_QUALITY), mediaType: 'image/jpeg' };
}
