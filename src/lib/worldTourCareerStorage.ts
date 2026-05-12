/**
 * Storage layer for the World Tour career save. The pure shape, defaults,
 * and migration helpers live in `src/game/worldTourCareer.ts`. This module
 * owns the localStorage round-trip plus a same-tab CustomEvent so any UI
 * that subscribes (home-page tile, garage panel, tour-selection screen)
 * can refresh live without a polling timer.
 *
 * Single global key. The career is intentionally not per-track and not
 * per-slug; it tracks the player's progression through the championship.
 * The optional KV mirror under `worldTour:career:{initials}` (Phase 6e in
 * the World Tour plan) is opt-in and not handled here.
 */

import { z } from 'zod'
import {
  cloneCareer,
  defaultCareer,
  migrateCareer,
  type WorldTourCareer,
} from '@/game/worldTourCareer'

// localStorage key for the career save. The "worldTour" namespace lets us
// version migrations cleanly (a v2 key could ship alongside v1 if needed).
export const WORLD_TOUR_CAREER_STORAGE_KEY = 'viberacer.worldTour.career'

// CustomEvent fired on every successful write. Same-tab listeners use this
// to refresh; the browser's native `storage` event covers cross-tab.
export const WORLD_TOUR_CAREER_EVENT = 'viberacer:world-tour-career-changed'

// The stored payload is intentionally permissive at the zod layer; the
// real validation runs through `migrateCareer`, which knows how to coerce
// every legal shape into the canonical save. The schema check here only
// rejects payloads that are not even objects.
const StoredCareerSchema = z.object({}).passthrough()

export type CareerWriteResult =
  | { ok: true; career: WorldTourCareer }
  | { ok: false; reason: 'ssr' | 'quota' | 'validation' }

/**
 * Read the stored career. Returns a sanitized save through `migrateCareer`,
 * defaulting to `defaultCareer()` on SSR, missing key, malformed JSON, or
 * a hostile storage. Always returns a fresh object so the caller can route
 * it straight into React state without aliasing a shared default.
 */
export function readCareer(): WorldTourCareer {
  if (typeof window === 'undefined') return defaultCareer()
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(WORLD_TOUR_CAREER_STORAGE_KEY)
  } catch {
    return defaultCareer()
  }
  if (!raw) return defaultCareer()
  try {
    const parsed = StoredCareerSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) return defaultCareer()
    return migrateCareer(parsed.data)
  } catch {
    return defaultCareer()
  }
}

/**
 * Persist a career save. Validates by running the input through
 * `migrateCareer`, persists the cleaned result, and dispatches the
 * same-tab CustomEvent for live UI updates. Returns the written value on
 * success or a typed reason on failure.
 *
 * The returned career is a fresh clone of the validated value so callers
 * can route it straight back into React state without aliasing the input.
 */
export function writeCareer(next: WorldTourCareer): CareerWriteResult {
  if (typeof window === 'undefined') return { ok: false, reason: 'ssr' }
  const cleaned = migrateCareer(next)
  let serialized: string
  try {
    serialized = JSON.stringify(cleaned)
  } catch {
    return { ok: false, reason: 'validation' }
  }
  try {
    window.localStorage.setItem(WORLD_TOUR_CAREER_STORAGE_KEY, serialized)
  } catch {
    return { ok: false, reason: 'quota' }
  }
  const out = cloneCareer(cleaned)
  try {
    window.dispatchEvent(
      new CustomEvent<WorldTourCareer>(WORLD_TOUR_CAREER_EVENT, {
        detail: out,
      }),
    )
  } catch {
    // CustomEvent is universal in modern browsers but the dispatch is
    // wrapped defensively so a hostile host environment cannot break the
    // write path.
  }
  return { ok: true, career: out }
}

/**
 * Test-only helper. Wipes the stored career so a unit test can reset the
 * world between cases. Real flows should never call this; the career
 * intentionally has no built-in reset button so a player cannot
 * accidentally undo their progression.
 */
export function _clearCareerForTesting(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(WORLD_TOUR_CAREER_STORAGE_KEY)
  } catch {
    // ignore
  }
}
