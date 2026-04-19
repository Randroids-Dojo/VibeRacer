import { NextResponse, type NextRequest } from 'next/server'
import { SlugSchema, VersionHashSchema } from '@/lib/schemas'
import { getKv } from '@/lib/kv'
import { RACER_ID_COOKIE, isValidRacerId } from '@/lib/racerId'
import {
  readLeaderboard,
  LEADERBOARD_DEFAULT_LIMIT,
  LEADERBOARD_MAX_LIMIT,
  type LeaderboardResponse,
} from '@/lib/leaderboard'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const slug = SlugSchema.safeParse(url.searchParams.get('slug') ?? '')
  const versionHash = VersionHashSchema.safeParse(url.searchParams.get('v') ?? '')
  if (!slug.success || !versionHash.success) {
    return NextResponse.json({ error: 'invalid params' }, { status: 400 })
  }

  const limitRaw = Number(
    url.searchParams.get('limit') ?? LEADERBOARD_DEFAULT_LIMIT,
  )
  const limit = Number.isFinite(limitRaw)
    ? Math.min(LEADERBOARD_MAX_LIMIT, Math.max(1, Math.trunc(limitRaw)))
    : LEADERBOARD_DEFAULT_LIMIT

  const cookieRacerId = req.cookies.get(RACER_ID_COOKIE)?.value
  const myRacerId =
    cookieRacerId && isValidRacerId(cookieRacerId) ? cookieRacerId : null

  try {
    const { entries, meBestRank } = await readLeaderboard(
      getKv(),
      slug.data,
      versionHash.data,
      limit,
      myRacerId,
    )
    return NextResponse.json<LeaderboardResponse>({
      slug: slug.data,
      versionHash: versionHash.data,
      entries,
      meBestRank,
    })
  } catch {
    return NextResponse.json<LeaderboardResponse>({
      slug: slug.data,
      versionHash: versionHash.data,
      entries: [],
      meBestRank: null,
    })
  }
}
