/**
 * Favorite tracks log: every slug the player has starred from the pause menu
 * gets recorded to localStorage so the home page can surface a "Favorites"
 * section. Each entry stores the slug plus the timestamp (epoch ms) the
 * favorite was added so the list can render most-recently-starred first
 * without a server round-trip.
 *
 * Storage key: `viberacer.favoriteTracks` (single JSON blob, not per-slug,
 * because the list is small and a single write keeps the toggle flow simple).
 *
 * Pure helpers live here so they can be unit-tested without a DOM. The thin
 * `readFavoriteTracks` / `addFavoriteTrack` / `removeFavoriteTrack` /
 * `toggleFavoriteTrack` wrappers are the only functions that touch `window`;
 * the rest accept their inputs explicitly. Mirrors the shape of `myTracks.ts`
 * intentionally so future home-page sections can be derived from one common
 * pattern.
 */
import { z } from 'zod'
import { SlugSchema } from './schemas'

export const FAVORITE_TRACKS_STORAGE_KEY = 'viberacer.favoriteTracks'

// Custom event broadcast on every storage write so the home-page section and
// the in-race favorite button can refresh live without a hard reload.
// Listeners on the same tab use this; the browser's native `storage` event
// covers the cross-tab case.
export const FAVORITE_TRACKS_EVENT = 'viberacer:favorite-tracks-changed'

export interface FavoriteTrackEntry {
  slug: string
  // Epoch ms of when the player starred this slug. Used to sort the list
  // most-recently-starred first.
  addedAt: number
}

const EntrySchema = z.object({
  slug: SlugSchema,
  addedAt: z.number().positive().finite(),
})
const ListSchema = z.array(EntrySchema)

/**
 * Sort a list of entries most-recently-starred first by `addedAt`. Stable
 * secondary sort by slug name so two stars at the exact same millisecond
 * render in a predictable order. Returns a fresh array; never mutates the
 * input.
 */
export function sortFavoriteTracks(
  entries: FavoriteTrackEntry[],
): FavoriteTrackEntry[] {
  const out = entries.slice()
  out.sort((a, b) => {
    if (a.addedAt !== b.addedAt) return b.addedAt - a.addedAt
    return a.slug.localeCompare(b.slug)
  })
  return out
}

/**
 * Add a slug to the favorites list. If the slug is already present, the entry
 * is left alone (the original star timestamp is preserved so the list does
 * not constantly reshuffle when a player visits and re-stars the same track).
 * Returns a fresh array; never mutates the input. Defensive against
 * non-string slugs and non-finite timestamps so a misbehaving caller can
 * never poison the stored list.
 */
export function applyFavoriteAdd(
  prev: FavoriteTrackEntry[],
  slug: unknown,
  addedAt: unknown,
): FavoriteTrackEntry[] {
  if (typeof slug !== 'string') return prev.slice()
  const slugParsed = SlugSchema.safeParse(slug)
  if (!slugParsed.success) return prev.slice()
  if (typeof addedAt !== 'number') return prev.slice()
  if (!Number.isFinite(addedAt) || addedAt <= 0) return prev.slice()
  if (prev.some((e) => e.slug === slugParsed.data)) return prev.slice()
  const out = prev.slice()
  out.push({ slug: slugParsed.data, addedAt })
  return out
}

/**
 * Remove a slug from the favorites list. Returns the same array reference
 * (cloned) when the slug is not present so the caller can detect a no-op via
 * length comparison if they want. Defensive against non-string slugs.
 */
export function applyFavoriteRemove(
  prev: FavoriteTrackEntry[],
  slug: unknown,
): FavoriteTrackEntry[] {
  if (typeof slug !== 'string') return prev.slice()
  const slugParsed = SlugSchema.safeParse(slug)
  if (!slugParsed.success) return prev.slice()
  return prev.filter((e) => e.slug !== slugParsed.data)
}

/**
 * Returns true when the slug is in the list of favorites. Defensive against
 * non-string slugs and malformed slug values so callers can safely route
 * arbitrary input through this guard.
 */
export function isFavoriteTrack(
  entries: FavoriteTrackEntry[],
  slug: unknown,
): boolean {
  if (typeof slug !== 'string') return false
  const slugParsed = SlugSchema.safeParse(slug)
  if (!slugParsed.success) return false
  return entries.some((e) => e.slug === slugParsed.data)
}

/**
 * Parse a raw localStorage blob into a sorted list. Returns an empty array
 * on missing / malformed / non-array payloads so the caller never has to
 * branch on bad data.
 */
export function parseFavoriteTracks(
  raw: string | null,
): FavoriteTrackEntry[] {
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
  // earliest `addedAt` per slug so the original star time is preserved.
  const byslug = new Map<string, FavoriteTrackEntry>()
  for (const e of parsed.data) {
    const prior = byslug.get(e.slug)
    if (!prior || e.addedAt < prior.addedAt) {
      byslug.set(e.slug, e)
    }
  }
  return sortFavoriteTracks(Array.from(byslug.values()))
}

/**
 * Read the live localStorage and return the parsed list, sorted
 * most-recently-starred first. Returns an empty array on SSR or when
 * storage is unavailable so callers can call this unconditionally and treat
 * empty as "no favorites yet".
 */
export function readFavoriteTracks(): FavoriteTrackEntry[] {
  if (typeof window === 'undefined') return []
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(FAVORITE_TRACKS_STORAGE_KEY)
  } catch {
    return []
  }
  return parseFavoriteTracks(raw)
}

function writeFavoriteTracks(next: FavoriteTrackEntry[]): FavoriteTrackEntry[] {
  if (typeof window === 'undefined') return next
  try {
    window.localStorage.setItem(
      FAVORITE_TRACKS_STORAGE_KEY,
      JSON.stringify(next),
    )
  } catch {
    // Quota or disabled storage. Best-effort: return the in-memory list.
    return next
  }
  try {
    window.dispatchEvent(
      new CustomEvent<FavoriteTrackEntry[]>(FAVORITE_TRACKS_EVENT, {
        detail: next,
      }),
    )
  } catch {
    // CustomEvent is universal in modern browsers but defensive anyway.
  }
  return next
}

/**
 * Add a favorite. Idempotent for repeat stars on the same slug and defensive
 * against quota errors. Returns the updated list so callers can hand it
 * straight to React state without a second read.
 */
export function addFavoriteTrack(
  slug: string,
  nowMs: number = Date.now(),
): FavoriteTrackEntry[] {
  const prev = readFavoriteTracks()
  const next = applyFavoriteAdd(prev, slug, nowMs)
  return writeFavoriteTracks(next)
}

/**
 * Remove a favorite. Idempotent: removing a slug that is not in the list is
 * a no-op write (still fires the event so listeners can react). Returns the
 * updated list.
 */
export function removeFavoriteTrack(slug: string): FavoriteTrackEntry[] {
  const prev = readFavoriteTracks()
  const next = applyFavoriteRemove(prev, slug)
  return writeFavoriteTracks(next)
}

/**
 * Toggle a favorite: removes it if present, adds it if not. Returns the
 * updated list.
 */
export function toggleFavoriteTrack(
  slug: string,
  nowMs: number = Date.now(),
): FavoriteTrackEntry[] {
  const prev = readFavoriteTracks()
  if (isFavoriteTrack(prev, slug)) {
    return writeFavoriteTracks(applyFavoriteRemove(prev, slug))
  }
  return writeFavoriteTracks(applyFavoriteAdd(prev, slug, nowMs))
}
