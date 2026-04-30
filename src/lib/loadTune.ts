import { cache } from 'react'
import { hasKvConfigured } from '@/lib/kv'
import { TrackTuneSchema, type TrackTune } from '@/lib/tunes'

export type LoadTuneResult =
  | {
      kind: 'ok'
      tune: TrackTune
      versionHash: string
    }
  | { kind: 'none' }

export const loadTune = cache(async (slug: string): Promise<LoadTuneResult> => {
  if (!hasKvConfigured()) return { kind: 'none' }
  try {
    const { getKv, kvKeys } = await import('@/lib/kv')
    const kv = getKv()
    const hash = await kv.get<string>(kvKeys.tuneLatest(slug))
    if (!hash) return { kind: 'none' }
    const raw = await kv.get(kvKeys.tuneVersion(slug, hash))
    const parsed = TrackTuneSchema.safeParse(raw)
    if (!parsed.success) return { kind: 'none' }
    return { kind: 'ok', tune: parsed.data, versionHash: hash }
  } catch {
    return { kind: 'none' }
  }
})
