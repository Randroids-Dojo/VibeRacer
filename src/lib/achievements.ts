import { z } from 'zod'
import {
  ACHIEVEMENT_IDS,
  isAchievementId,
  type AchievementId,
  type AchievementMap,
} from '@/game/achievements'
import { readJson, removeKey, writeJson } from './storage'

// Cross-track lifetime achievements live under a single localStorage key.
// Most achievements are about the player's overall journey, not a single
// layout, so a global key keeps the unlock flow consistent across tracks.
const ACHIEVEMENTS_STORAGE_KEY = 'viberacer.achievements'

// Distinct slugs the player has crossed the start line on. Sourced when the
// player completes their first lap on a slug. Persists across sessions so the
// Variety Pack achievement can fire on the fifth distinct slug even when the
// earlier four were visited on different days.
const SLUG_VISITS_STORAGE_KEY = 'viberacer.slugsVisited'

// Custom event broadcast on every storage write so the pause-menu pane can
// refresh live without re-mounting. Listeners on the same tab use this; the
// browser's native `storage` event covers the cross-tab case.
export const ACHIEVEMENTS_EVENT = 'viberacer:achievements-changed'

const AchievementUnlockSchema = z.object({
  unlockedAt: z.number().positive().finite(),
  slug: z.string().min(1),
  versionHash: z.string().min(1),
})

const AchievementMapSchema = z.record(z.string(), AchievementUnlockSchema)

export function readAchievements(): AchievementMap {
  const parsed = readJson(ACHIEVEMENTS_STORAGE_KEY, AchievementMapSchema)
  if (!parsed) return {}
  // Filter out any ids we no longer know about so a stale stored payload
  // (e.g. from a renamed achievement) does not poison the renderer.
  const out: AchievementMap = {}
  for (const [key, value] of Object.entries(parsed)) {
    if (!isAchievementId(key)) continue
    out[key as AchievementId] = value
  }
  return out
}

export function writeAchievements(map: AchievementMap): void {
  writeJson(ACHIEVEMENTS_STORAGE_KEY, map)
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(
      new CustomEvent<AchievementMap>(ACHIEVEMENTS_EVENT, { detail: map }),
    )
  } catch {
    // CustomEvent is universal in modern browsers but defensive anyway.
  }
}

const SlugListSchema = z.array(z.string().min(1))

// Set of distinct slugs the player has touched. Returned as a fresh array so
// callers can mutate freely without affecting future reads.
export function readVisitedSlugs(): string[] {
  const parsed = readJson(SLUG_VISITS_STORAGE_KEY, SlugListSchema)
  if (!parsed) return []
  // Dedupe defensively in case a hand-edited payload has duplicates.
  const seen = new Set<string>(parsed)
  return Array.from(seen)
}

// Record a slug visit. Returns the new distinct count so the caller can pass
// it straight into the achievement evaluator without a second read.
export function recordSlugVisit(slug: string): number {
  const current = readVisitedSlugs()
  const seen = new Set<string>(current)
  seen.add(slug)
  if (seen.size === current.length) return current.length
  writeJson(SLUG_VISITS_STORAGE_KEY, Array.from(seen))
  return seen.size
}

// Test-only escape hatch that wipes both keys plus the in-memory event. Real
// flows should never call this; the achievements pane intentionally has no
// "reset" button so a player cannot accidentally undo their progress.
export function _clearAchievementsForTesting(): void {
  removeKey(ACHIEVEMENTS_STORAGE_KEY)
  removeKey(SLUG_VISITS_STORAGE_KEY)
}
