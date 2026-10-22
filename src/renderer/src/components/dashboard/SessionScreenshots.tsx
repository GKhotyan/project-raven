import { X } from 'lucide-react'
import { formatElapsed } from '../../../../shared/screenshots'
import type { LoadedShot } from './useSessionScreenshots'

export function ScreenshotTile({
  loaded, index, startedAt, onOpen, onRemove,
}: {
  loaded: LoadedShot
  index: number
  startedAt: number
  onOpen: () => void
  onRemove: () => void
}) {
  return (
    <div className="relative inline-block group my-2">
      <button type="button" onClick={onOpen} className="block">
        <img src={loaded.url} alt={`Screenshot ${index}`} className="h-28 rounded-lg border border-gray-200 object-cover" />
      </button>
      <span className="block text-xs text-gray-400 mt-1">
        Screenshot {index} · {formatElapsed(loaded.shot.timestamp - startedAt)}
      </span>
      <button
        type="button"
        aria-label={`Delete screenshot ${index}`}
        onClick={onRemove}
        className="absolute top-1 right-1 hidden group-hover:flex items-center justify-center w-6 h-6 rounded-full bg-white/90 text-gray-600 hover:text-red-600 shadow"
      >
        <X size={14} />
      </button>
    </div>
  )
}

export function ScreenshotLightbox({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-8" onClick={onClose} role="dialog">
      <img src={url} alt="Screenshot" className="max-w-full max-h-full rounded-lg shadow-2xl" />
    </div>
  )
}
