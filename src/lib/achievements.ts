import { z } from 'zod'
import {
  ACHIEVEMENT_IDS,
  isAchievementId,
  type AchievementId,
  type AchievementMap,
} from '@/game/achievements'

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
  if (typeof window === 'undefined') return {}
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(ACHIEVEMENTS_STORAGE_KEY)
  } catch {
    // Hostile or quota-blocked storage. Treat as no unlocks yet so the pane
    // still renders rather than crashing.
    return {}
  }
  if (!raw) return {}
  try {
    const parsed = AchievementMapSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) return {}
    // Filter out any ids we no longer know about so a stale stored payload
    // (e.g. from a renamed achievement) does not poison the renderer.
    const out: AchievementMap = {}
    for (const [key, value] of Object.entries(parsed.data)) {
      if (!isAchievementId(key)) continue
      out[key as AchievementId] = value
    }
    return out
  } catch {
    return {}
  }
}

export function writeAchievements(map: AchievementMap): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      ACHIEVEMENTS_STORAGE_KEY,
      JSON.stringify(map),
    )
  } catch {
    // Achievements are a best-effort UX layer. Quota exhaustion should never
    // break the lap-complete flow.
    return
  }
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
  if (typeof window === 'undefined') return []
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(SLUG_VISITS_STORAGE_KEY)
  } catch {
    return []
  }
  if (!raw) return []
  try {
    const parsed = SlugListSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) return []
    // Dedupe defensively in case a hand-edited payload has duplicates.
    const seen = new Set<string>()
    for (const s of parsed.data) seen.add(s)
    return Array.from(seen)
  } catch {
    return []
  }
}

// Record a slug visit. Returns the new distinct count so the caller can pass
// it straight into the achievement evaluator without a second read.
export function recordSlugVisit(slug: string): number {
  const current = readVisitedSlugs()
  const seen = new Set<string>(current)
  seen.add(slug)
  if (seen.size === current.length) return current.length
  if (typeof window === 'undefined') return seen.size
  try {
    window.localStorage.setItem(
      SLUG_VISITS_STORAGE_KEY,
      JSON.stringify(Array.from(seen)),
    )
  } catch {
    // Quota or disabled storage. Best-effort: return the in-memory count so
    // the achievement evaluator still runs against the freshest known set.
  }
  return seen.size
}

// Test-only escape hatch that wipes both keys plus the in-memory event. Real
// flows should never call this; the achievements pane intentionally has no
// "reset" button so a player cannot accidentally undo their progress.
export function _clearAchievementsForTesting(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(ACHIEVEMENTS_STORAGE_KEY)
    window.localStorage.removeItem(SLUG_VISITS_STORAGE_KEY)
  } catch {
    // ignore
  }
}
