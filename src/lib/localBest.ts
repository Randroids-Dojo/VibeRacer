function bestKey(slug: string, versionHash: string): string {
  return `viberacer.best.${slug}.${versionHash}`
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
