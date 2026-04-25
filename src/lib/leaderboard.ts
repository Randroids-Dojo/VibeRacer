import type { Redis } from '@upstash/redis'
import { kvKeys } from './kv'
import type { Slug, VersionHash } from './schemas'
import type { CarParams } from '@/game/physics'
import {
  CarParamsSchema,
  InputModeSchema,
  type InputMode,
} from './tuningSettings'

export const LEADERBOARD_DEFAULT_LIMIT = 25
export const LEADERBOARD_MAX_LIMIT = 100

export interface LeaderboardEntry {
  rank: number
  initials: string
  lapTimeMs: number
  ts: number
  isMe: boolean
  // Setup the lap was raced with. Older entries have no meta and these are
  // null, in which case the UI shows a dim placeholder.
  tuning: CarParams | null
  inputMode: InputMode | null
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
  nonce: string
}

function parseMember(member: string): ParsedMember | null {
  const parts = member.split(':')
  if (parts.length < 4) return null
  const [initials, racerId, tsStr, nonce] = parts
  const ts = Number(tsStr)
  if (!Number.isFinite(ts)) return null
  return { initials, racerId, ts, nonce }
}

interface RawLapMeta {
  tuning: CarParams | null
  inputMode: InputMode | null
}

function parseLapMeta(raw: unknown): RawLapMeta {
  if (raw === null || raw === undefined) return { tuning: null, inputMode: null }
  // Upstash mget returns parsed JSON when the value was JSON; can also return a
  // string if the row was set as a non-JSON string. Be lenient.
  let obj: unknown = raw
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw)
    } catch {
      return { tuning: null, inputMode: null }
    }
  }
  if (!obj || typeof obj !== 'object') {
    return { tuning: null, inputMode: null }
  }
  const record = obj as Record<string, unknown>
  const tuningParsed = CarParamsSchema.safeParse(record.tuning)
  const inputModeParsed = InputModeSchema.safeParse(record.inputMode)
  return {
    tuning: tuningParsed.success ? tuningParsed.data : null,
    inputMode: inputModeParsed.success ? inputModeParsed.data : null,
  }
}

interface MetaCapableKv {
  zrange: Redis['zrange']
  mget: Redis['mget']
}

export async function readLeaderboard(
  kv: MetaCapableKv,
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

  // Walk the zrange output collecting parsed members + scores + nonce keys for
  // a single mget. Skip entries we cannot parse.
  interface Pending {
    parsed: ParsedMember
    score: number
  }
  const pending: Pending[] = []
  for (let i = 0; i < raw.length; i += 2) {
    const member = typeof raw[i] === 'string' ? (raw[i] as string) : String(raw[i])
    const score = Number(raw[i + 1])
    const parsed = parseMember(member)
    if (!parsed || !Number.isFinite(score)) continue
    pending.push({ parsed, score })
  }

  const metaKeys = pending.map((p) => kvKeys.lapMeta(p.parsed.nonce))
  const metaRaws =
    metaKeys.length === 0
      ? []
      : ((await kv.mget(...metaKeys)) as unknown[])

  const entries: LeaderboardEntry[] = []
  let meBestRank: number | null = null
  for (let i = 0; i < pending.length; i++) {
    const { parsed, score } = pending[i]
    const meta = parseLapMeta(metaRaws[i])
    const rank = entries.length + 1
    const isMe = myRacerId !== null && parsed.racerId === myRacerId
    if (isMe && meBestRank === null) meBestRank = rank
    entries.push({
      rank,
      initials: parsed.initials,
      lapTimeMs: score,
      ts: parsed.ts,
      isMe,
      tuning: meta.tuning,
      inputMode: meta.inputMode,
    })
  }

  return { entries, meBestRank }
}
