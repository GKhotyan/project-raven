export interface OverlayInsets {
  top: number
  right: number
  bottom: number
  left: number
}

export const OVERLAY_PANEL_MARGIN = 20

export const EMPTY_OVERLAY_INSETS: OverlayInsets = {
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
}

/**
 * Place the overlay card inside the visible work area.
 *
 * The overlay BrowserWindow is fullscreen (including under the macOS menu
 * bar). The card is CSS-positioned with `bottom` / `right`.
 *
 * On grow (`previousHeight` < `height`): expand into free space.
 * - Room below → grow down (pill / top edge stays put).
 * - Parked on the bottom → grow up (input / bottom edge stays put).
 * Then clamp so the card never sits under the menu bar or in the dock.
 */
export function placeOverlayPanel(opts: {
  viewportWidth: number
  viewportHeight: number
  insets: OverlayInsets
  margin?: number
  width: number
  height: number
  right: number
  bottom: number
  previousHeight?: number
}): { right: number; bottom: number; height: number; width: number } {
  const margin = opts.margin ?? OVERLAY_PANEL_MARGIN
  const vw = opts.viewportWidth
  const vh = opts.viewportHeight
  const minTop = opts.insets.top + margin
  const minBottom = opts.insets.bottom + margin
  const minLeft = opts.insets.left + margin
  const minRight = opts.insets.right + margin

  let height = opts.height
  let width = opts.width
  let bottom = opts.bottom
  let right = opts.right

  const maxHeight = Math.max(1, vh - minTop - minBottom)
  const maxWidth = Math.max(1, vw - minLeft - minRight)
  height = Math.min(height, maxHeight)
  width = Math.min(width, maxWidth)

  if (opts.previousHeight != null && height > opts.previousHeight) {
    const delta = height - opts.previousHeight
    const roomBelow = bottom - minBottom
    const currentTop = vh - bottom - opts.previousHeight
    const roomAbove = currentTop - minTop
    if (roomBelow >= delta) {
      bottom -= delta
    } else if (roomAbove < delta) {
      bottom -= Math.min(delta, Math.max(0, roomBelow))
    }
    // else: enough room above and not enough below — keep `bottom` (grow up).
  }

  const maxBottom = vh - height - minTop
  const maxRight = vw - width - minLeft
  bottom = clamp(bottom, minBottom, Math.max(minBottom, maxBottom))
  right = clamp(right, minRight, Math.max(minRight, maxRight))

  return { right, bottom, height, width }
}

export type OverlayResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

interface OverlayPanelRect {
  width: number
  height: number
  right: number
  bottom: number
}

/**
 * Resize the card from any edge or corner, like a normal window: the edge
 * under the cursor moves, the opposite edge stays put. The moving edge stops
 * at the work area instead of shoving the whole card across the screen.
 * `lockHeight` freezes the vertical axis (the idle card sizes to its content).
 */
export function resizeOverlayPanel(opts: {
  viewportWidth: number
  viewportHeight: number
  insets: OverlayInsets
  margin?: number
  minWidth: number
  minHeight: number
  start: OverlayPanelRect
  edge: OverlayResizeEdge
  dx: number
  dy: number
  lockHeight?: boolean
}): OverlayPanelRect {
  const margin = opts.margin ?? OVERLAY_PANEL_MARGIN
  const { start, edge } = opts
  let { width, height, right, bottom } = start

  if (edge.includes('w')) {
    const maxWidth = opts.viewportWidth - start.right - opts.insets.left - margin
    width = clamp(start.width - opts.dx, opts.minWidth, Math.max(opts.minWidth, maxWidth))
  } else if (edge.includes('e')) {
    const maxWidth = start.width + start.right - opts.insets.right - margin
    width = clamp(start.width + opts.dx, opts.minWidth, Math.max(opts.minWidth, maxWidth))
    right = start.right - (width - start.width)
  }

  if (!opts.lockHeight) {
    if (edge.includes('n')) {
      const maxHeight = opts.viewportHeight - start.bottom - opts.insets.top - margin
      height = clamp(start.height - opts.dy, opts.minHeight, Math.max(opts.minHeight, maxHeight))
    } else if (edge.includes('s')) {
      const maxHeight = start.height + start.bottom - opts.insets.bottom - margin
      height = clamp(start.height + opts.dy, opts.minHeight, Math.max(opts.minHeight, maxHeight))
      bottom = start.bottom - (height - start.height)
    }
  }

  return { width, height, right, bottom }
}

export function overlayPanelTop(viewportHeight: number, bottom: number, height: number): number {
  return viewportHeight - bottom - height
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
