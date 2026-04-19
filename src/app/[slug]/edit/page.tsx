import { notFound } from 'next/navigation'
import { SlugSchema } from '@/lib/schemas'
import { loadTrack } from '@/lib/loadTrack'
import { TrackEditor } from '@/components/TrackEditor'

export default async function EditPage(ctx: { params: Promise<{ slug: string }> }) {
  const { slug: raw } = await ctx.params
  const parsed = SlugSchema.safeParse(raw)
  if (!parsed.success) notFound()
  const slug = parsed.data
  const loaded = await loadTrack(slug)
  if (loaded.kind === 'notFound') notFound()

  return <TrackEditor slug={slug} initialPieces={loaded.pieces} />
}
