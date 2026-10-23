import { useEffect, useRef, type MutableRefObject } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'

interface ViewerShot {
  id: string
  url: string
  caption: string
}

/**
 * Full-screen quick look at one pasted screenshot. Esc, a click on the
 * backdrop or the X closes it; arrow keys step through the session's shots.
 * Rendered into <body> so the card's rounded clipping doesn't crop it.
 */
export function ScreenshotViewer({
  shots,
  index,
  onIndexChange,
  onClose,
  viewerRef,
}: {
  shots: ViewerShot[]
  index: number
  onIndexChange: (index: number) => void
  onClose: () => void
  viewerRef: MutableRefObject<HTMLDivElement | null>
}) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const shot = shots[index]
  const canStep = shots.length > 1

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeRef.current()
      } else if (e.key === 'ArrowLeft' && canStep) {
        e.preventDefault()
        onIndexChange((index - 1 + shots.length) % shots.length)
      } else if (e.key === 'ArrowRight' && canStep) {
        e.preventDefault()
        onIndexChange((index + 1) % shots.length)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [index, shots.length, canStep, onIndexChange])

  // Take keyboard focus so Esc reaches us even if the input had it.
  useEffect(() => {
    viewerRef.current?.focus()
  }, [viewerRef])

  if (!shot) return null

  const stepButton = 'absolute top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center bg-black/60 text-white/80 hover:text-white hover:bg-black/80 transition-colors'

  return createPortal(
    <div
      ref={viewerRef}
      tabIndex={-1}
      role="dialog"
      aria-label="Screenshot"
      className="fixed inset-0 z-[200] bg-black/75 flex flex-col items-center justify-center gap-3 p-12 outline-none pointer-events-auto"
      onClick={onClose}
    >
      <img
        src={shot.url}
        alt={shot.caption}
        className="max-w-full min-h-0 max-h-full object-contain rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        draggable={false}
      />
      <span className="text-xs text-white/70">
        {shot.caption}{canStep ? ` · ${index + 1} / ${shots.length}` : ''}
      </span>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute top-5 right-5 w-9 h-9 rounded-full flex items-center justify-center bg-black/60 text-white/80 hover:text-white hover:bg-black/80 transition-colors"
      >
        <X size={18} />
      </button>
      {canStep && (
        <>
          <button
            type="button"
            aria-label="Previous screenshot"
            onClick={(e) => { e.stopPropagation(); onIndexChange((index - 1 + shots.length) % shots.length) }}
            className={`${stepButton} left-5`}
          >
            <ChevronLeft size={20} />
          </button>
          <button
            type="button"
            aria-label="Next screenshot"
            onClick={(e) => { e.stopPropagation(); onIndexChange((index + 1) % shots.length) }}
            className={`${stepButton} right-5`}
          >
            <ChevronRight size={20} />
          </button>
        </>
      )}
    </div>,
    document.body,
  )
}
