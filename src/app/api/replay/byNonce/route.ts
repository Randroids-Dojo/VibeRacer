import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { SlugSchema, VersionHashSchema } from '@/lib/schemas'
import { getKv, kvKeys } from '@/lib/kv'
import { ReplaySchema } from '@/lib/replay'

export const runtime = 'nodejs'

// Race-token nonces are 16 random bytes encoded as lowercase hex (see
// src/app/api/race/start/route.ts). Validate here so a malformed nonce in a
// crafted URL never reaches the KV layer.
const NonceSchema = z.string().regex(/^[a-f0-9]{32}$/)

// GET /api/replay/byNonce?slug=X&v=HASH&nonce=N
//
// Resolves a specific lap replay by nonce. Used by the friend-challenge flow
// (see src/lib/challenge.ts): the sharer's pause-menu Challenge button puts
// the nonce of their PB lap into a URL; opening that URL fetches that exact
// replay so the recipient races the sender's ghost rather than the leaderboard
// top. Slug + version hash are required in the URL so a bad / mismatched lap
// (e.g. someone hand-edits the nonce) is impossible to surface as a ghost on
// the wrong track.
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const slug = SlugSchema.safeParse(url.searchParams.get('slug') ?? '')
  const versionHash = VersionHashSchema.safeParse(url.searchParams.get('v') ?? '')
  const nonce = NonceSchema.safeParse(url.searchParams.get('nonce') ?? '')
  if (!slug.success || !versionHash.success || !nonce.success) {
    return NextResponse.json({ error: 'invalid params' }, { status: 400 })
  }

  try {
    const kv = getKv()
    const raw = await kv.get(kvKeys.lapReplay(nonce.data))
    if (!raw) {
      return NextResponse.json({ error: 'no replay' }, { status: 404 })
    }
    // Upstash returns parsed JSON for values stored as JSON strings; tolerate
    // the raw-string case too in case storage drivers diverge.
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw
    const parsed = ReplaySchema.safeParse(value)
    if (!parsed.success) {
      return NextResponse.json({ error: 'no replay' }, { status: 404 })
    }
    return NextResponse.json(parsed.data)
  } catch {
    return NextResponse.json({ error: 'no replay' }, { status: 404 })
  }
}
