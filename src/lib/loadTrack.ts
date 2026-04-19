import { TrackVersionSchema, type Piece } from '@/lib/schemas'
import { DEFAULT_TRACK_PIECES } from '@/lib/defaultTrack'
import { hashTrack } from '@/lib/hashTrack'

const DEFAULT_TRACK = {
  pieces: DEFAULT_TRACK_PIECES,
  versionHash: hashTrack(DEFAULT_TRACK_PIECES),
}

export type LoadTrackResult =
  | { kind: 'ok'; pieces: Piece[]; versionHash: string }
  | { kind: 'notFound' }

export async function loadTrack(
  slug: string,
  requestedHash: string | null = null,
): Promise<LoadTrackResult> {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    if (requestedHash && requestedHash !== DEFAULT_TRACK.versionHash) {
      return { kind: 'notFound' }
    }
    return { kind: 'ok', ...DEFAULT_TRACK }
  }
  try {
    const { getKv, kvKeys } = await import('@/lib/kv')
    const kv = getKv()
    const targetHash =
      requestedHash ?? (await kv.get<string>(kvKeys.trackLatest(slug)))
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
  } catch {
    // Fall through to default when KV is unavailable.
  }
  if (requestedHash && requestedHash !== DEFAULT_TRACK.versionHash) {
    return { kind: 'notFound' }
  }
  return { kind: 'ok', ...DEFAULT_TRACK }
}
