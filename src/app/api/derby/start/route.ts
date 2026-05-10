import { NextResponse, type NextRequest } from 'next/server'
import { randomBytes } from 'node:crypto'
import {
  DerbyArenaSlugSchema,
  DerbyVehicleTypeSchema,
  type DerbyTokenPayload,
} from '@/lib/schemas'
import { DERBY_ARENAS } from '@/lib/derbyArenas'
import { derbyConfigHash } from '@/lib/derbyLeaderboard'
import { signDerbyToken } from '@/lib/signToken'
import { getKv, kvKeys, TTL } from '@/lib/kv'
import { isValidRacerId, RACER_ID_COOKIE } from '@/lib/racerId'

export const runtime = 'nodejs'

// POST /api/derby/start?arena=<slug>&vehicle=<type>
//
// Mints a single-use, signed start token for a Derby round. Stores the
// nonce in KV with the round-token TTL so the submit route can claim it
// once and then forget. Failure modes return JSON with explicit error
// codes the client can switch on.
export async function POST(req: NextRequest) {
  const url = new URL(req.url)
  const arenaRaw = url.searchParams.get('arena') ?? ''
  const vehicleRaw = url.searchParams.get('vehicle') ?? ''

  const arena = DerbyArenaSlugSchema.safeParse(arenaRaw)
  const vehicle = DerbyVehicleTypeSchema.safeParse(vehicleRaw)
  if (!arena.success || !vehicle.success) {
    return NextResponse.json({ error: 'invalid params' }, { status: 400 })
  }

  const racerId = req.cookies.get(RACER_ID_COOKIE)?.value
  if (!racerId || !isValidRacerId(racerId)) {
    return NextResponse.json({ error: 'no racer' }, { status: 401 })
  }

  const arenaConfig = DERBY_ARENAS[arena.data]
  const configHash = derbyConfigHash(arenaConfig)

  const nonce = randomBytes(16).toString('hex')
  const issuedAt = Date.now()

  const payload: DerbyTokenPayload = {
    arena: arena.data,
    vehicle: vehicle.data,
    nonce,
    issuedAt,
    racerId,
    configHash,
  }

  const token = signDerbyToken(payload)

  try {
    await getKv().set(
      kvKeys.derbyToken(nonce),
      JSON.stringify({
        arena: arena.data,
        vehicle: vehicle.data,
        racerId,
        issuedAt,
        configHash,
      }),
      { ex: TTL.derbyTokenSec },
    )
  } catch (err) {
    // Without the nonce in KV the submit route would silent-drop, leaving
    // the client with a token it can never redeem. Surface a 503 so the
    // client can retry instead of running a doomed round.
    console.error('[derby/start] kv set failed:', err)
    return NextResponse.json({ error: 'kv unavailable' }, { status: 503 })
  }

  return NextResponse.json({
    token,
    nonce,
    issuedAt,
    arena: arena.data,
    vehicle: vehicle.data,
    configHash,
  })
}
