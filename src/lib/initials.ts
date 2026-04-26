import { InitialsSchema } from './schemas'

// User-facing leaderboard tag. Three uppercase letters, persisted in
// localStorage so the choice follows the player across sessions and slugs
// without server state. Source of truth for both the InitialsPrompt
// (first-visit prompt) and the SettingsPane (mid-session edits).

export const INITIALS_STORAGE_KEY = 'viberacer.initials'

// Custom event used to broadcast in-tab initials changes between subscribers
// (Settings pane updates -> HUD reflects new value live). The browser's
// `storage` event covers cross-tab sync but does not fire in the originating
// tab, so we layer this custom event on top.
export const INITIALS_EVENT = 'viberacer:initials-changed'

export function readStoredInitials(): string | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage?.getItem(INITIALS_STORAGE_KEY)
  if (!raw) return null
  const parsed = InitialsSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

export function writeStoredInitials(value: string): void {
  if (typeof window === 'undefined') return
  window.localStorage?.setItem(INITIALS_STORAGE_KEY, value)
  if (typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(
      new CustomEvent<string>(INITIALS_EVENT, { detail: value }),
    )
  }
}
