import {
  TrackVersionSchema,
  type Piece,
  type TrackCheckpoint,
  type TrackBiome,
  type TrackDecoration,
  type TrackMood,
} from '@/lib/schemas'
import { DEFAULT_TRACK_PIECES } from '@/lib/defaultTrack'
import { hashTrack } from '@/lib/hashTrack'
import { hasKvConfigured } from '@/lib/kv'
import {
  SchemaTooNewError,
  assertSchemaVersionSupported,
  convertV1Pieces,
} from '@/lib/trackVersion'

const DEFAULT_TRACK = {
  pieces: DEFAULT_TRACK_PIECES,
  versionHash: hashTrack(DEFAULT_TRACK_PIECES),
}

export type LoadTrackResult =
  | {
      kind: 'ok'
      pieces: Piece[]
      versionHash: string
      checkpointCount?: number
      checkpoints?: TrackCheckpoint[]
      biome?: TrackBiome
      decorations?: TrackDecoration[]
      mood?: TrackMood
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
        // Reject payloads tagged with a schemaVersion this build does not
        // understand. Run the v1 to v2 converter so every downstream caller
        // sees pieces with transform populated; the geometry layer reads
        // `transform` directly and the runtime pipeline
        // (`connectorPortsOf`, `frameOfPortAtTransform`, the path sampler)
        // consumes `transform.theta` for arbitrary angles, so non-projectable
        // continuous-angle pieces no longer need a boundary gate.
        try {
          assertSchemaVersionSupported(parsed.data)
        } catch (err) {
          if (err instanceof SchemaTooNewError) {
            if (requestedHash) return { kind: 'notFound' }
            return defaultOrNotFound(requestedHash)
          }
          throw err
        }
        const pieces = convertV1Pieces(parsed.data.pieces) as Piece[]
        return {
          kind: 'ok',
          pieces,
          versionHash: targetHash,
          checkpointCount: parsed.data.checkpointCount,
          checkpoints: parsed.data.checkpoints,
          biome: parsed.data.biome,
          decorations: parsed.data.decorations,
          mood: parsed.data.mood,
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
