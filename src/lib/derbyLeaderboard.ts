import { createHash } from 'node:crypto'
import {
  derbyConfigCanonical,
  type DerbyArenaConfig,
} from './derbyArenas'
import {
  DerbyLeaderboardEntrySchema,
  type DerbyArenaSlug,
  type DerbyLeaderboardEntry,
  type DerbyVehicleType,
} from './schemas'
import { kvKeys } from './kv'

// Derby leaderboard helpers. One ZSET per arena, scored by roundTimeMs
// ascending so the head of the set is the fastest win. Members are JSON
// strings of DerbyLeaderboardEntry; this keeps the entry portable
// without needing a parallel meta key like the loop boards use.

export const DERBY_LEADERBOARD_DEFAULT_LIMIT = 25
export const DERBY_LEADERBOARD_MAX_LIMIT = 100

export function derbyConfigHash(arena: DerbyArenaConfig): string {
  return createHash('sha256').update(derbyConfigCanonical(arena)).digest('hex')
}

// Minimal KV surface area the derby leaderboard needs. Defining the shape
// here (instead of pinning to Upstash's full Redis type) lets tests pass
// in the FakeKv mock without fighting the SDK's union signatures.
export interface DerbyLeaderboardKv {
  zrange: (
    key: string,
    start: number,
    stop: number,
    opts?: { withScores?: boolean; rev?: boolean },
  ) => Promise<string[]>
  zadd: (
    key: string,
    entry: { score: number; member: string },
  ) => Promise<unknown>
  zcard: (key: string) => Promise<number>
}

export async function writeDerbyEntry(
  kv: DerbyLeaderboardKv,
  arena: DerbyArenaSlug,
  entry: DerbyLeaderboardEntry,
): Promise<void> {
  const key = kvKeys.derbyLeaderboard(arena)
  await kv.zadd(key, {
    score: entry.roundTimeMs,
    member: JSON.stringify(entry),
  })
}

export interface ReadDerbyLeaderboardResult {
  entries: DerbyLeaderboardEntry[]
  total: number
}

export async function readDerbyLeaderboard(
  kv: DerbyLeaderboardKv,
  arena: DerbyArenaSlug,
  limit: number,
  offset: number,
): Promise<ReadDerbyLeaderboardResult> {
  const safeLimit = Number.isFinite(limit)
    ? Math.max(1, Math.min(DERBY_LEADERBOARD_MAX_LIMIT, Math.trunc(limit)))
    : DERBY_LEADERBOARD_DEFAULT_LIMIT
  const safeOffset = Number.isFinite(offset)
    ? Math.max(0, Math.trunc(offset))
    : 0
  const key = kvKeys.derbyLeaderboard(arena)
  const [rawResult, totalResult] = await Promise.allSettled([
    kv.zrange(key, safeOffset, safeOffset + safeLimit - 1),
    kv.zcard(key),
  ])
  if (rawResult.status !== 'fulfilled') throw rawResult.reason
  const raw = rawResult.value as string[]
  const entries: DerbyLeaderboardEntry[] = []
  for (const member of raw) {
    let parsed: unknown
    try {
      parsed = typeof member === 'string' ? JSON.parse(member) : member
    } catch {
      continue
    }
    const checked = DerbyLeaderboardEntrySchema.safeParse(parsed)
    if (checked.success) entries.push(checked.data)
  }
  const total =
    totalResult.status === 'fulfilled' &&
    typeof totalResult.value === 'number' &&
    Number.isFinite(totalResult.value)
      ? Math.max(0, Math.trunc(totalResult.value))
      : safeOffset + entries.length
  return { entries, total }
}

export async function readDerbyTopEntry(
  kv: DerbyLeaderboardKv,
  arena: DerbyArenaSlug,
): Promise<DerbyLeaderboardEntry | null> {
  const { entries } = await readDerbyLeaderboard(kv, arena, 1, 0)
  return entries[0] ?? null
}

// Helper for tests and the start route to mint a stable nonce. 16 bytes of
// hex from createHash so the value is always 32 chars and matches the
// schema regex without needing crypto.randomBytes.
export function newDerbyNonce(seed: string = String(Date.now())): string {
  return createHash('sha256')
    .update(seed + Math.random().toString())
    .digest('hex')
    .slice(0, 32)
}

// Build the canonical leaderboard entry from a submission. Pulls only the
// fields the schema needs so a future submission shape with extra
// telemetry does not bleed into KV.
export function buildLeaderboardEntry(input: {
  initials: string
  roundTimeMs: number
  vehicle: DerbyVehicleType
  scorePoints: number
  racerId: string
  postedAt: number
}): DerbyLeaderboardEntry {
  return DerbyLeaderboardEntrySchema.parse({
    initials: input.initials,
    roundTimeMs: input.roundTimeMs,
    vehicle: input.vehicle,
    scorePoints: input.scorePoints,
    racerId: input.racerId,
    postedAt: input.postedAt,
  })
}
