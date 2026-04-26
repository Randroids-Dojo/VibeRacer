/**
 * Medal cabinet: the player's lifetime medal collection across every track
 * they have raced.
 *
 * The HUD computes a medal tier (`bronze` / `silver` / `gold` / `platinum`)
 * each lap by comparing the player's all-time PB against the route's
 * leaderboard #1 (see `src/game/medals.ts`). That tier is shown on the BEST
 * (ALL TIME) tile while racing, but historically there has been no surface
 * that aggregates "what is the best medal I have ever earned on each track,
 * and how many medals do I have in total". This module fills that gap by
 * persisting the highest medal tier the player has reached on each
 * `(slug, versionHash)` and aggregating those records into a single counts
 * snapshot that the home page can render at a glance.
 *
 * Pure helpers live here so they can be unit tested without a DOM. The thin
 * `readMedalCabinet()` wrapper is the only function that touches `window`;
 * the rest accept their inputs explicitly.
 */
import { z } from 'zod'
import { SlugSchema, VersionHashSchema } from './schemas'
import {
  MEDAL_TIERS,
  isMedalUpgrade,
  medalRank,
  type MedalTier,
} from '@/game/medals'

export const MEDAL_CABINET_PREFIX = 'viberacer.medal.'

// Stored payload per (slug, versionHash). Just the tier today; future
// additions (earnedAt, the lap time the medal was earned with, etc.) can
// extend this without breaking the read path.
const StoredMedalSchema = z.object({
  tier: z.enum(MEDAL_TIERS),
})
export type StoredMedal = z.infer<typeof StoredMedalSchema>

export interface MedalCounts {
  platinum: number
  gold: number
  silver: number
  bronze: number
  // Total distinct tracks (slug + versionHash combos) with at least one medal.
  // Matches platinum + gold + silver + bronze; provided as a convenience for
  // callers that want a single "tracks with a medal" headline.
  total: number
}

/**
 * An empty counts snapshot. Returned as a fresh object every call so callers
 * can mutate the result (or hand it to React state) without aliasing a shared
 * default.
 */
export function emptyMedalCounts(): MedalCounts {
  return {
    platinum: 0,
    gold: 0,
    silver: 0,
    bronze: 0,
    total: 0,
  }
}

/**
 * Compose the localStorage key for a single (slug, versionHash) medal
 * record. Mirrors the pattern in `localBest.ts` so a future migration can
 * iterate every viberacer.* prefix in one pass.
 */
export function medalCabinetKey(slug: string, versionHash: string): string {
  return `${MEDAL_CABINET_PREFIX}${slug}.${versionHash}`
}

/**
 * Parse a single localStorage key into its slug + versionHash parts. Returns
 * null when the key does not match the medal-cabinet prefix, when the slug
 * fails `SlugSchema`, or when the version hash fails `VersionHashSchema`.
 *
 * Mirrors `parseLocalBestKey` in `src/lib/myPbs.ts` and `parseTrackStatsKey`
 * in `src/lib/lifetimeStats.ts` so the home-page scans stay shape-consistent
 * across surfaces.
 */
