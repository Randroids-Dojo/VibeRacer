import type { Redis } from '@upstash/redis'
import { kvKeys } from './kv'
import type { Slug, VersionHash } from './schemas'

export const LEADERBOARD_DEFAULT_LIMIT = 25
export const LEADERBOARD_MAX_LIMIT = 100

export interface LeaderboardEntry {
  rank: number
  initials: string
  lapTimeMs: number
  ts: number
  isMe: boolean
}

export interface LeaderboardResponse {
  slug: string
  versionHash: string
  entries: LeaderboardEntry[]
  meBestRank: number | null
}

interface ParsedMember {
  initials: string
  racerId: string
  ts: number
}

function parseMember(member: string): ParsedMember | null {
  const parts = member.split(':')
  if (parts.length < 4) return null
  const [initials, racerId, tsStr] = parts
  const ts = Number(tsStr)
  if (!Number.isFinite(ts)) return null
  return { initials, racerId, ts }
}

export async function readLeaderboard(
  kv: Pick<Redis, 'zrange'>,
  slug: Slug,
  versionHash: VersionHash,
  limit: number,
  myRacerId: string | null,
): Promise<{ entries: LeaderboardEntry[]; meBestRank: number | null }> {
  const raw = (await kv.zrange(
    kvKeys.leaderboard(slug, versionHash),
    0,
    limit - 1,
    { withScores: true },
  )) as (string | number)[]

  const entries: LeaderboardEntry[] = []
  let meBestRank: number | null = null
  for (let i = 0; i < raw.length; i += 2) {
    const member = typeof raw[i] === 'string' ? (raw[i] as string) : String(raw[i])
    const score = Number(raw[i + 1])
    const parsed = parseMember(member)
    if (!parsed || !Number.isFinite(score)) continue
    const rank = entries.length + 1
    const isMe = myRacerId !== null && parsed.racerId === myRacerId
    if (isMe && meBestRank === null) meBestRank = rank
    entries.push({
      rank,
      initials: parsed.initials,
      lapTimeMs: score,
      ts: parsed.ts,
      isMe,
    })
  }

  return { entries, meBestRank }
}
