import { cache } from 'react'
import { hasKvConfigured } from '@/lib/kv'
import { TrackMusicSchema, type TrackMusic } from '@/lib/trackMusic'

export type LoadTuneResult =
  | {
      kind: 'ok'
      music: TrackMusic
      versionHash: string
    }
  | { kind: 'none' }

export const loadTrackMusic = cache(async (slug: string): Promise<LoadTuneResult> => {
  if (!hasKvConfigured()) return { kind: 'none' }
  try {
    const { getKv, kvKeys } = await import('@/lib/kv')
    const kv = getKv()
    const hash = await kv.get<string>(kvKeys.musicLatest(slug))
    if (!hash) return { kind: 'none' }
    const raw = await kv.get(kvKeys.musicVersion(slug, hash))
    const parsed = TrackMusicSchema.safeParse(raw)
    if (!parsed.success) return { kind: 'none' }
    return { kind: 'ok', music: parsed.data, versionHash: hash }
  } catch {
    return { kind: 'none' }
  }
})
