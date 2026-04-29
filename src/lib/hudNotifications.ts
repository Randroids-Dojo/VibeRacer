export interface HudNotificationEntry<T = unknown> {
  id: string
  priority: number
  createdAtMs: number
  payload: T
}

export function selectHudNotificationStack<T>(
  entries: readonly HudNotificationEntry<T>[],
  slots = 2,
): HudNotificationEntry<T>[] {
  if (!Number.isFinite(slots) || slots <= 0) return []
  return [...entries]
    .filter((entry) => Number.isFinite(entry.priority))
    .sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority
      if (a.createdAtMs !== b.createdAtMs) return b.createdAtMs - a.createdAtMs
      return a.id.localeCompare(b.id)
    })
    .slice(0, Math.floor(slots))
}
