import { notFound } from 'next/navigation'
import {
  SlugSchema,
  VersionHashSchema,
  type Piece,
  type TrackMood,
  type TrackTransmissionMode,
} from '@/lib/schemas'
import { loadTrack } from '@/lib/loadTrack'
import { TrackEditor } from '@/components/TrackEditor'

export default async function EditPage(ctx: {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { slug: raw } = await ctx.params
  const parsed = SlugSchema.safeParse(raw)
  if (!parsed.success) notFound()
  const slug = parsed.data

  const sp = await ctx.searchParams
  const vRaw = Array.isArray(sp.v) ? sp.v[0] : sp.v
  let requestedHash: string | null = null
  if (vRaw !== undefined) {
    const hashParsed = VersionHashSchema.safeParse(vRaw)
    if (!hashParsed.success) notFound()
    requestedHash = hashParsed.data
  }

  const loaded = await loadTrack(slug, requestedHash)
  if (loaded.kind === 'notFound') notFound()
  const initialPieces: Piece[] = loaded.kind === 'fresh' ? [] : loaded.pieces
  const initialCheckpointCount =
    loaded.kind === 'ok' ? loaded.checkpointCount : undefined
  const initialMood: TrackMood | undefined =
    loaded.kind === 'ok' ? loaded.mood : undefined
  const initialTransmission: TrackTransmissionMode =
    loaded.kind === 'ok' ? loaded.transmission : 'automatic'
  // When the editor was opened against a specific historical version, surface
  // that as a fork banner so the player understands the saved version will
  // create a new hash rather than overwrite the one they are editing.
  const forkingFromHash =
    loaded.kind === 'ok' && requestedHash !== null ? requestedHash : null

  return (
    <TrackEditor
      slug={slug}
      initialPieces={initialPieces}
      initialCheckpointCount={initialCheckpointCount}
      initialMood={initialMood}
      initialTransmission={initialTransmission}
      forkingFromHash={forkingFromHash}
    />
  )
}
