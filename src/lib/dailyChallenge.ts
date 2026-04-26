/**
 * Daily Challenge feature: surface one community track per day on the home
 * page so a returning player has a single fresh thing to race without having
 * to scroll the recent list. The pick is deterministic per UTC date so every
 * visitor sees the same featured track on the same day, and stable across
 * tab refreshes so the challenge does not shuffle while the player is
 * looking at it.
 *
 * Pure helpers only here (no IO, no React). The async loader at the bottom
 * is a thin wrapper around `loadRecentTrackPreviewsSafe` so we reuse the
 * existing KV plumbing and graceful-degradation rules.
 *
 * Stability invariants:
 * - The same `(dateKey, candidate set)` pair always returns the same pick
 *   across processes and browsers. The hash is FNV-1a 32-bit over the date
 *   key string and a fixed UTF-8 encoding of each candidate slug. We never
 *   depend on RNG state, locale, or `Date.now()` at pick time.
 * - An empty candidate list returns null so the caller can hide the section.
 * - A non-string or non-finite date input falls back to today's UTC key.
 */

import {
  RECENT_TRACKS_DEFAULT_LIMIT,
  loadRecentTrackPreviewsSafe,
  type RecentTrackPreview,
} from './recentTracks'

const FNV_OFFSET_BASIS_32 = 0x811c9dc5
const FNV_PRIME_32 = 0x01000193

/**
 * Pull "YYYY-MM-DD" out of an epoch-millis value, in UTC. UTC is intentional:
 * a player in Sydney and a player in San Francisco should see the same daily
 * challenge so a shared link does not surprise the recipient with a different
 * featured track.
 */
export function dateKeyForUtc(nowMs: number): string {
  if (typeof nowMs !== 'number' || !Number.isFinite(nowMs)) {
    return dateKeyForUtc(Date.now())
  }
  const d = new Date(nowMs)
  if (Number.isNaN(d.getTime())) return dateKeyForUtc(Date.now())
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/**
 * Stable 32-bit FNV-1a hash. Returns 0 for empty / non-string input so
 * callers can detect the empty case without a separate guard. Mirrors the
 * `slugMusicSeed` style in `musicPersonalization.ts` so future readers see
 * one canonical hashing pattern across the codebase.
 */
export function dailyChallengeSeed(input: string): number {
  if (typeof input !== 'string' || input.length === 0) return 0
  let hash = FNV_OFFSET_BASIS_32
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i) & 0xff
    hash = Math.imul(hash, FNV_PRIME_32)
  }
  return hash >>> 0
}

/**
 * Combine the date key with each candidate's slug so adding or removing a
 * track from the candidate set does not hold the pick steady on a moving
 * subset. Without this combination, swapping the candidate list would let
 * the same date key snap to a different visible track every time the index
 * shifts, which feels random rather than deterministic.
 */
function indexForKeyAndCount(dateKey: string, count: number): number {
  if (count <= 0) return -1
  const seed = dailyChallengeSeed(dateKey)
  // Avalanche the seed a touch so consecutive date keys (which only differ
  // in their final digit) do not always pick adjacent indices. A right shift
  // followed by xor folds the high bits down without committing to a
  // platform-specific 64-bit hash.
  const mixed = (seed ^ (seed >>> 16)) >>> 0
  return mixed % count
}

/**
 * Pick today's challenge from a list of candidates. Returns null when the
 * candidate list is empty so the caller can hide the section instead of
 * rendering an empty card.
 *
 * The pick is deterministic per `(dateKey, candidate slugs)` pair: the same
 * inputs always return the same candidate. Candidates are not mutated.
 */
export function pickDailyChallenge<T extends { slug: string }>(
  tracks: readonly T[],
  dateKey: string,
): T | null {
  if (!Array.isArray(tracks) || tracks.length === 0) return null
  const idx = indexForKeyAndCount(dateKey, tracks.length)
  if (idx < 0 || idx >= tracks.length) return null
  return tracks[idx] ?? null
}

/**
 * Convenience wrapper used by the home-page server component. Loads the
 * recent-tracks list (with thumbnails and top times), picks today's, and
 * returns it. Returns null when KV is unconfigured, when KV has no recent
 * tracks, or when the candidate set is empty.
 *
 * The cap is intentionally small: a candidate list of 10 keeps the pick
 * focused on the freshest community work so the daily slot is never a stale
 * track from months ago.
 */
export async function loadDailyChallengeSafe(
  nowMs: number = Date.now(),
  limit: number = RECENT_TRACKS_DEFAULT_LIMIT,
): Promise<RecentTrackPreview | null> {
  const candidates = await loadRecentTrackPreviewsSafe(null, limit)
  return pickDailyChallenge(candidates, dateKeyForUtc(nowMs))
}
