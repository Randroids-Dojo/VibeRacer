import { SlugSchema, type Piece } from './schemas'
import { kvKeys, hasKvConfigured } from './kv'
import { loadTrack } from './loadTrack'

export const RECENT_TRACKS_DEFAULT_LIMIT = 10
export const RECENT_TRACKS_MAX_LIMIT = 50
// Cap how many KV fetches we issue when the home page asks for thumbnail
// previews. Every recent slug needs an extra `trackLatest` + `trackVersion`
// round-trip; clamping keeps the SSR cost bounded if the index ever grows
// past the visible list.
export const RECENT_TRACKS_PREVIEW_MAX = 12

export interface RecentTrack {
  slug: string
  updatedAt: number
}

export interface RecentTrackPreview extends RecentTrack {
  pieces: Piece[] | null
}

interface ZRangeCapable {
  zrange(
    key: string,
    start: number,
    stop: number,
    opts?: { withScores?: boolean; rev?: boolean },
  ): Promise<unknown[]>
}

export async function readRecentTracks(
  kv: ZRangeCapable,
  limit: number = RECENT_TRACKS_DEFAULT_LIMIT,
  excludeSlug: string | null = null,
): Promise<RecentTrack[]> {
  const clamped = Math.min(
    RECENT_TRACKS_MAX_LIMIT,
    Math.max(1, Math.trunc(limit)),
  )
  const fetchN = clamped + (excludeSlug ? 1 : 0)
  const raw = (await kv.zrange(kvKeys.trackIndex(), 0, fetchN - 1, {
    rev: true,
    withScores: true,
  })) as (string | number)[]

  const out: RecentTrack[] = []
  for (let i = 0; i < raw.length && out.length < clamped; i += 2) {
    const member =
      typeof raw[i] === 'string' ? (raw[i] as string) : String(raw[i])
    const score = Number(raw[i + 1])
    if (!Number.isFinite(score)) continue
    const parsed = SlugSchema.safeParse(member)
    if (!parsed.success) continue
    if (excludeSlug && parsed.data === excludeSlug) continue
    out.push({ slug: parsed.data, updatedAt: score })
  }
  return out
}

export async function loadRecentTracksSafe(
  excludeSlug: string | null = null,
  limit: number = RECENT_TRACKS_DEFAULT_LIMIT,
): Promise<RecentTrack[]> {
  if (!hasKvConfigured()) return []
  try {
    const { getKv } = await import('./kv')
    return await readRecentTracks(getKv(), limit, excludeSlug)
  } catch {
    return []
  }
}

// Same as loadRecentTracksSafe but also pulls each track's latest pieces so
// callers can render preview thumbnails. KV failures degrade to `pieces:
// null` on the affected row rather than dropping the row entirely so the
// list stays visually stable.
export async function loadRecentTrackPreviewsSafe(
  excludeSlug: string | null = null,
  limit: number = RECENT_TRACKS_DEFAULT_LIMIT,
): Promise<RecentTrackPreview[]> {
  const recents = await loadRecentTracksSafe(excludeSlug, limit)
  if (recents.length === 0) return []
  const previewable = recents.slice(0, RECENT_TRACKS_PREVIEW_MAX)
  const trailing = recents.slice(RECENT_TRACKS_PREVIEW_MAX)
  const previews = await Promise.all(
    previewable.map(async (r): Promise<RecentTrackPreview> => {
      try {
        const result = await loadTrack(r.slug)
        if (result.kind === 'ok') {
          return { ...r, pieces: result.pieces }
        }
        return { ...r, pieces: null }
      } catch {
        return { ...r, pieces: null }
      }
    }),
  )
  // Append any rows we did not preview (extremely rare, only when limit was
  // bumped past the cap) so the visible list still matches the requested
  // count.
  return [...previews, ...trailing.map((r) => ({ ...r, pieces: null }))]
}
