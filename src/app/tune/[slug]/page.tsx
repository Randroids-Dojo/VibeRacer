import { notFound } from 'next/navigation'
import { SlugSchema } from '@/lib/schemas'
import { loadTune } from '@/lib/loadTune'
import { TuneEditor } from '@/components/TuneEditor'

export const metadata = {
  title: 'Tune Editor',
}

export default async function TuneEditorPage(ctx: {
  params: Promise<{ slug: string }>
}) {
  const { slug: raw } = await ctx.params
  const parsed = SlugSchema.safeParse(raw)
  if (!parsed.success) notFound()
  const slug = parsed.data
  const loaded = await loadTune(slug)
  return (
    <TuneEditor
      slug={slug}
      initialTune={loaded.kind === 'ok' ? loaded.tune : null}
    />
  )
}
