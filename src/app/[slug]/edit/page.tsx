import { notFound } from 'next/navigation'
import { SlugSchema } from '@/lib/schemas'
import { loadLatestTrack } from '@/lib/loadTrack'
import { TrackEditor } from '@/components/TrackEditor'

export default async function EditPage(ctx: { params: Promise<{ slug: string }> }) {
  const { slug: raw } = await ctx.params
  const parsed = SlugSchema.safeParse(raw)
  if (!parsed.success) notFound()
  const slug = parsed.data
  const { pieces } = await loadLatestTrack(slug)

  return <TrackEditor slug={slug} initialPieces={pieces} />
}
