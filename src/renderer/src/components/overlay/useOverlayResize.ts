import { useState, useCallback, useRef, type MouseEvent as ReactMouseEvent } from 'react'
import {
  EMPTY_OVERLAY_INSETS,
  placeOverlayPanel,
  resizeOverlayPanel,
  type OverlayInsets,
  type OverlayResizeEdge,
} from '../../lib/overlayPanelLayout'

export type ResizeEdge = OverlayResizeEdge

const OVERLAY_MIN_WIDTH = 380
const OVERLAY_DEFAULT_WIDTH = 448
const OVERLAY_DEFAULT_COMPACT_HEIGHT = 140
const OVERLAY_EXPANDED_MIN_HEIGHT = 260
const OVERLAY_DEFAULT_EXPANDED_HEIGHT = 460
const PANEL_EDGE_MARGIN = 20

const EDGE_CURSORS: Record<ResizeEdge, string> = {
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  nw: 'nwse-resize',
  se: 'nwse-resize',
}

export function useOverlayResize(insets: OverlayInsets = EMPTY_OVERLAY_INSETS) {
  const [panelWidth, setPanelWidth] = useState(OVERLAY_DEFAULT_WIDTH)
  const [panelBottom, setPanelBottom] = useState(() =>
    Math.max(PANEL_EDGE_MARGIN, Math.round((window.innerHeight - OVERLAY_DEFAULT_COMPACT_HEIGHT) / 2))
  )
  const [panelRight, setPanelRight] = useState(() =>
    Math.max(PANEL_EDGE_MARGIN, Math.round((window.innerWidth - OVERLAY_DEFAULT_WIDTH) / 2))
  )
  // Height of the expanded card (body visible). The idle and collapsed cards
  // size to their content, so this is remembered across collapse / expand.
  const [panelHeight, setPanelHeight] = useState(OVERLAY_DEFAULT_EXPANDED_HEIGHT)
  const [activeResizeEdge, setActiveResizeEdge] = useState<ResizeEdge | null>(null)
  const resizeCleanupRef = useRef<(() => void) | null>(null)

  const handleResizeStart = useCallback((
    edge: ResizeEdge,
    e: ReactMouseEvent<HTMLDivElement>,
    isPanelExpanded: boolean,
  ) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()

    resizeCleanupRef.current?.()

    const start = { width: panelWidth, height: panelHeight, right: panelRight, bottom: panelBottom }
    const startScreenX = e.screenX
    const startScreenY = e.screenY
    const originalCursor = document.body.style.cursor
    const originalUserSelect = document.body.style.userSelect
    document.body.style.cursor = EDGE_CURSORS[edge]
    document.body.style.userSelect = 'none'
    setActiveResizeEdge(edge)

    const onMouseMove = (moveEvent: MouseEvent) => {
      const next = resizeOverlayPanel({
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        insets,
        minWidth: OVERLAY_MIN_WIDTH,
        minHeight: OVERLAY_EXPANDED_MIN_HEIGHT,
        start,
        edge,
        dx: moveEvent.screenX - startScreenX,
        dy: moveEvent.screenY - startScreenY,
        lockHeight: !isPanelExpanded,
      })
      setPanelWidth(next.width)
      setPanelRight(next.right)
      setPanelBottom(next.bottom)
      setPanelHeight(next.height)
    }

    const cleanup = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = originalCursor
      document.body.style.userSelect = originalUserSelect
      setActiveResizeEdge(null)
      resizeCleanupRef.current = null
    }

    const onMouseUp = () => cleanup()

    resizeCleanupRef.current = cleanup
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp, { once: true })
  }, [panelWidth, panelRight, panelBottom, panelHeight, insets])

  const handleResizeDoubleClick = useCallback((isPanelExpanded: boolean) => {
    const h = isPanelExpanded ? OVERLAY_DEFAULT_EXPANDED_HEIGHT : OVERLAY_DEFAULT_COMPACT_HEIGHT
    const placed = placeOverlayPanel({
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      insets,
      width: OVERLAY_DEFAULT_WIDTH,
      height: h,
      right: Math.round((window.innerWidth - OVERLAY_DEFAULT_WIDTH) / 2),
      bottom: Math.round((window.innerHeight - h) / 2),
      previousHeight: h,
    })
    setPanelWidth(placed.width)
    setPanelHeight(isPanelExpanded ? placed.height : OVERLAY_DEFAULT_EXPANDED_HEIGHT)
    setPanelRight(placed.right)
    setPanelBottom(placed.bottom)
  }, [insets])

  const cleanupResize = useCallback(() => {
    resizeCleanupRef.current?.()
  }, [])

  return {
    panelWidth, panelRight, panelBottom, panelHeight,
    setPanelWidth, setPanelRight, setPanelBottom, setPanelHeight,
    activeResizeEdge,
    handleResizeStart,
    handleResizeDoubleClick,
    cleanupResize,
    EDGE_CURSORS,
    OVERLAY_DEFAULT_COMPACT_HEIGHT,
    OVERLAY_DEFAULT_EXPANDED_HEIGHT,
    OVERLAY_MIN_WIDTH,
    PANEL_EDGE_MARGIN,
  }
}
