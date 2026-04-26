import { NextResponse, type NextRequest } from 'next/server'
import { randomBytes } from 'node:crypto'
import {
  SlugSchema,
  VersionHashSchema,
  SubmissionSchema,
} from '@/lib/schemas'
import { signRaceToken } from '@/lib/signToken'
import { validateLap } from '@/lib/anticheat'
import { getKv, kvKeys, TTL } from '@/lib/kv'
import { hitRateLimit, RATE_LIMITS } from '@/lib/rateLimit'
import { isValidRacerId, RACER_ID_COOKIE } from '@/lib/racerId'

export const runtime = 'nodejs'

function silentDrop() {
  return NextResponse.json({ ok: false }, { status: 202 })
}

function getClientIp(req: NextRequest): string {
  const hdr = req.headers.get('x-forwarded-for')
  if (hdr) return hdr.split(',')[0].trim()
  return req.headers.get('x-real-ip') ?? '0.0.0.0'
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url)
  const slugRaw = url.searchParams.get('slug') ?? ''
  const vRaw = url.searchParams.get('v') ?? ''
  const slug = SlugSchema.safeParse(slugRaw)
  const versionHash = VersionHashSchema.safeParse(vRaw)
  if (!slug.success || !versionHash.success) return silentDrop()

  const racerId = req.cookies.get(RACER_ID_COOKIE)?.value
  if (!racerId || !isValidRacerId(racerId)) return silentDrop()

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return silentDrop()
  }

  const submission = SubmissionSchema.safeParse(body)
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

  const validation = validateLap(
    {
      token: submission.data.token,
      slug: slug.data,
      versionHash: versionHash.data,
      checkpoints: submission.data.checkpoints,
      lapTimeMs: submission.data.lapTimeMs,
      initials: submission.data.initials,
    },
    racerId,
    Date.now(),
  )

  if (!validation.ok || !validation.payload) return silentDrop()

  const { payload } = validation

  // One-shot nonce: delete returns 1 if it existed, 0 if not (replay).
  const deleted = await kv.del(kvKeys.raceToken(payload.nonce))
  if (deleted === 0) return silentDrop()

  const ts = Date.now()
  const member = `${submission.data.initials}:${racerId}:${ts}:${payload.nonce}`

  await kv.zadd(kvKeys.leaderboard(slug.data, versionHash.data), {
    score: submission.data.lapTimeMs,
    member,
  })

  // Resolve the just-submitted lap's leaderboard position so the client can
  // surface "#R / B" inside the existing lap-saved toast. Ascending zrank
  // returns a 0-indexed position; we expose it 1-indexed to match how rank
  // reads to a player. zcard returns the total board size after this insert.
  // Both reads are best-effort: if KV is flaky we still return ok=true so the
  // local PB tracking stays unaffected.
  let submittedRank: number | null = null
  let boardSize: number | null = null
  try {
    const lbKey = kvKeys.leaderboard(slug.data, versionHash.data)
    const [zrankRaw, zcardRaw] = await Promise.all([
      kv.zrank(lbKey, member),
      kv.zcard(lbKey),
    ])
    if (typeof zrankRaw === 'number' && Number.isFinite(zrankRaw)) {
      submittedRank = zrankRaw + 1
    }
    if (typeof zcardRaw === 'number' && Number.isFinite(zcardRaw)) {
      boardSize = zcardRaw
    }
  } catch {
    submittedRank = null
    boardSize = null
  }

  // Per-lap metadata is tracked in a side-key keyed by nonce so the leaderboard
  // can show what setup the time was set with, and which input device was used.
  // Optional in the payload to keep old clients submitting (we backfill below).
  const lapMeta = {
    tuning: submission.data.tuning ?? null,
    inputMode: submission.data.inputMode ?? 'keyboard',
  }
  await kv.set(kvKeys.lapMeta(payload.nonce), JSON.stringify(lapMeta))

  if (submission.data.replay) {
    const replay = submission.data.replay
    await kv.set(kvKeys.lapReplay(payload.nonce), JSON.stringify(replay))

    // Decide whether this submission becomes the active ghost for the track.
    // Two conditions promote it: (a) it took rank 1 just now, or (b) the
    // pointer is empty because the existing top time predates this feature
    // and has no recorded replay. (b) lets a ghost appear immediately rather
    // than wait for someone to beat the legacy #1.
    const top = (await kv.zrange(
      kvKeys.leaderboard(slug.data, versionHash.data),
      0,
      0,
      { withScores: true },
    )) as (string | number)[]
    const topMember = typeof top[0] === 'string' ? top[0] : null
    const tookRankOne = topMember === member
    let promote = tookRankOne
    if (!promote) {
      const currentPointer = await kv.get<string>(
        kvKeys.topReplayPointer(slug.data, versionHash.data),
      )
      if (!currentPointer) promote = true
    }
    if (promote) {
      await kv.set(
        kvKeys.topReplayPointer(slug.data, versionHash.data),
        payload.nonce,
      )
    }
  }

  await kv.set(kvKeys.racerLastSubmit(racerId), new Date(ts).toISOString())

  // Rotate nonce for the next lap. Same slug/version/racerId, new nonce + issuedAt.
  const newNonce = randomBytes(16).toString('hex')
  const newIssuedAt = Date.now()
  await kv.set(
    kvKeys.raceToken(newNonce),
    JSON.stringify({
      slug: slug.data,
      versionHash: versionHash.data,
      racerId,
      issuedAt: newIssuedAt,
    }),
    { ex: TTL.raceTokenSec },
  )
  const newToken = signRaceToken({
    slug: slug.data,
    versionHash: versionHash.data,
    nonce: newNonce,
    issuedAt: newIssuedAt,
    racerId,
  })

  return NextResponse.json({
    ok: true,
    nextToken: newToken,
    nextNonce: newNonce,
    // The nonce that was just submitted (one-shot, already deleted from KV
    // race tokens). The replay key for this lap is `lap:replay:<submittedNonce>`
    // when a replay was uploaded. Used by the client to build a friend
    // challenge link that races recipients against this exact lap's ghost.
    submittedNonce: payload.nonce,
    // Leaderboard placement for the lap that was just stored. 1-indexed rank
    // alongside the post-insert board size so the HUD's lap-saved toast can
    // surface "#R / B". Both default to null on a KV outage so the client
    // still gets a clean 200 ok response and the lap-saved toast keeps its
    // legacy phrasing.
    submittedRank,
    boardSize,
  })
}
