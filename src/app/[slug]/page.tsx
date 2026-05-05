import { notFound } from 'next/navigation'
import { SlugSchema, VersionHashSchema } from '@/lib/schemas'
import { hasKvConfigured } from '@/lib/kv'
import { loadTrack } from '@/lib/loadTrack'
import { loadTrackMusic } from '@/lib/loadTrackMusic'
import { Game, type OverallRecord } from '@/components/Game'
import { SlugLanding } from '@/components/SlugLanding'
import { loadRecentTrackPreviewsSafe } from '@/lib/recentTracks'
import {
  parseChallengeFromSearchParams,
  type ChallengePayload,
} from '@/lib/challenge'

async function loadOverallRecord(
  slug: string,
  versionHash: string,
): Promise<OverallRecord | null> {
  if (!hasKvConfigured()) return null
  try {
    const { getKv } = await import('@/lib/kv')
    const { readLeaderboard } = await import('@/lib/leaderboard')
    const { entries } = await readLeaderboard(getKv(), slug, versionHash, 1, 0, null)
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
  if (loaded.kind === 'fresh') {
    const recent = await loadRecentTrackPreviewsSafe(slug)
    return <SlugLanding slug={slug} recent={recent} />
  }
  const {
    pieces,
    versionHash,
    checkpointCount,
    checkpoints,
    biome,
    decorations,
    mood,
    creatorTuning,
  } = loaded
  const overallRecord = await loadOverallRecord(slug, versionHash)
  const musicLoaded = await loadTrackMusic(slug)

  // Parse the friend-challenge query string here on the server so the client
  // bundle never has to. Validation is defensive: a tampered or malformed
  // challenge surfaces as null and the race falls back to the normal ghost
  // resolution flow without crashing the page.
  let challenge: ChallengePayload | null = null
  const challengeParams = new URLSearchParams()
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === 'string') challengeParams.set(k, v)
    else if (Array.isArray(v) && typeof v[0] === 'string') {
      challengeParams.set(k, v[0])
    }
  }
  challenge = parseChallengeFromSearchParams(challengeParams)

  return (
    <Game
      slug={slug}
      versionHash={versionHash}
      pieces={pieces}
      checkpointCount={checkpointCount}
      checkpoints={checkpoints}
      trackBiome={biome ?? null}
      trackDecorations={decorations ?? []}
      trackMood={mood ?? null}
      creatorTuning={creatorTuning ?? null}
      initialMusic={musicLoaded.kind === 'ok' ? musicLoaded.music : null}
      initialRecord={overallRecord}
      challenge={challenge}
    />
  )
}
