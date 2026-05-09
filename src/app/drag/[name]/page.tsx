import { notFound } from 'next/navigation'
import { DRAG_STRIP_SLUGS, DragStripSlugSchema } from '@/lib/dragStrips'
import { DragRace } from '@/components/DragRace'

// The four drag strips are baked into code, so the slug shell is fully
// static. `generateStaticParams` lists all four; visits to other slugs
// hit `notFound()`. No `dynamic = 'force-dynamic'` here; that would
// override the static prerender and contradict generateStaticParams.

export default async function DragStripPage(ctx: {
  params: Promise<{ name: string }>
}) {
  const { name } = await ctx.params
  const parsed = DragStripSlugSchema.safeParse(name)
  if (!parsed.success) notFound()
  return <DragRace slug={parsed.data} />
}

export async function generateStaticParams() {
  return DRAG_STRIP_SLUGS.map((name) => ({ name }))
}
