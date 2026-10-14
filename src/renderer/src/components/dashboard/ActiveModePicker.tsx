/**
 * Active mode picker shown above the session list.
 * - Shows which mode the next session will use
 * - Switches the active mode in place; "Manage modes..." opens the editor
 * - A mode change applies to the next session, not one already recording
 */

import { useState, useEffect, useRef } from 'react'
import { Layers, ChevronDown, Check } from 'lucide-react'
import type { Mode } from '../../types/global'
import { ModeEditorModal } from './ModeEditorModal'
import { createLogger } from '../../lib/logger'
import { MODES_CHANGED_EVENT, activeModeLabel, selectableModes } from '../../lib/activeMode'

const log = createLogger('ActiveModePicker')

export function ActiveModePicker() {
  const [modes, setModes] = useState<Mode[]>([])
  const [active, setActive] = useState<Mode | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  async function loadModes() {
    try {
      const [allModes, activeMode] = await Promise.all([
        window.raven.modes.getAll(),
        window.raven.modes.getActive(),
      ])
      setModes(selectableModes(allModes))
      setActive(activeMode)
    } catch (err) {
      log.error('Failed to load modes:', err)
    }
  }

  useEffect(() => {
    loadModes()
    const handleChanged = () => loadModes()
    window.addEventListener(MODES_CHANGED_EVENT, handleChanged)
    const unsub = window.raven.modes.onListUpdated(handleChanged)
    return () => {
      window.removeEventListener(MODES_CHANGED_EVENT, handleChanged)
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
    if (mode.id === active?.id) return
    try {
      await window.raven.modes.setActive(mode.id)
      setActive(mode)
    } catch (err) {
      log.error('Failed to set active mode:', err)
    }
  }

  const activeId = active && !active.isBuiltin ? active.id : null

  return (
    <div className="flex items-center pt-4 pb-1">
      <div ref={containerRef} className="relative">
        <button
          onClick={() => setMenuOpen((open) => !open)}
          className="flex items-center gap-2 px-2.5 py-1.5 -ml-2.5 text-sm rounded-lg hover:bg-gray-100 transition-colors"
          title="Mode used for the next session"
        >
          <Layers size={14} className="text-gray-400 shrink-0" />
          <span className="text-gray-500">Mode:</span>
          <span className={activeId ? 'font-medium text-gray-900' : 'text-gray-400'}>
            {activeModeLabel(active)}
          </span>
          <ChevronDown size={14} className="text-gray-400 shrink-0" />
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
                    {mode.id === activeId && <Check size={16} className="text-blue-500 shrink-0" />}
                  </button>
                ))
              )}
            </div>
            <div className="border-t border-gray-200 py-1.5">
              <button
                onClick={() => {
                  setMenuOpen(false)
                  setEditorOpen(true)
                }}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
              >
                Manage modes...
              </button>
            </div>
          </div>
        )}
      </div>

      <ModeEditorModal isOpen={editorOpen} onClose={() => setEditorOpen(false)} />
    </div>
  )
}
