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
  // Per-lap nonce (the same id stored in the composite leaderboard member).
  // Surfaced so the client can request the lap's recorded replay via
  // `GET /api/replay/byNonce` and race it as a rival ghost. Stays just a
  // string at this level so a hostile / hand-edited member can never crash
  // the renderer. Nullable so a future migration that drops the field on a
  // single-row corruption does not require a full data wipe.
  nonce: string | null
}

// Sort keys exposed in the leaderboard column headers. The server always
// returns entries in rank order (lapTimeMs ascending), which is the natural
// "leaderboard" view. The UI lets the player flip the order or sort by other
// columns without re-fetching, so this is a pure client-side reshape.
export type LeaderboardSortKey = 'rank' | 'racer' | 'time' | 'date'
export type SortDirection = 'asc' | 'desc'

// Default direction per column when first clicked. Rank/time/date open ascending
// (best/oldest first feels natural for "best to worst"), but racer text feels
// most intuitive A->Z which is also ascending. Kept here as a single source of
// truth so the helper and the UI agree.
export const DEFAULT_SORT_DIRECTION: Record<LeaderboardSortKey, SortDirection> = {
  rank: 'asc',
  racer: 'asc',
  time: 'asc',
  date: 'desc',
}

// Pure helper. Returns a new array with the entries sorted by the requested
// key + direction. The original `rank` field is preserved on every entry so
// callers can still display the leaderboard rank even after re-sorting (e.g.
// sorting by date still shows that the row is rank #3 overall).
//
// Tie-break is always by ascending rank so two entries with the same key
// land in their natural leaderboard order.
export function sortLeaderboardEntries(
  entries: readonly LeaderboardEntry[],
  key: LeaderboardSortKey,
  direction: SortDirection,
): LeaderboardEntry[] {
  const copy = entries.slice()
  const sign = direction === 'asc' ? 1 : -1
  copy.sort((a, b) => {
    const cmp = compareByKey(a, b, key)
    if (cmp !== 0) return cmp * sign
    // Stable tie-break on rank so re-sorts are deterministic.
    return a.rank - b.rank
  })
  return copy
}

function compareByKey(
  a: LeaderboardEntry,
  b: LeaderboardEntry,
  key: LeaderboardSortKey,
): number {
  switch (key) {
    case 'rank':
      return a.rank - b.rank
    case 'racer': {
      const ai = a.initials.toUpperCase()
      const bi = b.initials.toUpperCase()
      if (ai < bi) return -1
      if (ai > bi) return 1
      return 0
    }
    case 'time':
      return a.lapTimeMs - b.lapTimeMs
    case 'date':
      return a.ts - b.ts
  }
}

export interface LeaderboardResponse {
  slug: string
  versionHash: string
  entries: LeaderboardEntry[]
  meBestRank: number | null
  pagination: LeaderboardPagination
}

export interface LeaderboardPagination {
  offset: number
  limit: number
  total: number
  hasPrev: boolean
  hasNext: boolean
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
  zcard: Redis['zcard']
}

export async function readLeaderboard(
  kv: MetaCapableKv,
  slug: Slug,
  versionHash: VersionHash,
  limit: number,
  offset: number,
  myRacerId: string | null,
): Promise<{
  entries: LeaderboardEntry[]
  meBestRank: number | null
  pagination: LeaderboardPagination
}> {
  const safeLimit = Number.isFinite(limit)
    ? Math.max(1, Math.min(LEADERBOARD_MAX_LIMIT, Math.trunc(limit)))
    : LEADERBOARD_DEFAULT_LIMIT
  const safeOffset = Number.isFinite(offset) ? Math.max(0, Math.trunc(offset)) : 0
  const key = kvKeys.leaderboard(slug, versionHash)
  const [raw, totalRaw] = await Promise.all([
    kv.zrange(key, safeOffset, safeOffset + safeLimit - 1, { withScores: true }),
    kv.zcard(key),
  ])
  const total =
    typeof totalRaw === 'number' && Number.isFinite(totalRaw)
      ? Math.max(0, Math.trunc(totalRaw))
      : 0

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
    const rank = safeOffset + entries.length + 1
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
      nonce: parsed.nonce,
    })
  }

  return {
    entries,
    meBestRank,
    pagination: {
      offset: safeOffset,
      limit: safeLimit,
      total,
      hasPrev: safeOffset > 0,
      hasNext: safeOffset + safeLimit < total,
    },
  }
}
