import { z } from 'zod'
import { ReplaySchema, type Replay } from './replay'
import { CheckpointHitSchema, type CheckpointHit } from './schemas'
import type { SectorDuration } from '@/game/optimalLap'

function bestKey(slug: string, versionHash: string): string {
  return `viberacer.best.${slug}.${versionHash}`
}

function replayKey(slug: string, versionHash: string): string {
  return `viberacer.replay.${slug}.${versionHash}`
}

function splitsKey(slug: string, versionHash: string): string {
  return `viberacer.splits.${slug}.${versionHash}`
}

function driftBestKey(slug: string, versionHash: string): string {
  return `viberacer.driftBest.${slug}.${versionHash}`
}

function bestSectorsKey(slug: string, versionHash: string): string {
  return `viberacer.bestSectors.${slug}.${versionHash}`
}

const SplitsArraySchema = z.array(CheckpointHitSchema)

// Persisted shape mirrors SectorDuration but validates each entry so a
// hand-edited or corrupt localStorage payload can never feed the HUD a
// negative or non-finite duration.
const SectorDurationSchema = z.object({
  cpId: z.number().int().nonnegative(),
  durationMs: z.number().positive().finite(),
})
const SectorDurationsArraySchema = z.array(SectorDurationSchema)

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

// All-time best drift score for this (slug, versionHash). Persists across
// sessions in the same browser. The HUD's BEST DRIFT block compares the live
// best against this value so a fresh page load shows the true PB instead of
// just the in-memory session record.
export function readLocalBestDrift(
  slug: string,
  versionHash: string,
): number | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(driftBestKey(slug, versionHash))
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

export function writeLocalBestDrift(
  slug: string,
  versionHash: string,
  score: number,
): void {
  if (typeof window === 'undefined') return
  if (!Number.isFinite(score) || score <= 0) return
  try {
    window.localStorage.setItem(
      driftBestKey(slug, versionHash),
      String(Math.round(score)),
    )
  } catch {
    // Drift score persistence is a best-effort UX enhancement. Quota
    // exhaustion should never break the lap-complete flow.
  }
}

// Per-sector best durations for the theoretical-best ("OPTIMAL") lap HUD
// block. Stored alongside the PB lap time so a fresh page load shows the
// player's optimal lap from the very first frame instead of waiting for the
// first lap to seed it.
export function readLocalBestSectors(
  slug: string,
  versionHash: string,
): SectorDuration[] | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(bestSectorsKey(slug, versionHash))
  if (!raw) return null
  try {
    const parsed = SectorDurationsArraySchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function writeLocalBestSectors(
  slug: string,
  versionHash: string,
  sectors: readonly SectorDuration[],
): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      bestSectorsKey(slug, versionHash),
      JSON.stringify(sectors),
    )
  } catch {
    // Best-sectors persistence is a best-effort UX enhancement. A quota
    // failure should never break the lap-complete flow.
  }
}
