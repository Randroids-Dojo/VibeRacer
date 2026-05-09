/**
 * Storage layer for the daily-streak tracker. The pure logic (sanitize,
 * append, summarize) lives in `src/game/dailyStreak.ts`. This module owns
 * the localStorage round-trip plus a same-tab CustomEvent so the home-page
 * widget can refresh live without a polling timer.
 *
 * Single global key. The streak is intentionally cross-track (the player's
 * "I raced today" cadence applies to their whole VibeRacer life, not to a
 * single layout), which mirrors the cross-track shape of `viberacer.
 * achievements` and `viberacer.slugsVisited` already on disk.
 */

import { z } from 'zod'
import {
  appendDailyStreakDay,
  isDateKey,
  sanitizeDailyStreakDays,
  type DailyStreakDay,
} from '@/game/dailyStreak'
import { readJson, removeKey, writeJson } from './storage'

// localStorage key for the cross-track race-day history. Stored as a
// JSON-serialized array of `YYYY-MM-DD` strings.
export const DAILY_STREAK_STORAGE_KEY = 'viberacer.dailyStreak'

// CustomEvent fired on every successful write. Same-tab listeners use this
// to refresh; the browser's native `storage` event covers cross-tab.
export const DAILY_STREAK_EVENT = 'viberacer:daily-streak-changed'

const StoredDailyStreakSchema = z.object({
  days: z.array(z.string().min(1)),
})

/**
 * Read the stored race-day history. Returns a fresh array (sanitized,
 * sorted ascending, deduped) so callers can pass the value straight to
 * React state without aliasing a shared default. Returns an empty array on
 * SSR, a missing key, malformed JSON, a schema rejection, or a hostile /
 * quota-blocked storage.
 */
export function readDailyStreakDays(): DailyStreakDay[] {
  const parsed = readJson(DAILY_STREAK_STORAGE_KEY, StoredDailyStreakSchema)
  if (!parsed) return []
  return sanitizeDailyStreakDays(parsed.days)
}

/**
 * Append today's date key to the stored history. Returns the new sanitized
 * list (so the caller can derive a fresh summary in one shot). A duplicate
 * write is a no-op (returns the existing list without re-writing storage).
 * A malformed `dateKey` is a no-op for the same reason.
 *
 * Defensive against quota errors and disabled storage: writes silently swallow
 * exceptions so the lap-complete flow never crashes on a full disk.
 */
export function recordDailyStreakDay(dateKey: string): DailyStreakDay[] {
  if (!isDateKey(dateKey)) return readDailyStreakDays()
  const prev = readDailyStreakDays()
  const next = appendDailyStreakDay(prev, dateKey)
  if (next.length === prev.length) {
    // Duplicate: no write, no event. Returning the prior list keeps the
    // caller's `if (next !== prev)` style cheap.
    return prev
  }
  writeJson(DAILY_STREAK_STORAGE_KEY, { days: next })
  if (typeof window === 'undefined') return next
  try {
    window.dispatchEvent(
      new CustomEvent<DailyStreakDay[]>(DAILY_STREAK_EVENT, { detail: next }),
    )
  } catch {
    // CustomEvent is universal in modern browsers but defensive anyway.
  }
  return next
}

/**
 * Test-only helper. Wipes the stored history so a unit test can reset the
 * world between cases without leaking state. Real flows should never call
 * this; the streak widget intentionally has no "reset" button so a player
 * cannot accidentally undo their progress.
 */
export function _clearDailyStreakForTesting(): void {
  removeKey(DAILY_STREAK_STORAGE_KEY)
}
