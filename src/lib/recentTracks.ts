import { SlugSchema } from './schemas'
import { kvKeys } from './kv'

export const RECENT_TRACKS_DEFAULT_LIMIT = 10
export const RECENT_TRACKS_MAX_LIMIT = 50

export interface RecentTrack {
  slug: string
  updatedAt: number
}

interface ZRangeCapable {
  zrange(
    key: string,
    start: number,
    stop: number,
    opts?: { withScores?: boolean; rev?: boolean },
  ): Promise<unknown[]>
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
  // Pull a few extras so excludeSlug + invalid-member filtering still leaves a full list.
  const fetchN = clamped + (excludeSlug ? 1 : 0) + 2
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
