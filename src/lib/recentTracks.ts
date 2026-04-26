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

// Top time on the latest version of a track. Shown as a small badge on the
// track row so a player browsing the home page can see who currently holds
// the record on each track without opening it. Composite member format mirrors
// the leaderboard zset: `initials:racerId:ts:nonce`.
export interface TopTime {
  initials: string
  lapTimeMs: number
}

export interface RecentTrackPreview extends RecentTrack {
  pieces: Piece[] | null
  // Latest version's track record. Null when KV has no entries for this
  // slug's latest version, or when KV is unreachable. The row degrades to
  // showing no badge in either case.
  topTime: TopTime | null
}

interface ZRangeCapable {
  zrange(
    key: string,
    start: number,
    stop: number,
    opts?: { withScores?: boolean; rev?: boolean },
  ): Promise<unknown[]>
}

interface ZRangeAndGetCapable extends ZRangeCapable {
  get<T = unknown>(key: string): Promise<T | null>
}

// Parse the rank-1 leaderboard entry out of an Upstash `zrange withScores`
// response. The composite member is `initials:racerId:ts:nonce`; the score
// is the lap time in ms. Returns `null` for missing / malformed inputs so
// callers can degrade gracefully without try/catch.
export function parseTopTimeFromZrange(raw: unknown[]): TopTime | null {
  if (!Array.isArray(raw) || raw.length < 2) return null
  const memberRaw = raw[0]
  const scoreRaw = raw[1]
  const member = typeof memberRaw === 'string' ? memberRaw : String(memberRaw)
  const lapTimeMs = Number(scoreRaw)
  if (!Number.isFinite(lapTimeMs) || lapTimeMs <= 0) return null
  // Cap at hour-scale to silently drop obviously malformed scores.
  if (lapTimeMs > 60 * 60 * 1000) return null
  const parts = member.split(':')
  if (parts.length < 4) return null
  const initials = parts[0]
  if (!/^[A-Z]{3}$/.test(initials)) return null
  return { initials, lapTimeMs: Math.round(lapTimeMs) }
}

// Fetch the rank-1 (fastest) entry for a slug's latest version. Returns null
// when the slug has no saved track, no leaderboard entries, or KV throws.
// Pure-ish: takes a kv-shaped object so tests can drop in `FakeKv`.
export async function fetchTopTimeForSlug(
  kv: ZRangeAndGetCapable,
  slug: string,
): Promise<TopTime | null> {
  try {
    const latestHash = await kv.get<string>(kvKeys.trackLatest(slug))
    if (!latestHash || typeof latestHash !== 'string') return null
    const raw = await kv.zrange(
      kvKeys.leaderboard(slug, latestHash),
      0,
      0,
      { withScores: true },
    )
    return parseTopTimeFromZrange(raw)
  } catch {
    return null
  }
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
// callers can render preview thumbnails plus the track's current top time
// so the row can show a leader badge. KV failures degrade to `pieces: null`
// and `topTime: null` on the affected row rather than dropping the row
// entirely so the list stays visually stable.
export async function loadRecentTrackPreviewsSafe(
  excludeSlug: string | null = null,
  limit: number = RECENT_TRACKS_DEFAULT_LIMIT,
): Promise<RecentTrackPreview[]> {
  const recents = await loadRecentTracksSafe(excludeSlug, limit)
  if (recents.length === 0) return []
  const previewable = recents.slice(0, RECENT_TRACKS_PREVIEW_MAX)
  const trailing = recents.slice(RECENT_TRACKS_PREVIEW_MAX)
  let kv: ZRangeAndGetCapable | null = null
  if (hasKvConfigured()) {
    try {
      const { getKv } = await import('./kv')
      kv = getKv() as unknown as ZRangeAndGetCapable
    } catch {
      kv = null
    }
  }
  const previews = await Promise.all(
    previewable.map(async (r): Promise<RecentTrackPreview> => {
      const [piecesRes, topTime] = await Promise.all([
        loadTrack(r.slug)
          .then((result) =>
            result.kind === 'ok' ? (result.pieces as Piece[]) : null,
          )
          .catch(() => null),
        kv ? fetchTopTimeForSlug(kv, r.slug) : Promise.resolve(null),
      ])
      return { ...r, pieces: piecesRes, topTime }
    }),
  )
  // Append any rows we did not preview (extremely rare, only when limit was
  // bumped past the cap) so the visible list still matches the requested
  // count.
  return [
    ...previews,
    ...trailing.map((r) => ({ ...r, pieces: null, topTime: null })),
  ]
}
