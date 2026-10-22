import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }))
vi.mock('electron', () => ({ nativeImage: { createFromBuffer: mockCreate } }))

import { fitScreenshot } from '../services/screenshotFit'

function fakeImage(width: number, height: number, encoded: { png: number; jpeg: number }) {
  const img = {
    isEmpty: () => false,
    getSize: () => ({ width, height }),
    resize: vi.fn((opts: { width?: number; height?: number }) => {
      const scale = opts.width ? opts.width / width : opts.height! / height
      return fakeImage(Math.round(width * scale), Math.round(height * scale), encoded)
    }),
    toPNG: () => Buffer.alloc(encoded.png),
    toJPEG: vi.fn(() => Buffer.alloc(encoded.jpeg)),
  }
  return img
}

const bytes = (n: number) => new Uint8Array(n)

describe('fitScreenshot', () => {
  beforeEach(() => mockCreate.mockReset())

  it('keeps a small image as is', () => {
    mockCreate.mockReturnValue(fakeImage(1440, 900, { png: 0, jpeg: 0 }))
    const input = bytes(300_000)

    expect(fitScreenshot(input, 'image/png')).toEqual({ bytes: input, mediaType: 'image/png' })
  })

  it('scales a Retina screenshot down to a 2576 px long edge and keeps PNG when it fits', () => {
    const img = fakeImage(5120, 2880, { png: 900_000, jpeg: 300_000 })
    mockCreate.mockReturnValue(img)

    const out = fitScreenshot(bytes(8_000_000), 'image/png')

    expect(img.resize).toHaveBeenCalledWith({ width: 2576, quality: 'best' })
    expect(out.mediaType).toBe('image/png')
    expect(out.bytes.length).toBe(900_000)
  })

  it('re-encodes as JPEG when the image is still over 1 MB', () => {
    const img = fakeImage(1800, 2600, { png: 3_000_000, jpeg: 400_000 })
    mockCreate.mockReturnValue(img)

    const out = fitScreenshot(bytes(3_000_000), 'image/png')

    expect(img.resize).toHaveBeenCalledWith({ height: 2576, quality: 'best' })
    expect(out).toEqual({ bytes: expect.any(Uint8Array), mediaType: 'image/jpeg' })
    expect(out.bytes.length).toBe(400_000)
  })

  it('leaves bytes alone when Electron cannot decode them', () => {
    mockCreate.mockReturnValue({ isEmpty: () => true })
    const input = bytes(2_000_000)

    expect(fitScreenshot(input, 'image/jpeg')).toEqual({ bytes: input, mediaType: 'image/jpeg' })
  })
})
