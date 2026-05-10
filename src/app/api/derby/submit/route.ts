import { NextResponse, type NextRequest } from 'next/server'
import { DerbySubmissionSchema } from '@/lib/schemas'
import { DERBY_ARENAS } from '@/lib/derbyArenas'
import { DERBY_VEHICLES } from '@/lib/derbyVehicles'
import {
  buildLeaderboardEntry,
  derbyConfigHash,
  writeDerbyEntry,
} from '@/lib/derbyLeaderboard'
import { verifyDerbyToken } from '@/lib/signToken'
import { getKv, kvKeys } from '@/lib/kv'
import { hitRateLimit, RATE_LIMITS } from '@/lib/rateLimit'
import { isValidRacerId, RACER_ID_COOKIE } from '@/lib/racerId'

export const runtime = 'nodejs'

// POST /api/derby/submit
//
// Accepts a Derby round result and, when it is a valid win, writes a
// leaderboard entry. Loss / timeout submissions parse fine and silent-drop
// before the KV write so a future analytics path can still see them but
// the leaderboard stays a fastest-wins-only list.
//
// Anti-cheat checks layered before the KV write:
//   1. token must verify via verifyDerbyToken (HMAC + schema)
//   2. token's nonce must still exist in KV (single-use; consumed below)
//   3. token's racerId must equal the cookie's racerId
//   4. token's configHash must match the current arena+vehicle catalog
//   5. roundTimeMs must respect the vehicle's theoreticalMinWinMs floor
//      and the arena's roundDurationMs ceiling
//
// All failures silent-drop with a 202 so a hostile probe cannot
// distinguish failures.

function silentDrop() {
  return NextResponse.json({ ok: false }, { status: 202 })
}

function getClientIp(req: NextRequest): string {
  const hdr = req.headers.get('x-forwarded-for')
  if (hdr) return hdr.split(',')[0].trim()
  return req.headers.get('x-real-ip') ?? '0.0.0.0'
}

export async function POST(req: NextRequest) {
  const racerId = req.cookies.get(RACER_ID_COOKIE)?.value
  if (!racerId || !isValidRacerId(racerId)) return silentDrop()

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return silentDrop()
  }

  const submission = DerbySubmissionSchema.safeParse(body)
  if (!submission.success) return silentDrop()

  const kv = getKv()
  const ip = getClientIp(req)

  const ipRate = await hitRateLimit(kv, {
    key: kvKeys.ratelimitIp(ip),
    limit: RATE_LIMITS.burstPerMinute,
    windowSec: RATE_LIMITS.windowSec,
  })
  if (!ipRate.allowed) return silentDrop()

  const racerRate = await hitRateLimit(kv, {
    key: kvKeys.ratelimitRacer(racerId),
    limit: RATE_LIMITS.burstPerMinute,
    windowSec: RATE_LIMITS.windowSec,
  })
  if (!racerRate.allowed) return silentDrop()

  const dailyRate = await hitRateLimit(kv, {
    key: kvKeys.ratelimitDaily(ip),
    limit: RATE_LIMITS.dailyPerIp,
    windowSec: RATE_LIMITS.daySec,
  })
  if (!dailyRate.allowed) return silentDrop()

  // Verify the start token. The token pins the arena, vehicle, racerId,
  // and a configHash so a server-side catalog change retires every
  // in-flight token cleanly.
  const verified = verifyDerbyToken(submission.data.token)
  if (!verified) return silentDrop()
  if (verified.racerId !== racerId) return silentDrop()
  if (verified.vehicle !== submission.data.vehicle) return silentDrop()

  const arenaConfig = DERBY_ARENAS[verified.arena]
  if (!arenaConfig) return silentDrop()
  const expectedConfigHash = derbyConfigHash(arenaConfig)
  if (expectedConfigHash !== verified.configHash) return silentDrop()

  // One-shot nonce: del returns 1 if it existed, 0 on replay.
  const deleted = await kv.del(kvKeys.derbyToken(verified.nonce))
  if (deleted === 0) return silentDrop()

  // Bound the round time. Wins faster than the vehicle's theoretical
  // minimum or longer than the arena duration get rejected.
  const vehicleConfig = DERBY_VEHICLES[submission.data.vehicle]
  if (submission.data.roundTimeMs < vehicleConfig.theoreticalMinWinMs) {
    return silentDrop()
  }
  if (submission.data.roundTimeMs > arenaConfig.roundDurationMs + 5000) {
    return silentDrop()
  }

  // Only wins land on the leaderboard. Other outcomes are recorded as a
  // 200 ok with submitted=false so client analytics can still tell the
  // submit went through.
  if (submission.data.outcome !== 'win') {
    return NextResponse.json({ ok: true, submitted: false })
  }

  const entry = buildLeaderboardEntry({
    initials: submission.data.initials,
    roundTimeMs: submission.data.roundTimeMs,
    vehicle: submission.data.vehicle,
    scorePoints: submission.data.scorePoints,
    racerId,
    postedAt: Date.now(),
  })
  await writeDerbyEntry(kv, verified.arena, entry)

  return NextResponse.json({ ok: true, submitted: true })
}
