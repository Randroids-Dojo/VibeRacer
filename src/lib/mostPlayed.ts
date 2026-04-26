/**
 * Helpers for surfacing the player's most-frequently-played tracks across
 * every (slug, versionHash) they have raced.
 *
 * Per-track engagement stats are stored under
 * `viberacer.stats.<slug>.<versionHash>` (see `src/lib/localBest.ts`'s
 * `readTrackStats` / `writeTrackStats`). This module scans `localStorage` for
 * those keys, validates each blob through the same redeclared schema the
 * `lifetimeStats` aggregator uses, and folds them into a per-slug ranking so
 * the home page can highlight the player's go-to tracks.
 *
 * Pure helpers live here so they can be unit tested without a DOM. The thin
 * `readMostPlayed()` wrapper is the only function that touches `window`; the
 * rest accept their inputs explicitly.
 *
 * Sibling modules:
 * - `myPbs.ts` powers the "Your personal bests" section (sorted by lap time).
 * - `lifetimeStats.ts` powers the "Your lifetime stats" tile grid (totals).
 * - This module powers a third surface, "Your most-played tracks", ranked by
 *   how much the player has actually raced each track. The three surfaces are
 *   intentionally distinct: PBs answer "where am I fastest", lifetime answers
 *   "how much have I raced overall", most-played answers "what do I keep
 *   coming back to".
 */
import { z } from 'zod'
import { SlugSchema, VersionHashSchema } from './schemas'

export const TRACK_STATS_PREFIX = 'viberacer.stats.'

// Default top-N for the home page. Capped low because the section is meant to
// surface the player's true go-to tracks at a glance, not show the full
// catalog (which is what the recent / favorites / authored sections cover).
export const DEFAULT_MOST_PLAYED_LIMIT = 5

// Mirrors `StoredTrackStatsSchema` in `lifetimeStats.ts` so this module owns
// its own contract. Keeping the schema redeclared (rather than imported) means
// a future change to the on-disk shape that breaks this aggregator will
// surface as a typecheck failure here, not silently corrupt the rankings.
const StoredTrackStatsSchema = z.object({
  lapCount: z.number().int().nonnegative().finite(),
  totalDriveMs: z.number().nonnegative().finite(),
  sessionCount: z.number().int().nonnegative().finite(),
  firstPlayedAt: z.number().positive().finite().nullable(),
  lastPlayedAt: z.number().positive().finite().nullable(),
})
export type StoredTrackStats = z.infer<typeof StoredTrackStatsSchema>

export interface MostPlayedEntry {
  slug: string
  // Total completed laps across every version of this slug. Drives the
  // ranking and the headline number on each row.
  totalLaps: number
  // Total time spent driving completed laps for this slug, in ms. Used as a
  // secondary tie-break (a player who has spent more wall-clock time on a
  // track ranks above one with the same lap count but quicker laps) and
  // surfaced in the row's sub-line so the player sees both axes.
  totalDriveMs: number
  // Total number of distinct race sessions across every version of this
  // slug. Surfaced in the row's sub-line so a returning player can tell at a
  // glance how many times they have come back to the track.
  totalSessions: number
  // Number of distinct versionHashes the player has stats for on this slug.
  // A player who has been forking the same track across many versions sees
  // the higher number here so the row reads "I keep coming back to this and
  // every version of it".
  versionCount: number
  // Epoch ms of the player's most recent `lastPlayedAt` across every version
  // of this slug, null when no version has a recorded lastPlayedAt yet. The
  // home page uses this for a small relative-time hint on each row.
  lastPlayedAt: number | null
}

/**
 * Parse a single localStorage key into its slug + versionHash parts. Returns
 * null when the key does not match the track-stats prefix, when the slug
 * fails `SlugSchema`, or when the version hash fails `VersionHashSchema`.
 *
 * Mirrors `parseTrackStatsKey` in `lifetimeStats.ts` so the home-page scans
 * stay shape-consistent across surfaces.
 */
