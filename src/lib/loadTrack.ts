import {
  TrackVersionSchema,
  type Piece,
  type TrackCheckpoint,
  type TrackBiome,
  type TrackMood,
  type TrackTransmissionMode,
} from '@/lib/schemas'
import { DEFAULT_TRACK_PIECES } from '@/lib/defaultTrack'
import { hashTrack } from '@/lib/hashTrack'
import { hasKvConfigured } from '@/lib/kv'
import { DEFAULT_TRACK_TRANSMISSION } from '@/game/transmission'

const DEFAULT_TRACK = {
  pieces: DEFAULT_TRACK_PIECES,
  versionHash: hashTrack(DEFAULT_TRACK_PIECES),
  transmission: DEFAULT_TRACK_TRANSMISSION,
}

export type LoadTrackResult =
  | {
      kind: 'ok'
      pieces: Piece[]
      versionHash: string
      checkpointCount?: number
      checkpoints?: TrackCheckpoint[]
      biome?: TrackBiome
      mood?: TrackMood
      transmission: TrackTransmissionMode
    }
  | { kind: 'fresh' }
  | { kind: 'notFound' }

function defaultOrNotFound(requestedHash: string | null): LoadTrackResult {
  if (requestedHash && requestedHash !== DEFAULT_TRACK.versionHash) {
    return { kind: 'notFound' }
  }
  return { kind: 'ok', ...DEFAULT_TRACK }
}

export async function loadTrack(
  slug: string,
  requestedHash: string | null = null,
): Promise<LoadTrackResult> {
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
          checkpointCount: parsed.data.checkpointCount,
          checkpoints: parsed.data.checkpoints,
          biome: parsed.data.biome,
          mood: parsed.data.mood,
          transmission: parsed.data.transmission,
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
