/**
 * Mode picker on the session detail header.
 * - Shows which mode the session was recorded in
 * - Reassigns the session to another mode; the summary picks up the new
 *   mode's notes template on the next regenerate
 * - Locked while recording into this session, since the recorder holds
 *   the mode in memory and would keep using the old one
 */

import { useState, useEffect, useRef } from 'react'
import { Layers, ChevronDown, Check } from 'lucide-react'
import type { Mode } from '../../types/global'
import { createLogger } from '../../lib/logger'
import { MODES_CHANGED_EVENT, selectableModes } from '../../lib/activeMode'

const log = createLogger('SessionModePicker')

export function SessionModePicker({
  sessionId,
  modeId,
  disabled = false,
}: {
  sessionId: string
  modeId: string | null
  disabled?: boolean
}) {
  const [modes, setModes] = useState<Mode[]>([])
  const [currentId, setCurrentId] = useState<string | null>(modeId)
  const [menuOpen, setMenuOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setCurrentId(modeId)
  }, [sessionId, modeId])

  useEffect(() => {
    async function loadModes() {
      try {
        setModes(selectableModes(await window.raven.modes.getAll()))
      } catch (err) {
        log.error('Failed to load modes:', err)
      }
    }
    loadModes()
    window.addEventListener(MODES_CHANGED_EVENT, loadModes)
    const unsub = window.raven.modes.onListUpdated(loadModes)
    return () => {
      window.removeEventListener(MODES_CHANGED_EVENT, loadModes)
      unsub()
    }
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  async function handleSelect(mode: Mode) {
    setMenuOpen(false)
    if (mode.id === currentId) return
    const previous = currentId
    setCurrentId(mode.id)
    try {
      await window.raven.sessions.update(sessionId, { modeId: mode.id })
      if (mode.titleFromMode && mode.name.trim()) {
        await window.raven.sessions.updateTitle(sessionId, mode.name.trim())
      }
    } catch (err) {
      log.error('Failed to change session mode:', err)
      setCurrentId(previous)
    }
  }

  const current = modes.find((mode) => mode.id === currentId) ?? null

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setMenuOpen((open) => !open)}
        disabled={disabled}
        className="flex items-center gap-1.5 text-xs text-gray-500 rounded-full px-2 py-0.5 hover:bg-gray-100 transition-colors disabled:opacity-60 disabled:hover:bg-transparent disabled:cursor-default"
        title={
          disabled
            ? 'Mode cannot be changed while recording into this session'
            : 'Mode used for this session. Regenerate the summary to apply a new mode’s notes template.'
        }
      >
        <Layers size={12} className="text-gray-400 shrink-0" />
        <span className={current ? 'font-medium text-gray-700' : 'text-gray-400'}>
          {current ? current.name : 'No mode'}
        </span>
        {!disabled && <ChevronDown size={12} className="text-gray-400 shrink-0" />}
      </button>

      {menuOpen && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden z-30">
          <div className="py-1.5 max-h-72 overflow-y-auto">
            {modes.length === 0 ? (
              <p className="px-4 py-2.5 text-sm text-gray-400">No modes yet</p>
            ) : (
              modes.map((mode) => (
                <button
                  key={mode.id}
                  onClick={() => handleSelect(mode)}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-3 transition-colors"
                >
                  <span className="flex-1 truncate">{mode.name}</span>
                  {mode.id === currentId && <Check size={16} className="text-blue-500 shrink-0" />}
                </button>
              ))
            )}
          </div>
          <p className="border-t border-gray-200 px-4 py-2 text-xs text-gray-400">
            Regenerate the summary to apply the new mode’s notes template.
          </p>
        </div>
      )}
    </div>
  )
}
