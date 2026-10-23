import { describe, expect, it } from 'vitest'
import {
  EMPTY_OVERLAY_INSETS,
  overlayPanelTop,
  placeOverlayPanel,
  resizeOverlayPanel,
} from '../overlayPanelLayout'

describe('placeOverlayPanel', () => {
  it('grows downward so a centered compact card does not slide under the menu bar', () => {
    const vh = 1080
    const compactHeight = 216
    const bottom = Math.round((vh - compactHeight) / 2)
    const placed = placeOverlayPanel({
      viewportWidth: 1280,
      viewportHeight: vh,
      insets: { top: 38, right: 0, bottom: 0, left: 0 },
      width: 480,
      height: 500,
      right: 400,
      bottom,
      previousHeight: compactHeight,
    })

    expect(overlayPanelTop(vh, placed.bottom, placed.height)).toBe(
      overlayPanelTop(vh, bottom, compactHeight),
    )
    expect(overlayPanelTop(vh, placed.bottom, placed.height)).toBeGreaterThanOrEqual(58)
  })

  it('shifts the card down when it was already at the top of the screen', () => {
    const vh = 982
    const compactHeight = 216
    const placed = placeOverlayPanel({
      viewportWidth: 1512,
      viewportHeight: vh,
      insets: { top: 38, right: 0, bottom: 0, left: 0 },
      width: 480,
      height: 500,
      right: 20,
      bottom: vh - compactHeight,
      previousHeight: compactHeight,
    })

    const top = overlayPanelTop(vh, placed.bottom, placed.height)
    expect(top).toBeGreaterThanOrEqual(58)
    expect(placed.bottom).toBeGreaterThanOrEqual(20)
  })

  it('does not grow past the work area on a short display', () => {
    const placed = placeOverlayPanel({
      viewportWidth: 1280,
      viewportHeight: 500,
      insets: { top: 38, right: 0, bottom: 0, left: 0 },
      width: 480,
      height: 500,
      right: 20,
      bottom: 20,
      previousHeight: 216,
    })

    expect(placed.height).toBe(500 - 38 - 20 - 20)
    expect(overlayPanelTop(500, placed.bottom, placed.height)).toBeGreaterThanOrEqual(58)
  })

  it('keeps an 800px Mac display from expanding under the menu bar', () => {
    const vh = 800
    const compactHeight = 216
    const bottom = Math.round((vh - compactHeight) / 2)
    const placed = placeOverlayPanel({
      viewportWidth: 1280,
      viewportHeight: vh,
      insets: { top: 38, right: 0, bottom: 0, left: 0 },
      width: 480,
      height: 500,
      right: 400,
      bottom,
      previousHeight: compactHeight,
    })
    expect(overlayPanelTop(vh, placed.bottom, placed.height)).toBeGreaterThanOrEqual(58)
  })

  it('grows upward when the card is already at the bottom of the screen', () => {
    const vh = 982
    const compactHeight = 216
    const bottom = 20
    const placed = placeOverlayPanel({
      viewportWidth: 1512,
      viewportHeight: vh,
      insets: { top: 38, right: 0, bottom: 0, left: 0 },
      width: 480,
      height: 500,
      right: 20,
      bottom,
      previousHeight: compactHeight,
    })

    expect(placed.bottom).toBe(bottom)
    expect(overlayPanelTop(vh, placed.bottom, placed.height)).toBeLessThan(
      overlayPanelTop(vh, bottom, compactHeight),
    )
    expect(overlayPanelTop(vh, placed.bottom, placed.height)).toBeGreaterThanOrEqual(58)
  })

  it('leaves a card that already fits unmoved', () => {
    const placed = placeOverlayPanel({
      viewportWidth: 1920,
      viewportHeight: 1080,
      insets: EMPTY_OVERLAY_INSETS,
      width: 480,
      height: 216,
      right: 100,
      bottom: 100,
      previousHeight: 216,
    })
    expect(placed).toEqual({ right: 100, bottom: 100, height: 216, width: 480 })
  })
})

describe('resizeOverlayPanel', () => {
  const base = {
    viewportWidth: 1920,
    viewportHeight: 1080,
    insets: EMPTY_OVERLAY_INSETS,
    minWidth: 380,
    minHeight: 300,
    start: { width: 500, height: 500, right: 400, bottom: 200 },
  }
  const left = (r: { width: number; right: number }) => 1920 - r.right - r.width

  it('keeps the left edge when dragging the right edge', () => {
    const r = resizeOverlayPanel({ ...base, edge: 'e', dx: 60, dy: 30 })
    expect(r).toMatchObject({ width: 560, height: 500, bottom: 200 })
    expect(left(r)).toBe(left(base.start))
  })

  it('keeps the right edge when dragging the left edge', () => {
    const r = resizeOverlayPanel({ ...base, edge: 'w', dx: -60, dy: 0 })
    expect(r).toMatchObject({ width: 560, right: 400 })
  })

  it('keeps the top edge when dragging the bottom edge', () => {
    const r = resizeOverlayPanel({ ...base, edge: 's', dx: 0, dy: 50 })
    expect(r).toMatchObject({ height: 550, bottom: 150, width: 500 })
  })

  it('keeps the bottom edge when dragging the top edge', () => {
    const r = resizeOverlayPanel({ ...base, edge: 'n', dx: 0, dy: -50 })
    expect(r).toMatchObject({ height: 550, bottom: 200 })
  })

  it('resizes both axes from a corner', () => {
    const r = resizeOverlayPanel({ ...base, edge: 'nw', dx: -20, dy: -40 })
    expect(r).toMatchObject({ width: 520, height: 540, right: 400, bottom: 200 })
  })

  it('lets the panel shrink down to the minimum, not below', () => {
    const r = resizeOverlayPanel({ ...base, edge: 'se', dx: -400, dy: -400 })
    expect(r).toMatchObject({ width: 380, height: 300 })
    expect(left(r)).toBe(left(base.start))
  })

  it('stops the top edge at the screen top instead of pushing the panel down', () => {
    const r = resizeOverlayPanel({ ...base, edge: 'n', dx: 0, dy: -2000 })
    expect(r.bottom).toBe(200)
    expect(overlayPanelTop(1080, r.bottom, r.height)).toBe(20)
  })

  it('stops the left edge at the screen edge instead of pushing the panel right', () => {
    const r = resizeOverlayPanel({ ...base, edge: 'w', dx: -5000, dy: 0 })
    expect(r.right).toBe(400)
    expect(left(r)).toBe(20)
  })

  it('ignores vertical movement when height is locked', () => {
    const r = resizeOverlayPanel({ ...base, edge: 'se', dx: 10, dy: 80, lockHeight: true })
    expect(r).toMatchObject({ width: 510, height: 500, bottom: 200 })
  })
})
