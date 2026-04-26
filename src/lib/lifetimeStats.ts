/**
 * Helpers for surfacing the player's lifetime engagement totals across every
 * track they have raced.
 *
 * Per-track engagement stats are stored under
 * `viberacer.stats.<slug>.<versionHash>` (see `src/lib/localBest.ts`'s
 * `readTrackStats` / `writeTrackStats`). This module scans `localStorage` for
 * those keys, parses each blob through the same schema the per-track Stats
 * pane uses, and folds them into a single aggregate so the home page can show
 * the player's lifetime totals at a glance without round-tripping to KV.
 *
 * Pure helpers live here so they can be unit tested without a DOM. The thin
 * `readLifetimeStats()` wrapper is the only function that touches `window`;
 * the rest accept their inputs explicitly.
 */
import { z } from 'zod'
import { SlugSchema, VersionHashSchema } from './schemas'

export const TRACK_STATS_PREFIX = 'viberacer.stats.'

// Mirrors the on-disk shape from `src/lib/localBest.ts::TrackStatsSchema`.
// Intentionally redeclared here rather than imported so this module owns its
// own contract and can be reused without coupling to `localBest.ts`. The
// runtime check below validates the redeclaration is structurally identical.
const StoredTrackStatsSchema = z.object({
  lapCount: z.number().int().nonnegative().finite(),
  totalDriveMs: z.number().nonnegative().finite(),
  sessionCount: z.number().int().nonnegative().finite(),
  firstPlayedAt: z.number().positive().finite().nullable(),
  lastPlayedAt: z.number().positive().finite().nullable(),
})
export type StoredTrackStats = z.infer<typeof StoredTrackStatsSchema>

export interface LifetimeStats {
  // Total completed laps across every (slug, versionHash) the player has on
  // disk. Sum of every parsed `lapCount` value.
  totalLaps: number
  // Total time spent driving completed laps, in ms. Sum of every parsed
  // `totalDriveMs` value. Does NOT count time spent in pause menus or the
  // editor; this is "wheels on asphalt" time.
  totalDriveMs: number
  // Total number of distinct race sessions across every track. Sum of every
  // parsed `sessionCount` value.
  totalSessions: number
  // Distinct slugs the player has completed at least one session on. A slug
  // that the player has raced across multiple versions counts once. Drives
  // the "tracks raced" tile so the player sees variety, not just volume.
  trackCount: number
  // Distinct (slug, versionHash) pairs the player has any stats for. Drives
  // the "track versions raced" sub-line so a player who has been forking
  // sees the higher number alongside the slug count.
  versionCount: number
  // Epoch ms of the player's earliest `firstPlayedAt` across every track,
  // null when no track has a recorded firstPlayedAt yet.
  firstPlayedAt: number | null
  // Epoch ms of the player's most recent `lastPlayedAt` across every track,
  // null when no track has a recorded lastPlayedAt yet.
  lastPlayedAt: number | null
}

/**
 * An empty lifetime-stats snapshot. Returned as a fresh object every call so
 * callers can mutate the result (or hand it to React state) without aliasing
 * a shared default.
 */
export function emptyLifetimeStats(): LifetimeStats {
  return {
    totalLaps: 0,
    totalDriveMs: 0,
    totalSessions: 0,
    trackCount: 0,
    versionCount: 0,
    firstPlayedAt: null,
    lastPlayedAt: null,
  }
}

/**
 * Parse a single localStorage key into its slug + versionHash parts. Returns
 * null when the key does not match the track-stats prefix, when the slug
 * fails `SlugSchema`, or when the version hash fails `VersionHashSchema`.
 *
 * Mirrors `parseLocalBestKey` in `src/lib/myPbs.ts` so the home-page scans
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
 * value is null, malformed JSON, or fails the schema. Mirrors the validation
 * in `readTrackStats` so a hand-edited or quota-corrupt blob never poisons
 * the aggregate.
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
 * Build a `LifetimeStats` snapshot from a flat `(key, value)` enumeration of
 * localStorage. Pure: takes the entries explicitly so tests can drop a
 * fixture in without a real `Storage` object. Skips malformed keys and
 * malformed values silently so a single corrupt entry never poisons the
 * totals.
 *
 * Slug and version counts dedupe across multiple stats entries on the same
 * slug (the same player racing two versions of the same slug should bump the
 * version count by two but the slug count by one).
 */
export function buildLifetimeStats(
  entries: Iterable<[string, string]>,
): LifetimeStats {
  const slugs = new Set<string>()
  const versions = new Set<string>()
  let totalLaps = 0
  let totalDriveMs = 0
  let totalSessions = 0
  let firstPlayedAt: number | null = null
  let lastPlayedAt: number | null = null
  for (const [key, value] of entries) {
    const parsed = parseTrackStatsKey(key)
    if (!parsed) continue
    const stats = parseStoredTrackStats(value)
    if (!stats) continue
    slugs.add(parsed.slug)
    versions.add(`${parsed.slug}.${parsed.versionHash}`)
    totalLaps += stats.lapCount
    totalDriveMs += stats.totalDriveMs
    totalSessions += stats.sessionCount
    if (
      stats.firstPlayedAt !== null &&
      Number.isFinite(stats.firstPlayedAt) &&
      stats.firstPlayedAt > 0 &&
      (firstPlayedAt === null || stats.firstPlayedAt < firstPlayedAt)
    ) {
      firstPlayedAt = stats.firstPlayedAt
    }
    if (
      stats.lastPlayedAt !== null &&
      Number.isFinite(stats.lastPlayedAt) &&
      stats.lastPlayedAt > 0 &&
      (lastPlayedAt === null || stats.lastPlayedAt > lastPlayedAt)
    ) {
      lastPlayedAt = stats.lastPlayedAt
    }
  }
  return {
    totalLaps,
    totalDriveMs,
    totalSessions,
    trackCount: slugs.size,
    versionCount: versions.size,
    firstPlayedAt,
    lastPlayedAt,
  }
}

/**
 * Read the live localStorage and return the aggregated lifetime totals.
 * Returns the empty snapshot on SSR or when storage is unavailable so callers
 * can call this unconditionally and treat zero-laps as "no laps yet".
 *
 * Defensive against a hostile or quota-blocked storage that throws on
 * `length`, `key`, or `getItem`: each call is wrapped in its own try/catch so
 * a single bad row never aborts the scan.
 */
export function readLifetimeStats(): LifetimeStats {
  if (typeof window === 'undefined') return emptyLifetimeStats()
  const ls = window.localStorage
  if (!ls) return emptyLifetimeStats()
  const entries: [string, string][] = []
  let length = 0
  try {
    length = ls.length
  } catch {
    return emptyLifetimeStats()
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
  return buildLifetimeStats(entries)
}
