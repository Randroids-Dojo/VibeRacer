/**
 * Track authorship log: every slug the player has saved through the editor
 * gets recorded to localStorage so the home page can surface a "Tracks you
 * built" section. Each entry stores the slug plus the most recent author save
 * timestamp (epoch ms) so the list can render newest-first without a server
 * round-trip.
 *
 * Storage key: `viberacer.myTracks` (single JSON blob, not per-slug, because
 * the list is small and a single write keeps the editor's save flow simple).
 *
 * Pure helpers live here so they can be unit-tested without a DOM. The thin
 * `readMyTracks()` / `recordMyTrack()` wrappers are the only functions that
 * touch `window`; the rest accept their inputs explicitly.
 */
import { z } from 'zod'
import { SlugSchema } from './schemas'

export const MY_TRACKS_STORAGE_KEY = 'viberacer.myTracks'

// Custom event broadcast on every storage write so the home-page section can
// refresh live when the player navigates away from the editor and back without
// a hard reload. Listeners on the same tab use this; the browser's native
// `storage` event covers the cross-tab case.
export const MY_TRACKS_EVENT = 'viberacer:my-tracks-changed'

export interface MyTrackEntry {
  slug: string
  // Epoch ms of the most recent save the player made on this slug. Used to
  // sort the list newest-first.
  updatedAt: number
}

const EntrySchema = z.object({
  slug: SlugSchema,
  updatedAt: z.number().positive().finite(),
})
const ListSchema = z.array(EntrySchema)

/**
 * Sort a list of entries newest-first by `updatedAt`. Stable secondary sort
 * by slug name so two saves at the exact same millisecond render in a
 * predictable order. Returns a fresh array; never mutates the input.
 */
export function sortMyTracks(entries: MyTrackEntry[]): MyTrackEntry[] {
  const out = entries.slice()
  out.sort((a, b) => {
    if (a.updatedAt !== b.updatedAt) return b.updatedAt - a.updatedAt
    return a.slug.localeCompare(b.slug)
  })
  return out
}

/**
 * Apply a single save event to a list. If the slug already exists, its
 * `updatedAt` is bumped to the new value (or kept if the new value is
 * older, so an out-of-order timestamp can never regress the row). If the
 * slug is new, it is appended. Returns a fresh array; never mutates the
 * input. Defensive against non-string slugs and non-finite timestamps so a
 * misbehaving caller can never poison the stored list.
 */
export function applyMyTrackSave(
  prev: MyTrackEntry[],
  slug: unknown,
  updatedAt: unknown,
): MyTrackEntry[] {
  if (typeof slug !== 'string') return prev.slice()
  const slugParsed = SlugSchema.safeParse(slug)
  if (!slugParsed.success) return prev.slice()
  if (typeof updatedAt !== 'number') return prev.slice()
  if (!Number.isFinite(updatedAt) || updatedAt <= 0) return prev.slice()
  const out = prev.slice()
  const idx = out.findIndex((e) => e.slug === slugParsed.data)
  if (idx === -1) {
    out.push({ slug: slugParsed.data, updatedAt })
    return out
  }
  if (updatedAt > out[idx].updatedAt) {
    out[idx] = { slug: slugParsed.data, updatedAt }
  }
  return out
}

/**
 * Parse a raw localStorage blob into a sorted list. Returns an empty array
 * on missing / malformed / non-array payloads so the caller never has to
 * branch on bad data.
 */
export function parseMyTracks(raw: string | null): MyTrackEntry[] {
  if (raw === null) return []
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return []
  }
  const parsed = ListSchema.safeParse(json)
  if (!parsed.success) return []
  // Defensive dedupe in case a hand-edited payload has duplicates: keep the
  // newest `updatedAt` per slug.
  const byslug = new Map<string, MyTrackEntry>()
  for (const e of parsed.data) {
    const prior = byslug.get(e.slug)
    if (!prior || e.updatedAt > prior.updatedAt) {
      byslug.set(e.slug, e)
    }
  }
  return sortMyTracks(Array.from(byslug.values()))
}

/**
 * Read the live localStorage and return the parsed list, sorted
 * newest-first. Returns an empty array on SSR or when storage is
 * unavailable so callers can call this unconditionally and treat empty as
 * "no tracks built yet".
 */
export function readMyTracks(): MyTrackEntry[] {
  if (typeof window === 'undefined') return []
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(MY_TRACKS_STORAGE_KEY)
  } catch {
    return []
  }
  return parseMyTracks(raw)
}

/**
 * Record a save event for the given slug. Idempotent for repeat saves on
 * the same millisecond and defensive against quota errors so the editor's
 * save flow never breaks because the player's storage is full.
 *
 * Returns the updated list so the caller can hand it straight to React
 * state without a second read.
 */
export function recordMyTrack(slug: string, nowMs: number = Date.now()): MyTrackEntry[] {
  const prev = readMyTracks()
  const next = applyMyTrackSave(prev, slug, nowMs)
  if (typeof window === 'undefined') return next
  try {
    window.localStorage.setItem(MY_TRACKS_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Quota or disabled storage. Best-effort: return the in-memory list.
    return next
  }
  try {
    window.dispatchEvent(
      new CustomEvent<MyTrackEntry[]>(MY_TRACKS_EVENT, { detail: next }),
    )
  } catch {
    // CustomEvent is universal in modern browsers but defensive anyway.
  }
  return next
}
