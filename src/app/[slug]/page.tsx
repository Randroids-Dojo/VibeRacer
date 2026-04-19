import { notFound } from 'next/navigation'
import { SlugSchema, VersionHashSchema } from '@/lib/schemas'
import { loadTrack } from '@/lib/loadTrack'
import { Game, type OverallRecord } from '@/components/Game'

async function loadOverallRecord(
  slug: string,
  versionHash: string,
): Promise<OverallRecord | null> {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return null
  }
  try {
    const { getKv } = await import('@/lib/kv')
    const { readLeaderboard } = await import('@/lib/leaderboard')
    const { entries } = await readLeaderboard(getKv(), slug, versionHash, 1, null)
    const top = entries[0]
    if (!top) return null
    return { initials: top.initials, lapTimeMs: top.lapTimeMs }
  } catch {
    return null
  }
}

export default async function SlugPage(ctx: {
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
  const { pieces, versionHash } = loaded
  const overallRecord = await loadOverallRecord(slug, versionHash)

  return (
    <Game
      slug={slug}
      versionHash={versionHash}
      pieces={pieces}
      initialRecord={overallRecord}
    />
  )
}
