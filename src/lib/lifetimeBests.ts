/**
 * Helpers for surfacing the player's lifetime best-yet metrics across every
 * track they have raced. Powers the AchievementsPane progress bars so each
 * locked milestone can read "your best is X / target Y".
 *
 * Per-track records are stored under namespaced localStorage keys:
 * - `viberacer.best.<slug>.<versionHash>`         best lap time (ms)
 * - `viberacer.driftBest.<slug>.<versionHash>`    best drift score
 * - `viberacer.pbStreakBest.<slug>.<versionHash>` best PB streak
 *
 * This module scans localStorage for those keys and folds them into a single
 * lifetime aggregate. Pure helpers live here so they can be unit tested
 * without a DOM. The thin `readLifetimeBests()` wrapper is the only function
 * that touches `window`; the rest accept their inputs explicitly.
 */
import { SlugSchema, VersionHashSchema } from './schemas'

export const LIFETIME_BESTS_PREFIXES = {
  lap: 'viberacer.best.',
  drift: 'viberacer.driftBest.',
  pbStreak: 'viberacer.pbStreakBest.',
} as const

export interface LifetimeBests {
  // Fastest lap across every (slug, version) the player has on disk, in ms.
  // null when no lap has been recorded yet.
  fastestLapMs: number | null
  // Highest drift score across every (slug, version), in points. null when
  // no drift score has been recorded yet.
  bestDriftScore: number | null
  // Highest PB streak across every (slug, version). null when no streak has
  // been recorded yet.
  bestPbStreak: number | null
}

export function emptyLifetimeBests(): LifetimeBests {
  return {
    fastestLapMs: null,
    bestDriftScore: null,
    bestPbStreak: null,
  }
}

/**
 * Parse a localStorage key of the form `<prefix><slug>.<versionHash>` into
 * its slug + versionHash parts. Returns null when the key does not match the
 * supplied prefix, when the slug fails `SlugSchema`, or when the version
 * hash fails `VersionHashSchema`.
 *
 * Mirrors `parseLocalBestKey` in `src/lib/myPbs.ts` but takes the prefix as
 * an argument so all three lifetime-best families share one parser.
 */
export function parseNamespacedKey(
  key: string,
  prefix: string,
): { slug: string; versionHash: string } | null {
  if (!key.startsWith(prefix)) return null
  const rest = key.slice(prefix.length)
  const dot = rest.lastIndexOf('.')
  if (dot <= 0 || dot >= rest.length - 1) return null
  const slug = rest.slice(0, dot)
  const versionHash = rest.slice(dot + 1)
  const slugParsed = SlugSchema.safeParse(slug)
  if (!slugParsed.success) return null
  const hashParsed = VersionHashSchema.safeParse(versionHash)
  if (!hashParsed.success) return null
  return { slug: slugParsed.data, versionHash: hashParsed.data }
}

/**
 * Parse a stored numeric value into a positive number. Returns null when the
 * raw value is null, fails to parse as a finite positive number, or exceeds
 * the supplied sanity cap. Defensive: a hand-edited blob never poisons the
 * lifetime aggregate.
 */
export function parseStoredPositiveNumber(
  raw: string | null,
  capInclusive: number,
): number | null {
  if (raw === null) return null
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return null
  if (n > capInclusive) return null
  return n
}

/**
 * Build a `LifetimeBests` snapshot from a flat `(key, value)` enumeration of
 * localStorage. Pure: takes the entries explicitly so tests can drop a
 * fixture in without a real `Storage` object. Skips malformed keys and
 * malformed values silently so a single corrupt entry never poisons the
 * aggregate.
 *
 * Bests use min for lap times (lower = better) and max for drift / streak
 * (higher = better). Every comparison is gated on `Number.isFinite` so a
 * hostile input cannot poison the running min / max.
 */
export function buildLifetimeBests(
  entries: Iterable<[string, string]>,
): LifetimeBests {
  let fastestLapMs: number | null = null
  let bestDriftScore: number | null = null
  let bestPbStreak: number | null = null
  for (const [key, value] of entries) {
    if (parseNamespacedKey(key, LIFETIME_BESTS_PREFIXES.lap)) {
      // Lap times are capped at one hour; same shape as `parseStoredLapTime`
      // in `src/lib/myPbs.ts`.
      const ms = parseStoredPositiveNumber(value, 60 * 60 * 1000)
      if (ms !== null) {
        const rounded = Math.round(ms)
        if (fastestLapMs === null || rounded < fastestLapMs) {
          fastestLapMs = rounded
        }
      }
      continue
    }
    if (parseNamespacedKey(key, LIFETIME_BESTS_PREFIXES.drift)) {
      // Drift scores are uncapped in practice, but a 10M cap guards against
      // a pathological hand-edited blob without rejecting any legitimate run.
      const score = parseStoredPositiveNumber(value, 10_000_000)
      if (score !== null) {
        const rounded = Math.round(score)
        if (bestDriftScore === null || rounded > bestDriftScore) {
          bestDriftScore = rounded
        }
      }
      continue
    }
    if (parseNamespacedKey(key, LIFETIME_BESTS_PREFIXES.pbStreak)) {
      // PB streaks are stored as integers; cap at 10000 to reject obviously
      // bogus values without rejecting any plausible session.
      const streak = parseStoredPositiveNumber(value, 10_000)
      if (streak !== null) {
        const rounded = Math.floor(streak)
        if (bestPbStreak === null || rounded > bestPbStreak) {
          bestPbStreak = rounded
        }
      }
      continue
    }
  }
  return { fastestLapMs, bestDriftScore, bestPbStreak }
}

/**
 * Read the live localStorage and return the aggregated lifetime bests. SSR
 * and quota-blocked storage return the empty snapshot so callers can call
 * unconditionally.
 */
export function readLifetimeBests(): LifetimeBests {
  if (typeof window === 'undefined') return emptyLifetimeBests()
  const ls = window.localStorage
  if (!ls) return emptyLifetimeBests()
  const entries: [string, string][] = []
  let length = 0
  try {
    length = ls.length
  } catch {
    return emptyLifetimeBests()
  }
  for (let i = 0; i < length; i++) {
    let key: string | null = null
    try {
      key = ls.key(i)
    } catch {
      continue
    }
    if (!key) continue
    // Only collect keys that match one of the three known prefixes so the
    // aggregate scan ignores unrelated entries.
    if (
      !key.startsWith(LIFETIME_BESTS_PREFIXES.lap) &&
      !key.startsWith(LIFETIME_BESTS_PREFIXES.drift) &&
      !key.startsWith(LIFETIME_BESTS_PREFIXES.pbStreak)
    ) {
      continue
    }
    let value: string | null = null
    try {
      value = ls.getItem(key)
    } catch {
      continue
    }
    if (value === null) continue
    entries.push([key, value])
  }
  return buildLifetimeBests(entries)
}
