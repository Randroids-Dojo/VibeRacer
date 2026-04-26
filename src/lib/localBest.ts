import { z } from 'zod'
import { ReplaySchema, type Replay } from './replay'
import { CheckpointHitSchema, type CheckpointHit } from './schemas'

function bestKey(slug: string, versionHash: string): string {
  return `viberacer.best.${slug}.${versionHash}`
}

function replayKey(slug: string, versionHash: string): string {
  return `viberacer.replay.${slug}.${versionHash}`
}

function splitsKey(slug: string, versionHash: string): string {
  return `viberacer.splits.${slug}.${versionHash}`
}

const SplitsArraySchema = z.array(CheckpointHitSchema)

export function readLocalBest(slug: string, versionHash: string): number | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(bestKey(slug, versionHash))
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

export function writeLocalBest(
  slug: string,
  versionHash: string,
  lapTimeMs: number,
): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(
    bestKey(slug, versionHash),
    String(Math.round(lapTimeMs)),
  )
}

export function readLocalBestReplay(
  slug: string,
  versionHash: string,
): Replay | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(replayKey(slug, versionHash))
  if (!raw) return null
  try {
    const parsed = ReplaySchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function writeLocalBestReplay(
  slug: string,
  versionHash: string,
  replay: Replay,
): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      replayKey(slug, versionHash),
      JSON.stringify(replay),
    )
  } catch {
    // Quota exceeded or storage disabled. Ghost is a best-effort enhancement;
    // failing silently keeps the rest of the lap-complete flow working.
  }
}

// Per-PB checkpoint splits. The HUD's live "delta vs PB" tile compares the
// current lap's just-crossed checkpoint against this stored array.
export function readLocalBestSplits(
  slug: string,
  versionHash: string,
): CheckpointHit[] | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(splitsKey(slug, versionHash))
  if (!raw) return null
  try {
    const parsed = SplitsArraySchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function writeLocalBestSplits(
  slug: string,
  versionHash: string,
  hits: CheckpointHit[],
): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      splitsKey(slug, versionHash),
      JSON.stringify(hits),
    )
  } catch {
    // Splits are a best-effort UX enhancement. A quota failure should never
    // break the lap-complete flow.
  }
}