export function parseMedalCabinetKey(
  key: string,
): { slug: string; versionHash: string } | null {
  if (!key.startsWith(MEDAL_CABINET_PREFIX)) return null
  const rest = key.slice(MEDAL_CABINET_PREFIX.length)
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
 * Parse a stored value into a typed medal record. Returns null when the
 * value is null, malformed JSON, or fails the schema. Defensive against a
 * hand-edited or quota-corrupt blob so a single bad row never poisons the
 * aggregate.
 */
export function parseStoredMedal(raw: string | null): StoredMedal | null {
  if (raw === null) return null
  try {
    const parsed = StoredMedalSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/**
 * Aggregate a flat `(key, value)` enumeration of localStorage into a single
 * `MedalCounts` snapshot. Pure: takes the entries explicitly so tests can
 * drop a fixture in without a real `Storage` object. Skips malformed keys
 * and malformed values silently so a single corrupt entry never poisons the
 * totals.
 *
 * Each track contributes exactly one medal to the counts (its highest tier),
 * so a player who has earned platinum on 3 tracks and gold on 5 sees
 * platinum=3, gold=5, total=8 (bronze and silver from the same track are
 * NOT double-counted; the stored value is already the best tier).
 */
export function buildMedalCounts(
  entries: Iterable<[string, string]>,
): MedalCounts {
  const counts = emptyMedalCounts()
  for (const [key, value] of entries) {
    const parsedKey = parseMedalCabinetKey(key)
    if (!parsedKey) continue
    const stored = parseStoredMedal(value)
    if (!stored) continue
    counts[stored.tier] += 1
    counts.total += 1
  }
  return counts
}

/**
 * Read the current medal record for a (slug, versionHash). Returns null on
 * SSR, when storage is unavailable, when the row is missing, or when the
 * payload is malformed.
 */
export function readMedalForTrack(
  slug: string,
  versionHash: string,
): MedalTier | null {
  if (typeof window === 'undefined') return null
  const ls = safeLocalStorage()
  if (!ls) return null
  let raw: string | null = null
  try {
    raw = ls.getItem(medalCabinetKey(slug, versionHash))
  } catch {
    return null
  }
  const stored = parseStoredMedal(raw)
  return stored ? stored.tier : null
}

/**
 * Persist a medal tier for a (slug, versionHash). Idempotent and monotonic:
 * a write only lands when the new tier strictly upgrades the existing tier
 * (e.g. silver overrides bronze, but a fresh bronze never demotes a stored
 * platinum). Returns true when the cabinet was updated, false when the call
 * was a no-op (no upgrade, missing window, storage failure, or null tier).
 *
 * The monotonic invariant matches the player's mental model: medals
 * represent a personal best record for each track, and the displayed counts
 * should never go down even if the player has a slow lap that no longer
 * qualifies for their previously-earned tier (the stored PB and the medal
 * cabinet are decoupled by design).
 */
export function writeMedalForTrack(
  slug: string,
  versionHash: string,
  tier: MedalTier | null,
): boolean {
  if (tier === null) return false
  if (typeof window === 'undefined') return false
  const ls = safeLocalStorage()
  if (!ls) return false
  const prev = readMedalForTrack(slug, versionHash)
  if (!isMedalUpgrade(prev, tier)) return false
  try {
    ls.setItem(
      medalCabinetKey(slug, versionHash),
      JSON.stringify({ tier } satisfies StoredMedal),
    )
    return true
  } catch {
    return false
  }
}

/**
 * Read the live localStorage and aggregate the medal counts. Returns the
 * empty counts on SSR or when storage is unavailable so callers can call
 * this unconditionally and treat zero-medals as "no medals yet".
 *
 * Defensive against a hostile or quota-blocked storage that throws on
 * `length`, `key`, or `getItem`: each call is wrapped in its own try/catch
 * so a single bad row never aborts the scan.
 */
export function readMedalCabinet(): MedalCounts {
  if (typeof window === 'undefined') return emptyMedalCounts()
  const ls = safeLocalStorage()
  if (!ls) return emptyMedalCounts()
  const entries: [string, string][] = []
  let length = 0
  try {
    length = ls.length
  } catch {
    return emptyMedalCounts()
  }
  for (let i = 0; i < length; i++) {
    let key: string | null = null
    try {
      key = ls.key(i)
    } catch {
      continue
    }
    if (!key || !key.startsWith(MEDAL_CABINET_PREFIX)) continue
    let value: string | null = null
    try {
      value = ls.getItem(key)
    } catch {
      continue
    }
    if (value === null) continue
    entries.push([key, value])
  }
  return buildMedalCounts(entries)
}

function safeLocalStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/**
 * Re-export the medal-rank helper so callers that already import from this
 * module do not need a second import path. Useful for the home page card
 * which sorts by tier rank when listing tracks.
 */
export { medalRank }
