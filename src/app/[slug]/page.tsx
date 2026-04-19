import { notFound } from 'next/navigation'
import { SlugSchema, TrackVersionSchema, type Piece } from '@/lib/schemas'
import { DEFAULT_TRACK_PIECES } from '@/lib/defaultTrack'
import { hashTrack } from '@/lib/hashTrack'
import { Game, type OverallRecord } from '@/components/Game'

const DEFAULT_TRACK = {
  pieces: DEFAULT_TRACK_PIECES,
  versionHash: hashTrack(DEFAULT_TRACK_PIECES),
}

async function loadTrack(slug: string): Promise<{ pieces: Piece[]; versionHash: string }> {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return DEFAULT_TRACK
  }
  try {
    const { getKv, kvKeys } = await import('@/lib/kv')
    const kv = getKv()
    const latestHash = await kv.get<string>(kvKeys.trackLatest(slug))
    if (latestHash) {
      const version = await kv.get(kvKeys.trackVersion(slug, latestHash))
      const parsed = TrackVersionSchema.safeParse(version)
      if (parsed.success) {
        return { pieces: parsed.data.pieces as Piece[], versionHash: latestHash }
      }
    }
  } catch {
    // Fall through to default.
  }
  return DEFAULT_TRACK
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

export default async function SlugPage(ctx: { params: Promise<{ slug: string }> }) {
  const { slug: raw } = await ctx.params
  const parsed = SlugSchema.safeParse(raw)
  if (!parsed.success) notFound()
  const slug = parsed.data
  const { pieces, versionHash } = await loadTrack(slug)
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
