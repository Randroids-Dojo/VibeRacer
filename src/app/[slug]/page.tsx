import { notFound } from 'next/navigation'
import {
  SlugSchema,
  TrackVersionSchema,
  VersionHashSchema,
  type Piece,
} from '@/lib/schemas'
import { DEFAULT_TRACK_PIECES } from '@/lib/defaultTrack'
import { hashTrack } from '@/lib/hashTrack'
import { Game, type OverallRecord } from '@/components/Game'
import { SlugLanding } from '@/components/SlugLanding'
import {
  readRecentTracks,
  RECENT_TRACKS_DEFAULT_LIMIT,
  type RecentTrack,
} from '@/lib/recentTracks'

const DEFAULT_TRACK = {
  pieces: DEFAULT_TRACK_PIECES,
  versionHash: hashTrack(DEFAULT_TRACK_PIECES),
}

type LoadResult =
  | { kind: 'ok'; pieces: Piece[]; versionHash: string }
  | { kind: 'fresh' }
  | { kind: 'notFound' }

function hasKvConfigured(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)
}

async function loadTrack(
  slug: string,
  requestedHash: string | null,
): Promise<LoadResult> {
  if (!hasKvConfigured()) {
    if (requestedHash && requestedHash !== DEFAULT_TRACK.versionHash) {
      return { kind: 'notFound' }
    }
    return { kind: 'ok', ...DEFAULT_TRACK }
  }
  try {
    const { getKv, kvKeys } = await import('@/lib/kv')
    const kv = getKv()
    const latestHash = requestedHash
      ? null
      : await kv.get<string>(kvKeys.trackLatest(slug))
    const targetHash = requestedHash ?? latestHash
    if (targetHash) {
      const version = await kv.get(kvKeys.trackVersion(slug, targetHash))
      const parsed = TrackVersionSchema.safeParse(version)
      if (parsed.success) {
        return {
          kind: 'ok',
          pieces: parsed.data.pieces as Piece[],
          versionHash: targetHash,
        }
      }
      // A specific version was requested but not found: do not silently serve latest.
      if (requestedHash) return { kind: 'notFound' }
    }
    if (!requestedHash && !latestHash) {
      return { kind: 'fresh' }
    }
  } catch {
    // KV threw mid-request. Fall back to the default track so visitors still
    // get a playable experience.
    if (requestedHash && requestedHash !== DEFAULT_TRACK.versionHash) {
      return { kind: 'notFound' }
    }
    return { kind: 'ok', ...DEFAULT_TRACK }
  }
  if (requestedHash && requestedHash !== DEFAULT_TRACK.versionHash) {
    return { kind: 'notFound' }
  }
  return { kind: 'ok', ...DEFAULT_TRACK }
}

async function loadRecentTracks(excludeSlug: string): Promise<RecentTrack[]> {
  if (!hasKvConfigured()) return []
  try {
    const { getKv } = await import('@/lib/kv')
    return await readRecentTracks(
      getKv(),
      RECENT_TRACKS_DEFAULT_LIMIT,
      excludeSlug,
    )
  } catch {
    return []
  }
}

async function loadOverallRecord(
  slug: string,
  versionHash: string,
): Promise<OverallRecord | null> {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return null
  }
  try {
    const { getKv } = await import('@/lib/kv')
    const { readLeaderboard } = await import('@/lib/leaderboard')
    const { entries } = await readLeaderboard(getKv(), slug, versionHash, 1, null)
    const top = entries[0]
    if (!top) return null
    return { initials: top.initials, lapTimeMs: top.lapTimeMs }
  } catch {
    return null
  }
}

export default async function SlugPage(ctx: {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { slug: raw } = await ctx.params
  const parsed = SlugSchema.safeParse(raw)
  if (!parsed.success) notFound()
  const slug = parsed.data

  const sp = await ctx.searchParams
  const vRaw = Array.isArray(sp.v) ? sp.v[0] : sp.v
  let requestedHash: string | null = null
  if (vRaw !== undefined) {
    const hashParsed = VersionHashSchema.safeParse(vRaw)
    if (!hashParsed.success) notFound()
    requestedHash = hashParsed.data
  }

  const loaded = await loadTrack(slug, requestedHash)
  if (loaded.kind === 'notFound') notFound()
  if (loaded.kind === 'fresh') {
    const recent = await loadRecentTracks(slug)
    return <SlugLanding slug={slug} recent={recent} />
  }
  const { pieces, versionHash } = loaded
  const overallRecord = await loadOverallRecord(slug, versionHash)

  return (
    <Game
      slug={slug}
      versionHash={versionHash}
      pieces={pieces}
      initialRecord={overallRecord}
    />
  )
}
