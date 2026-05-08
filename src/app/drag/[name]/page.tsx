import { notFound } from 'next/navigation'
import { DRAG_STRIP_SLUGS, DragStripSlugSchema } from '@/lib/dragStrips'
import { DragRace } from '@/components/DragRace'

export const dynamic = 'force-dynamic'

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
