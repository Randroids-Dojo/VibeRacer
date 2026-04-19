import { TrackVersionSchema, type Piece } from '@/lib/schemas'
import { DEFAULT_TRACK_PIECES } from '@/lib/defaultTrack'
import { hashTrack } from '@/lib/hashTrack'

const DEFAULT_TRACK = {
  pieces: DEFAULT_TRACK_PIECES,
  versionHash: hashTrack(DEFAULT_TRACK_PIECES),
}

export async function loadLatestTrack(
  slug: string,
): Promise<{ pieces: Piece[]; versionHash: string }> {
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
