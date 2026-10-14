/**
 * Helpers for the active-mode picker above the session list.
 *
 * The mode editor and the picker live in different parts of the dashboard;
 * the editor fires MODES_CHANGED_EVENT on window so the picker can refetch
 * without lifting mode state into Dashboard.
 */

export const MODES_CHANGED_EVENT = 'raven:modes-changed'

export function notifyModesChanged(): void {
  window.dispatchEvent(new Event(MODES_CHANGED_EVENT))
}

/** Only user-created modes are selectable, same as the mode editor list. */
export function selectableModes<T extends { isBuiltin: boolean }>(modes: T[]): T[] {
  return modes.filter((mode) => !mode.isBuiltin)
}

/** The editor ignores a built-in active mode, so the picker does too. */
export function activeModeLabel(active: { name: string; isBuiltin: boolean } | null): string {
  return active && !active.isBuiltin ? active.name : 'None'
}
