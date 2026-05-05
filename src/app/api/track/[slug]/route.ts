import { NextResponse, type NextRequest } from 'next/server'
import {
  SlugSchema,
  VersionHashSchema,
  TrackSchema,
  type Piece,
  type TrackVersion,
} from '@/lib/schemas'
import { hashTrack } from '@/lib/hashTrack'
import { validateClosedLoop } from '@/game/track'
import { getKv, kvKeys } from '@/lib/kv'
import { isValidRacerId, RACER_ID_COOKIE } from '@/lib/racerId'
import {
  Stage1NonProjectableError,
  assertAllPiecesV1Projectable,
  convertV1Pieces,
} from '@/lib/trackVersion'

export const runtime = 'nodejs'

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug: slugRaw } = await ctx.params
  const slugParsed = SlugSchema.safeParse(slugRaw)
  if (!slugParsed.success) {
    return NextResponse.json({ error: 'invalid slug' }, { status: 400 })
  }
  const slug = slugParsed.data

  const url = new URL(req.url)
  const vRaw = url.searchParams.get('v')
  const kv = getKv()

  let versionHash: string | null
  if (vRaw) {
    const parsed = VersionHashSchema.safeParse(vRaw)
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid version' }, { status: 400 })
    }
    versionHash = parsed.data
  } else {
    versionHash = await kv.get<string>(kvKeys.trackLatest(slug))
  }

  if (!versionHash) {
    return NextResponse.json({ slug, track: null, versions: [] })
  }

  const version = await kv.get<TrackVersion>(
    kvKeys.trackVersion(slug, versionHash),
  )
  const versions =
    (await kv.lrange(kvKeys.trackVersions(slug), 0, 49)) ?? []

  return NextResponse.json({
    slug,
    versionHash,
    track: version,
    versions: versions.map((raw) => {
      try {
        return JSON.parse(raw) as { hash: string; createdAt: string }
      } catch {
        return null
      }
    }).filter(Boolean),
  })
}

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug: slugRaw } = await ctx.params
  const slugParsed = SlugSchema.safeParse(slugRaw)
  if (!slugParsed.success) {
    return NextResponse.json({ error: 'invalid slug' }, { status: 400 })
  }
  const slug = slugParsed.data

  const racerId = req.cookies.get(RACER_ID_COOKIE)?.value
  if (!racerId || !isValidRacerId(racerId)) {
    return NextResponse.json({ error: 'no racer' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const track = TrackSchema.safeParse(body)
  if (!track.success) {
    return NextResponse.json({ error: 'invalid track' }, { status: 400 })
  }

  // Stage 1 boundary: reject continuous-angle pieces until Stage 2 rewires
  // the runtime pipeline to consume `transform.theta` directly. The
  // converter populates `transform` and projects cells from transform when
  // v1-projectable; assertAllPiecesV1Projectable then refuses any piece
  // whose transform sits off the integer grid.
  const populated = convertV1Pieces(track.data.pieces) as Piece[]
  try {
    assertAllPiecesV1Projectable(populated)
  } catch (err) {
    if (err instanceof Stage1NonProjectableError) {
      return NextResponse.json(
        { error: 'unsupported transform', reason: err.message },
        { status: 400 },
      )
    }
    throw err
  }

  const loop = validateClosedLoop(populated)
  if (!loop.ok) {
    return NextResponse.json(
      { error: 'invalid loop', reason: loop.reason },
      { status: 400 },
    )
  }

  const hash = hashTrack(
    populated,
    track.data.checkpointCount,
    track.data.checkpoints,
  )
  const createdAt = new Date().toISOString()
  // Drop a `mood` object that has no concrete fields so we never persist a
  // useless empty record into KV.
  const moodOut =
    track.data.mood &&
    (track.data.mood.timeOfDay !== undefined ||
      track.data.mood.weather !== undefined)
      ? track.data.mood
      : undefined
  const version: TrackVersion = {
    pieces: populated,
    ...(track.data.checkpointCount !== undefined
      ? { checkpointCount: track.data.checkpointCount }
      : {}),
    ...(track.data.checkpoints !== undefined
      ? { checkpoints: track.data.checkpoints }
      : {}),
    ...(moodOut !== undefined ? { mood: moodOut } : {}),
    ...(track.data.biome !== undefined ? { biome: track.data.biome } : {}),
    ...(track.data.decorations !== undefined && track.data.decorations.length > 0
      ? { decorations: track.data.decorations }
      : {}),
    ...(track.data.creatorTuning !== undefined
      ? { creatorTuning: track.data.creatorTuning }
      : {}),
    createdByRacerId: racerId,
    createdAt,
  }

  try {
    const kv = getKv()
    await Promise.all([
      kv.set(kvKeys.trackVersion(slug, hash), JSON.stringify(version)),
      kv.set(kvKeys.trackLatest(slug), hash),
      kv.lpush(
        kvKeys.trackVersions(slug),
        JSON.stringify({ hash, createdAt }),
      ),
      kv.zadd(kvKeys.trackIndex(), {
        score: Date.now(),
        member: slug,
      }),
    ])
  } catch (e) {
    console.error('Failed to persist track version', e)
    return NextResponse.json(
      { error: 'storage unavailable', reason: 'temporary storage failure' },
      { status: 503 },
    )
  }

  return NextResponse.json({ slug, versionHash: hash, createdAt })
}
