/**
 * Helpers for surfacing the player's local personal-best lap times across
 * every track they have raced.
 *
 * Local PBs are stored under `viberacer.best.<slug>.<versionHash>` (see
 * `src/lib/localBest.ts`). This module scans `localStorage` for those keys,
 * parses them back into typed records, and groups them per slug so the home
 * page (and any future "My PBs" surface) can show the player's history at a
 * glance without round-tripping to KV.
 *
 * Pure helpers live here so they can be unit tested without a DOM. The thin
 * `readMyPbs()` wrapper is the only function that touches `window`; the rest
 * accept their inputs explicitly.
 */

import { SlugSchema, VersionHashSchema } from './schemas'

export const LOCAL_BEST_PREFIX = 'viberacer.best.'

export interface MyPbVersion {
  versionHash: string
  lapTimeMs: number
}

export interface MyPbEntry {
  slug: string
  // Best lap-time on any version of this slug, used to sort the list and to
  // feature in the row's headline. Always equals the smallest lapTimeMs in
  // `versions`.
  bestLapTimeMs: number
  // Every (versionHash, lapTimeMs) pair the player has logged for this slug,
  // newest-version-first is meaningless without timestamps so we sort by
  // lapTimeMs ascending instead. This is what powers the "raced N versions"
  // hint and the per-version drill-down later.
  versions: MyPbVersion[]
}

// Parse a single localStorage key into its slug + versionHash parts.
// Returns null when the key does not match the local-best shape, when the
// slug fails `SlugSchema`, or when the version hash fails `VersionHashSchema`.
// Defensive against unrelated keys that happen to share the prefix (none
// today, but the prefix is short enough that future siblings could collide
// and we want this parser to silently skip them).
export function parseLocalBestKey(
  key: string,
): { slug: string; versionHash: string } | null {
  if (!key.startsWith(LOCAL_BEST_PREFIX)) return null
  const rest = key.slice(LOCAL_BEST_PREFIX.length)
  // `<slug>.<versionHash>`. The version hash is a fixed 64-char hex string,
  // so we split on the LAST dot to allow slugs that contain dots if any are
  // ever introduced (today `SlugSchema` forbids dots, so this is just future
  // proofing). The check below still rejects malformed payloads.
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

// Parse a stored value into a positive integer lap-time in ms. Mirrors the
// validation in `readLocalBest` so a corrupted entry never poisons the list.
export function parseStoredLapTime(raw: string | null): number | null {
  if (raw === null) return null
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return null
  // Cap at hour-scale so a malformed huge number does not lead the list.
  if (n > 60 * 60 * 1000) return null
  return Math.round(n)
}

// Build the list of MyPbEntry rows from a flat `(key, value)` enumeration of
// localStorage. Pure: takes the entries explicitly so tests can drop a
// fixture in without a real `Storage` object. Sorts the output by the
// slug's best lap time ascending (fastest first) and breaks ties by slug
// name for stable output.
export function buildMyPbs(entries: Iterable<[string, string]>): MyPbEntry[] {
  const grouped = new Map<string, MyPbVersion[]>()
  for (const [key, value] of entries) {
    const parsed = parseLocalBestKey(key)
    if (!parsed) continue
    const lapTimeMs = parseStoredLapTime(value)
    if (lapTimeMs === null) continue
    const list = grouped.get(parsed.slug)
    const v: MyPbVersion = { versionHash: parsed.versionHash, lapTimeMs }
    if (list) {
      list.push(v)
    } else {
      grouped.set(parsed.slug, [v])
    }
  }
  const rows: MyPbEntry[] = []
  for (const [slug, versions] of grouped.entries()) {
    versions.sort((a, b) => a.lapTimeMs - b.lapTimeMs)
    rows.push({
      slug,
      bestLapTimeMs: versions[0].lapTimeMs,
      versions,
    })
  }
  rows.sort((a, b) => {
    if (a.bestLapTimeMs !== b.bestLapTimeMs) {
      return a.bestLapTimeMs - b.bestLapTimeMs
    }
    return a.slug.localeCompare(b.slug)
  })
  return rows
}

// Read the live localStorage and return the parsed entry list. Returns an
// empty array on SSR or when the storage is unavailable so callers can call
// this unconditionally and treat empty as "no PBs yet".
export function readMyPbs(): MyPbEntry[] {
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
    if (!key || !key.startsWith(LOCAL_BEST_PREFIX)) continue
    let value: string | null = null
    try {
      value = ls.getItem(key)
    } catch {
      continue
    }
    if (value === null) continue
    entries.push([key, value])
  }
  return buildMyPbs(entries)
}
