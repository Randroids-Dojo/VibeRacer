import { notFound } from 'next/navigation'
import { SlugSchema, type Piece } from '@/lib/schemas'
import { loadTrack } from '@/lib/loadTrack'
import { TrackEditor } from '@/components/TrackEditor'

export default async function EditPage(ctx: { params: Promise<{ slug: string }> }) {
  const { slug: raw } = await ctx.params
  const parsed = SlugSchema.safeParse(raw)
  if (!parsed.success) notFound()
  const slug = parsed.data
  const loaded = await loadTrack(slug)
  if (loaded.kind === 'notFound') notFound()
  const initialPieces: Piece[] = loaded.kind === 'fresh' ? [] : loaded.pieces

  return <TrackEditor slug={slug} initialPieces={initialPieces} />
}
