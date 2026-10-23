import { useCallback, useEffect, useState, type MutableRefObject } from 'react'
import { X } from 'lucide-react'
import { formatElapsed, modelAcceptsImages, type SessionScreenshot } from '../../../../shared/screenshots'
import { parseAIProviderName } from '../../../../shared/aiSlots'
import { ScreenshotViewer } from './ScreenshotViewer'

interface Thumb {
  shot: SessionScreenshot
  url: string
}

/** Thumbnails of the active session's pasted screenshots: click to enlarge, hover to delete. */
export function ScreenshotStrip({
  isRecording,
  viewerRef,
}: {
  isRecording: boolean
  /** The open viewer's root, so mouse passthrough keeps it clickable. */
  viewerRef: MutableRefObject<HTMLDivElement | null>
}) {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [thumbs, setThumbs] = useState<Thumb[]>([])
  const [visionOk, setVisionOk] = useState(true)
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  const refresh = useCallback(async () => {
    const res = await window.raven.screenshots.list()
    if (!res.ok) return
    setSessionId(res.value.sessionId)
    // The overlay has no recording clock; the session row has its start time.
    const session = res.value.sessionId ? await window.raven.sessions.get(res.value.sessionId) : null
    setStartedAt(session?.startedAt ?? null)
    const next: Thumb[] = []
    for (const shot of res.value.screenshots) {
      const url = res.value.sessionId ? await window.raven.screenshots.read(res.value.sessionId, shot.id) : null
      if (url && url.ok) next.push({ shot, url: url.value })
    }
    setThumbs(next)
    const provider = parseAIProviderName(await window.raven.storeGet('aiProvider')) ?? 'anthropic'
    const model = (await window.raven.storeGet('aiModel')) as string
    setVisionOk(modelAcceptsImages(provider, model || ''))
  }, [])

  useEffect(() => {
    if (!isRecording) {
      setThumbs([])
      setSessionId(null)
      setStartedAt(null)
      return
    }
    void refresh()
    return window.raven.screenshots.onChanged(() => { void refresh() })
  }, [isRecording, refresh])

  // A deleted shot or a stopped session can leave the viewer pointing past the end.
  useEffect(() => {
    if (openIndex != null && openIndex >= thumbs.length) setOpenIndex(null)
  }, [openIndex, thumbs.length])

  const openViewer = (i: number) => {
    // Activate the overlay (Windows) so the viewer gets Esc / arrow keys.
    void window.raven.windowSetOverlayFocusable(true)
    setOpenIndex(i)
  }

  const caption = (shot: SessionScreenshot, i: number) =>
    startedAt ? `Screenshot ${i + 1} · ${formatElapsed(shot.timestamp - startedAt)}` : `Screenshot ${i + 1}`

  if (thumbs.length === 0) return null

  return (
    <div className="px-4 pt-2">
      <div className="flex gap-2 overflow-x-auto">
        {thumbs.map(({ shot, url }, i) => (
          <div key={shot.id} className="relative shrink-0 group">
            <button type="button" aria-label={`Open screenshot ${i + 1}`} onClick={() => openViewer(i)} className="block cursor-zoom-in">
              <img src={url} alt={`Screenshot ${i + 1}`} className="h-12 w-20 object-cover rounded-md border border-white/15 hover:border-white/40 transition-colors" />
            </button>
            <span className="absolute bottom-0 left-0 right-0 pointer-events-none text-[10px] text-white/80 bg-black/50 rounded-b-md text-center">
              {startedAt ? formatElapsed(shot.timestamp - startedAt) : `#${i + 1}`}
            </span>
            <button
              type="button"
              aria-label={`Remove screenshot ${i + 1}`}
              onClick={() => { if (sessionId) void window.raven.screenshots.remove(sessionId, shot.id) }}
              className="absolute -top-1.5 -right-1.5 hidden group-hover:flex items-center justify-center w-4 h-4 rounded-full bg-black/80 text-white/80 hover:text-white"
            >
              <X size={10} />
            </button>
          </div>
        ))}
      </div>
      {!visionOk && (
        <p className="mt-1 text-[11px] text-amber-300/80">The current Live assist model can't see images.</p>
      )}
      {openIndex != null && openIndex < thumbs.length && (
        <ScreenshotViewer
          shots={thumbs.map(({ shot, url }, i) => ({ id: shot.id, url, caption: caption(shot, i) }))}
          index={openIndex}
          onIndexChange={setOpenIndex}
          onClose={() => setOpenIndex(null)}
          viewerRef={viewerRef}
        />
      )}
    </div>
  )
}
