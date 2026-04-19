import { notFound } from 'next/navigation'
import { SlugSchema, TrackVersionSchema, type Piece } from '@/lib/schemas'
import { DEFAULT_TRACK_PIECES } from '@/lib/defaultTrack'
import { TrackEditor } from '@/components/TrackEditor'

async function loadPieces(slug: string): Promise<Piece[]> {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return DEFAULT_TRACK_PIECES
  }
  try {
    const { getKv, kvKeys } = await import('@/lib/kv')
    const kv = getKv()
    const latestHash = await kv.get<string>(kvKeys.trackLatest(slug))
    if (latestHash) {
      const version = await kv.get(kvKeys.trackVersion(slug, latestHash))
      const parsed = TrackVersionSchema.safeParse(version)
      if (parsed.success) return parsed.data.pieces as Piece[]
    }
  } catch {
    // Fall through to default.
  }
  return DEFAULT_TRACK_PIECES
}

export default async function EditPage(ctx: { params: Promise<{ slug: string }> }) {
  const { slug: raw } = await ctx.params
  const parsed = SlugSchema.safeParse(raw)
  if (!parsed.success) notFound()
  const slug = parsed.data
  const pieces = await loadPieces(slug)

  return <TrackEditor slug={slug} initialPieces={pieces} />
}