export function parseTrackStatsKey(
  key: string,
): { slug: string; versionHash: string } | null {
  if (!key.startsWith(TRACK_STATS_PREFIX)) return null
  const rest = key.slice(TRACK_STATS_PREFIX.length)
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
 * Parse a stored value into a typed track-stats record. Returns null when the
 * value is null, malformed JSON, or fails the schema.
 */
export function parseStoredTrackStats(
  raw: string | null,
): StoredTrackStats | null {
  if (raw === null) return null
  try {
    const parsed = StoredTrackStatsSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/**
 * Build a ranked list of `MostPlayedEntry` rows from a flat `(key, value)`
 * enumeration of localStorage. Pure: takes the entries explicitly so tests
 * can drop a fixture in without a real `Storage` object. Skips malformed
 * keys and malformed values silently so a single corrupt entry never poisons
 * the rankings.
 *
 * Per-slug aggregation: a player who has raced two versions of the same slug
 * sees one row whose totals sum across both versions and whose `versionCount`
 * is 2. This matches the "what do I keep coming back to" question better than
 * a per-version row would, and keeps the section short enough to scan even
 * for a player with many forks.
 *
 * Sort: `totalLaps` descending (the headline), then `totalDriveMs`
 * descending (a player who has spent more time on a track with the same lap
 * count ranks higher), then `slug` ascending (stable order so the same input
 * always produces the same output). Slugs with zero laps (a session that
 * recorded a session count but never completed a lap) are dropped entirely
 * so the section never highlights a track the player has not actually run.
 *
 * `limit` clamps the output length. Pass `Infinity` (or any non-finite /
 * non-positive value) to return every entry; the default of
 * `DEFAULT_MOST_PLAYED_LIMIT` is what the home page uses.
 */
export function buildMostPlayed(
  entries: Iterable<[string, string]>,
  limit: number = DEFAULT_MOST_PLAYED_LIMIT,
): MostPlayedEntry[] {
  // Per-slug accumulator keyed by slug. We track the union of versionHashes
  // separately so a duplicate (key, value) pair (say a hand-edited fixture or
  // a future schema reorder that emits a duplicate row) does not double-count
  // the version.
  interface Accumulator {
    totalLaps: number
    totalDriveMs: number
    totalSessions: number
    versions: Set<string>
    lastPlayedAt: number | null
  }
  const grouped = new Map<string, Accumulator>()
  for (const [key, value] of entries) {
    const parsed = parseTrackStatsKey(key)
    if (!parsed) continue
    const stats = parseStoredTrackStats(value)
    if (!stats) continue
    let acc = grouped.get(parsed.slug)
    if (!acc) {
      acc = {
        totalLaps: 0,
        totalDriveMs: 0,
        totalSessions: 0,
        versions: new Set<string>(),
        lastPlayedAt: null,
      }
      grouped.set(parsed.slug, acc)
    }
    acc.totalLaps += stats.lapCount
    acc.totalDriveMs += stats.totalDriveMs
    acc.totalSessions += stats.sessionCount
    acc.versions.add(parsed.versionHash)
    if (
      stats.lastPlayedAt !== null &&
      Number.isFinite(stats.lastPlayedAt) &&
      stats.lastPlayedAt > 0 &&
      (acc.lastPlayedAt === null || stats.lastPlayedAt > acc.lastPlayedAt)
    ) {
      acc.lastPlayedAt = stats.lastPlayedAt
    }
  }
  const rows: MostPlayedEntry[] = []
  for (const [slug, acc] of grouped.entries()) {
    if (acc.totalLaps <= 0) continue
    rows.push({
      slug,
      totalLaps: acc.totalLaps,
      totalDriveMs: acc.totalDriveMs,
      totalSessions: acc.totalSessions,
      versionCount: acc.versions.size,
      lastPlayedAt: acc.lastPlayedAt,
    })
  }
  rows.sort((a, b) => {
    if (a.totalLaps !== b.totalLaps) return b.totalLaps - a.totalLaps
    if (a.totalDriveMs !== b.totalDriveMs) {
      return b.totalDriveMs - a.totalDriveMs
    }
    return a.slug.localeCompare(b.slug)
  })
  // Defensive clamp: a non-finite or non-positive limit returns every row
  // (caller asked for "everything"); a finite positive value caps the list
  // length.
  if (!Number.isFinite(limit) || limit <= 0) return rows
  return rows.slice(0, Math.floor(limit))
}

/**
 * Read the live localStorage and return the ranked most-played list. Returns
 * an empty array on SSR or when storage is unavailable so callers can call
 * this unconditionally and treat empty as "no laps yet".
 *
 * Defensive against a hostile or quota-blocked storage that throws on
 * `length`, `key`, or `getItem`: each call is wrapped in its own try/catch so
 * a single bad row never aborts the scan.
 */
export function readMostPlayed(
  limit: number = DEFAULT_MOST_PLAYED_LIMIT,
): MostPlayedEntry[] {
  if (typeof window === 'undefined') return []
  const ls = window.localStorage
  if (!ls) return []
  const entries: [string, string][] = []
  let length = 0
  try {
    length = ls.length
  } catch {
    return []
  }
  for (let i = 0; i < length; i++) {
    let key: string | null = null
    try {
      key = ls.key(i)
    } catch {
      continue
    }
    if (!key || !key.startsWith(TRACK_STATS_PREFIX)) continue
    let value: string | null = null
    try {
      value = ls.getItem(key)
    } catch {
      continue
    }
    if (value === null) continue
    entries.push([key, value])
  }
  return buildMostPlayed(entries, limit)
}
