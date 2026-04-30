import { notFound } from 'next/navigation'
import { SlugSchema } from '@/lib/schemas'
import { loadTrackMusic } from '@/lib/loadTrackMusic'
import { MusicEditor } from '@/components/MusicEditor'

export const metadata = {
  title: 'Tune Editor',
}

export default async function MusicEditorPage(ctx: {
  params: Promise<{ slug: string }>
}) {
  const { slug: raw } = await ctx.params
  const parsed = SlugSchema.safeParse(raw)
  if (!parsed.success) notFound()
  const slug = parsed.data
  const loaded = await loadTrackMusic(slug)
  return (
    <MusicEditor
      slug={slug}
      initialMusic={loaded.kind === 'ok' ? loaded.music : null}
    />
  )
}
