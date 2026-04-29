import { NextResponse, type NextRequest } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { SlugSchema, VersionHashSchema } from '@/lib/schemas'
import { getKv, kvKeys } from '@/lib/kv'
import { parseLeaderboardMember } from '@/lib/leaderboard'

export const runtime = 'nodejs'

const CONFIRM_REVOKE = 'revoke leaderboard member'
const ADMIN_AUDIT_LIMIT = 250

const AdminLeaderboardRequestSchema = z
  .object({
    action: z.enum(['preview', 'revoke']).default('preview'),
    slug: SlugSchema,
    versionHash: VersionHashSchema,
    member: z.string().min(1),
    reason: z.string().trim().min(3).max(500).optional(),
    confirm: z.literal(CONFIRM_REVOKE).optional(),
  })
  .strict()

function adminToken(): string | null {
  const token = process.env.LEADERBOARD_ADMIN_TOKEN
  return token && token.length >= 16 ? token : null
}

function isAuthorized(req: NextRequest, token: string): boolean {
  const header = req.headers.get('authorization')
  const prefix = 'Bearer '
  if (!header?.startsWith(prefix)) return false
  const candidate = header.slice(prefix.length)
  const expectedBuffer = Buffer.from(token)
  const candidateBuffer = Buffer.from(candidate)
  if (candidateBuffer.length !== expectedBuffer.length) return false
  return timingSafeEqual(candidateBuffer, expectedBuffer)
}

function redactedKeys(slug: string, versionHash: string, nonce: string) {
  return {
    leaderboard: kvKeys.leaderboard(slug, versionHash),
    lapMeta: kvKeys.lapMeta(nonce),
    lapReplay: kvKeys.lapReplay(nonce),
    topReplayPointer: kvKeys.topReplayPointer(slug, versionHash),
  }
}

export async function POST(req: NextRequest) {
  const token = adminToken()
  if (!token) {
    return NextResponse.json(
      { error: 'leaderboard admin is not configured' },
      { status: 503 },
    )
  }
  if (!isAuthorized(req, token)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const parsedBody = AdminLeaderboardRequestSchema.safeParse(raw)
  if (!parsedBody.success) {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const body = parsedBody.data
  const member = parseLeaderboardMember(body.member)
  if (!member) {
    return NextResponse.json({ error: 'invalid member' }, { status: 400 })
  }

  const keys = redactedKeys(body.slug, body.versionHash, member.nonce)
  if (body.action === 'preview') {
    return NextResponse.json({
      ok: true,
      action: 'preview',
      member,
      keys,
      requiredConfirm: CONFIRM_REVOKE,
    })
  }

  if (body.confirm !== CONFIRM_REVOKE || !body.reason) {
    return NextResponse.json(
      { error: 'revoke requires confirm and reason' },
      { status: 400 },
    )
  }

  const kv = getKv()
  const existingScore = await kv.zscore(keys.leaderboard, body.member)
  if (existingScore === null) {
    return NextResponse.json(
      { error: 'member not found in leaderboard' },
      { status: 404 },
    )
  }

  const topPointer = await kv.get<string>(keys.topReplayPointer)
  const shouldClearTopPointer = topPointer === member.nonce
  const keysToDelete = [keys.lapMeta, keys.lapReplay]
  if (shouldClearTopPointer) keysToDelete.push(keys.topReplayPointer)

  const removed = await kv.zrem(keys.leaderboard, body.member)
  if (removed === 0) {
    return NextResponse.json(
      { error: 'member was not removed because it no longer exists' },
      { status: 409 },
    )
  }

  const deletedKeys = await kv.del(...keysToDelete)
  await kv.lpush(
    kvKeys.leaderboardAdminAudit(),
    JSON.stringify({
      action: 'revoke',
      slug: body.slug,
      versionHash: body.versionHash,
      member: body.member,
      nonce: member.nonce,
      reason: body.reason,
      removed,
      deletedKeys,
      clearedTopReplay: shouldClearTopPointer,
      ts: new Date().toISOString(),
    }),
  )
  await kv.ltrim(kvKeys.leaderboardAdminAudit(), 0, ADMIN_AUDIT_LIMIT - 1)

  return NextResponse.json({
    ok: true,
    action: 'revoke',
    member,
    removed,
    deletedKeys,
    clearedTopReplay: shouldClearTopPointer,
  })
}
