import { ReplaySchema, type Replay } from './replay'

function bestKey(slug: string, versionHash: string): string {
  return `viberacer.best.${slug}.${versionHash}`
}

function replayKey(slug: string, versionHash: string): string {
  return `viberacer.replay.${slug}.${versionHash}`
}

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
