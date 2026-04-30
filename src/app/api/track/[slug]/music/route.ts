import { createHash } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { SlugSchema } from '@/lib/schemas'
import { getKv, kvKeys } from '@/lib/kv'
import { isValidRacerId, RACER_ID_COOKIE } from '@/lib/racerId'
import { TrackMusicSchema, type TrackMusic } from '@/lib/trackMusic'

export const runtime = 'nodejs'

function tuneHash(tune: TrackMusic): string {
  const { name, seedWord, ...hashable } = tune
  void name
  void seedWord
  return createHash('sha256').update(JSON.stringify(hashable)).digest('hex')
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug: slugRaw } = await ctx.params
  const slugParsed = SlugSchema.safeParse(slugRaw)
  if (!slugParsed.success) {
    return NextResponse.json({ error: 'invalid slug' }, { status: 400 })
  }
  const slug = slugParsed.data
  const kv = getKv()
  const versionHash = await kv.get<string>(kvKeys.musicLatest(slug))
  if (!versionHash) {
    return NextResponse.json({ slug, tune: null, versions: [] })
  }

  const tune = await kv.get<TrackMusic>(kvKeys.musicVersion(slug, versionHash))
  const parsed = TrackMusicSchema.safeParse(tune)
  const versions =
    (await kv.lrange(kvKeys.musicVersions(slug), 0, 49)) ?? []

  return NextResponse.json({
    slug,
    versionHash,
    tune: parsed.success ? parsed.data : null,
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

  const parsed = TrackMusicSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid tune' }, { status: 400 })
  }

  const tune = parsed.data
  const hash = tuneHash(tune)
  const createdAt = new Date().toISOString()

  try {
    const kv = getKv()
    await Promise.all([
      kv.set(kvKeys.musicVersion(slug, hash), JSON.stringify(tune)),
      kv.set(kvKeys.musicLatest(slug), hash),
      kv.lpush(kvKeys.musicVersions(slug), JSON.stringify({ hash, createdAt })),
    ])
  } catch (e) {
    console.error('Failed to persist track music', e)
    return NextResponse.json(
      { error: 'storage unavailable', reason: 'temporary storage failure' },
      { status: 503 },
    )
  }

  return NextResponse.json({ slug, versionHash: hash, createdAt })
}
