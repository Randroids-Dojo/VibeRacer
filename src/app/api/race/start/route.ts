import { NextResponse, type NextRequest } from 'next/server'
import { randomBytes } from 'node:crypto'
import { SlugSchema, VersionHashSchema, type RaceTokenPayload } from '@/lib/schemas'
import { signRaceToken } from '@/lib/signToken'
import { getKv, kvKeys, TTL } from '@/lib/kv'
import { isValidRacerId, RACER_ID_COOKIE } from '@/lib/racerId'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const url = new URL(req.url)
  const slugRaw = url.searchParams.get('slug') ?? ''
  const vRaw = url.searchParams.get('v') ?? ''

  const slug = SlugSchema.safeParse(slugRaw)
  const versionHash = VersionHashSchema.safeParse(vRaw)
  if (!slug.success || !versionHash.success) {
    return NextResponse.json({ error: 'invalid params' }, { status: 400 })
  }

  const racerId = req.cookies.get(RACER_ID_COOKIE)?.value
  if (!racerId || !isValidRacerId(racerId)) {
    return NextResponse.json({ error: 'no racer' }, { status: 401 })
  }

  const nonce = randomBytes(16).toString('hex')
  const issuedAt = Date.now()

  const payload: RaceTokenPayload = {
    slug: slug.data,
    versionHash: versionHash.data,
    nonce,
    issuedAt,
    racerId,
  }

  const token = signRaceToken(payload)

  await getKv().set(
    kvKeys.raceToken(nonce),
    JSON.stringify({
      slug: slug.data,
      versionHash: versionHash.data,
      racerId,
      issuedAt,
    }),
    { ex: TTL.raceTokenSec },
  )

  return NextResponse.json({ token, nonce, issuedAt })
}
