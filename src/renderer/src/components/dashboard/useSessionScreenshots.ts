import { useCallback, useEffect, useState } from 'react'
import type { SessionScreenshot } from '../../../../shared/screenshots'

export interface LoadedShot {
  shot: SessionScreenshot
  url: string
}

export function useSessionScreenshots(sessionId: string) {
  const [shots, setShots] = useState<LoadedShot[]>([])

  const refresh = useCallback(async () => {
    const res = await window.raven.screenshots.list(sessionId)
    if (!res.ok) return
    const next: LoadedShot[] = []
    for (const shot of res.value.screenshots) {
      const url = await window.raven.screenshots.read(sessionId, shot.id)
      if (url.ok) next.push({ shot, url: url.value })
    }
    setShots(next)
  }, [sessionId])

  useEffect(() => {
    void refresh()
    return window.raven.screenshots.onChanged((changed) => {
      if (changed === sessionId) void refresh()
    })
  }, [sessionId, refresh])

  const remove = useCallback(async (id: string) => {
    await window.raven.screenshots.remove(sessionId, id)
    await refresh()
  }, [sessionId, refresh])

  return { shots, remove }
}
