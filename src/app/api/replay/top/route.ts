import { NextResponse, type NextRequest } from 'next/server'
import { SlugSchema, VersionHashSchema } from '@/lib/schemas'
import { getKv, kvKeys } from '@/lib/kv'
import { ReplaySchema } from '@/lib/replay'

export const runtime = 'nodejs'

// Pure helper: pull initials out of a leaderboard zset member string. The
// member shape is `initials:racerId:ts:nonce` (mirrors `parseMember` in
// `src/lib/leaderboard.ts`); we return null on any malformed shape so the
// caller can degrade to omitting the initials from the response.
function parseTopMemberInitials(member: string | null): string | null {
  if (!member) return null
  const parts = member.split(':')
  if (parts.length < 4) return null
  const initials = parts[0]
  if (typeof initials !== 'string' || initials.length === 0) return null
  return initials
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const slug = SlugSchema.safeParse(url.searchParams.get('slug') ?? '')
  const versionHash = VersionHashSchema.safeParse(url.searchParams.get('v') ?? '')
  if (!slug.success || !versionHash.success) {
    return NextResponse.json({ error: 'invalid params' }, { status: 400 })
  }

  try {
    const kv = getKv()
    const nonce = await kv.get<string>(
      kvKeys.topReplayPointer(slug.data, versionHash.data),
    )
    if (!nonce) {
      return NextResponse.json({ error: 'no replay' }, { status: 404 })
    }

    // Upstash returns parsed JSON for values stored as JSON strings; tolerate
    // the raw-string case too in case storage drivers diverge.
    const raw = await kv.get(kvKeys.lapReplay(nonce))
    if (!raw) {
      return NextResponse.json({ error: 'no replay' }, { status: 404 })
    }
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw
    const parsed = ReplaySchema.safeParse(value)
    if (!parsed.success) {
      return NextResponse.json({ error: 'no replay' }, { status: 404 })
    }

    // Best-effort: read the leaderboard top member so the response can carry
    // the racer's initials too (used by the floating ghost-car nameplate so
    // the player knows whose lap they are chasing). Failing this lookup must
    // not break the replay response, so the entire block is wrapped in a
    // try/catch and degrades to `initials: null`. The lap time is already
    // present on the replay itself (`replay.lapTimeMs`), so we do not need
    // a parallel score lookup here.
    let initials: string | null = null
    try {
      const top = (await kv.zrange(
        kvKeys.leaderboard(slug.data, versionHash.data),
        0,
        0,
      )) as string[]
      const topMember = typeof top[0] === 'string' ? top[0] : null
      initials = parseTopMemberInitials(topMember)
    } catch {
      // KV transient failure on the leaderboard read; degrade gracefully.
      initials = null
    }

    return NextResponse.json({ ...parsed.data, initials })
  } catch {
    return NextResponse.json({ error: 'no replay' }, { status: 404 })
  }
}
