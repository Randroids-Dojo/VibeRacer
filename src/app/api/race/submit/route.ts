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

  // Per-lap metadata is tracked in a side-key keyed by nonce so the leaderboard
  // can show what setup the time was set with, and which input device was used.
  // Optional in the payload to keep old clients submitting (we backfill below).
  const lapMeta = {
    tuning: submission.data.tuning ?? null,
    inputMode: submission.data.inputMode ?? 'keyboard',
  }
  await kv.set(kvKeys.lapMeta(payload.nonce), JSON.stringify(lapMeta))

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
  })
}
