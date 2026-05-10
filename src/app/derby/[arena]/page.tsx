import { notFound } from 'next/navigation'
import { DERBY_ARENA_SLUGS, DerbyArenaSlugSchema } from '@/lib/schemas'
import { DerbyVehiclePicker } from '@/components/DerbyVehiclePicker'

// Per-arena route. Lands on the vehicle picker; once the player chooses a
// vehicle the picker hands off to the round host (DerbyRound) added in
// slice 7. The arena catalog is baked into code so the route is fully
// static; visits to other slugs hit notFound().

export default async function DerbyArenaPage(ctx: {
  params: Promise<{ arena: string }>
}) {
  const { arena } = await ctx.params
  const parsed = DerbyArenaSlugSchema.safeParse(arena)
  if (!parsed.success) notFound()
  return <DerbyVehiclePicker arenaSlug={parsed.data} />
}

export async function generateStaticParams() {
  return DERBY_ARENA_SLUGS.map((arena) => ({ arena }))
}
