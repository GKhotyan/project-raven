import { describe, expect, it, vi } from 'vitest'
import { MODES_CHANGED_EVENT, activeModeLabel, notifyModesChanged, selectableModes } from '../activeMode'

const mode = (id: string, name: string, isBuiltin = false) => ({ id, name, isBuiltin })

describe('selectableModes', () => {
  it('keeps only user modes, in their stored order', () => {
    const modes = [mode('b', 'Built-in', true), mode('1', 'HRM Daily'), mode('2', 'Sales')]
    expect(selectableModes(modes).map((m) => m.id)).toEqual(['1', '2'])
  })
})

describe('activeModeLabel', () => {
  it('shows the active user mode name', () => {
    expect(activeModeLabel(mode('1', 'HRM Daily'))).toBe('HRM Daily')
  })

  it('treats no mode or a built-in mode as none, matching the mode editor', () => {
    expect(activeModeLabel(null)).toBe('None')
    expect(activeModeLabel(mode('b', 'Built-in', true))).toBe('None')
  })
})

describe('notifyModesChanged', () => {
  it('dispatches the modes-changed event on window', () => {
    const dispatchEvent = vi.fn()
    vi.stubGlobal('window', { dispatchEvent })
    notifyModesChanged()
    expect(dispatchEvent).toHaveBeenCalledTimes(1)
    expect((dispatchEvent.mock.calls[0][0] as Event).type).toBe(MODES_CHANGED_EVENT)
    vi.unstubAllGlobals()
  })
})
