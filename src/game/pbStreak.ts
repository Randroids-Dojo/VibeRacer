/**
 * PB streak tracking. Pure helpers so the streak math stays testable without
 * React, the DOM, or localStorage. The Game session feeds every completed
 * lap's PB outcome through these helpers and mirrors the result into the HUD
 * (live chip when streak >= 2) plus localStorage (best-ever streak per slug +
 * version for the pause-menu Stats pane and the next-session goal).
 *
 * The streak counts CONSECUTIVE all-time PB laps on the current (slug,
 * versionHash). Each non-PB lap resets it to zero. Restart and Restart Lap
 * also reset the live counter (the all-time best is preserved). A streak of
 * one is intentionally hidden from the HUD because every first-PB-after-load
 * would otherwise pop a chip; the chip only earns its real estate from the
 * second consecutive PB onward.
 */

/**
 * Minimum streak value that should surface in the HUD. A value of 1 (the
 * very first PB after a fresh load) reads as a single PB and is already
 * celebrated by the existing toast / fanfare / confetti, so the streak chip
 * stays hidden until a player chains two or more PBs together.
 */
export const STREAK_HUD_MIN = 2

/**
 * Increment a running streak by one. Pure: returns a fresh number rather
 * than mutating. Defensive: a non-finite or negative input collapses to one
 * so a corrupt prior value cannot poison the next streak.
 */
export function incrementStreak(prev: number): number {
  if (!Number.isFinite(prev) || prev < 0) return 1
  return Math.floor(prev) + 1
}

/**
 * Reset the streak counter to zero. Exposed as a named helper so the call
 * sites read intentionally instead of inline `0` literals.
 */
export function resetStreak(): number {
  return 0
}

/**
 * Returns true when the most recent streak beats the prior best for this
 * slug + version. A null prior means "no best on file yet"; any positive
 * current streak counts as a new best. Defensive: a non-finite current value
 * never beats the best.
 */
export function isStreakBest(current: number, prevBest: number | null): boolean {
  if (!Number.isFinite(current) || current <= 0) return false
  if (prevBest === null) return true
  if (!Number.isFinite(prevBest)) return true
  return current > prevBest
}

/**
 * Format the streak chip label shown in the HUD. Returns null when the
 * streak is below the HUD threshold so the caller can collapse the slot
 * cleanly. The label is plain text so emoji-free fonts and screen readers
 * surface the same meaning.
 */
export function formatStreakLabel(streak: number): string | null {
  if (!Number.isFinite(streak) || streak < STREAK_HUD_MIN) return null
  return `PB STREAK x${Math.floor(streak)}`
}

/**
 * Sanitize a streak value loaded from storage. Drops non-finite, negative,
 * or fractional values so a hand-edited or corrupt payload can never feed
 * the HUD a bogus number. Returns null for any rejected input so callers can
 * branch on "no record" cleanly.
 */
export function sanitizeStreak(value: unknown): number | null {
  if (typeof value !== 'number') return null
  if (!Number.isFinite(value)) return null
  if (value <= 0) return null
  return Math.floor(value)
}
