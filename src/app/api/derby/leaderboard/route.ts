import { NextResponse, type NextRequest } from 'next/server'
import { DerbyArenaSlugSchema } from '@/lib/schemas'
import {
  DERBY_LEADERBOARD_DEFAULT_LIMIT,
  readDerbyLeaderboard,
} from '@/lib/derbyLeaderboard'
import { getKv, hasKvConfigured } from '@/lib/kv'

export const runtime = 'nodejs'

// GET /api/derby/leaderboard?arena=<slug>[&limit=&offset=]
//
// Returns the per-arena fastest-time-to-win leaderboard. Single board per
// arena (all four vehicles compete on the same time list); vehicle is
// shown next to each entry as info only. Query is read-only and safely
// returns an empty list when KV is not configured so the hub still
// renders during local development.

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const arenaRaw = url.searchParams.get('arena') ?? ''
  const arena = DerbyArenaSlugSchema.safeParse(arenaRaw)
  if (!arena.success) {
    return NextResponse.json({ error: 'invalid arena' }, { status: 400 })
  }

  const limit = clampNumber(
    url.searchParams.get('limit'),
    DERBY_LEADERBOARD_DEFAULT_LIMIT,
  )
  const offset = clampNumber(url.searchParams.get('offset'), 0)

  if (!hasKvConfigured()) {
    return NextResponse.json({ entries: [], total: 0 })
  }

  try {
    const result = await readDerbyLeaderboard(getKv(), arena.data, limit, offset)
    return NextResponse.json(result)
  } catch (err) {
    console.error('[derby/leaderboard] read failed:', err)
    return NextResponse.json({ entries: [], total: 0 })
  }
}

function clampNumber(raw: string | null, fallback: number): number {
  if (raw === null) return fallback
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}
