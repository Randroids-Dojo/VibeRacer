import { notFound } from 'next/navigation'
import {
  SlugSchema,
  TrackVersionSchema,
  VersionHashSchema,
  type Piece,
} from '@/lib/schemas'
import { DEFAULT_TRACK_PIECES } from '@/lib/defaultTrack'
import { hashTrack } from '@/lib/hashTrack'
import { hasKvConfigured } from '@/lib/kv'
import { Game, type OverallRecord } from '@/components/Game'
import { SlugLanding } from '@/components/SlugLanding'
import { loadRecentTracksSafe } from '@/lib/recentTracks'

const DEFAULT_TRACK = {
  pieces: DEFAULT_TRACK_PIECES,
  versionHash: hashTrack(DEFAULT_TRACK_PIECES),
}

type LoadResult =
  | { kind: 'ok'; pieces: Piece[]; versionHash: string }
  | { kind: 'fresh' }
  | { kind: 'notFound' }

function defaultOrNotFound(requestedHash: string | null): LoadResult {
  if (requestedHash && requestedHash !== DEFAULT_TRACK.versionHash) {
    return { kind: 'notFound' }
  }
  return { kind: 'ok', ...DEFAULT_TRACK }
}

async function loadTrack(
  slug: string,
  requestedHash: string | null,
): Promise<LoadResult> {
  if (!hasKvConfigured()) return defaultOrNotFound(requestedHash)
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
      // A specific-version miss must not fall through to latest.
      if (requestedHash) return { kind: 'notFound' }
    }
    if (!requestedHash && !latestHash) return { kind: 'fresh' }
  } catch {
    // Degrade to the default track so visitors still get something playable.
  }
  return defaultOrNotFound(requestedHash)
}

async function loadOverallRecord(
  slug: string,
  versionHash: string,
): Promise<OverallRecord | null> {
  if (!hasKvConfigured()) return null
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
    const recent = await loadRecentTracksSafe(slug)
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
