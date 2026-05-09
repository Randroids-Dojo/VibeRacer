// Centralized time-formatting helpers used by the HUD, leaderboard, lap
// history, drag mode, and feedback surfaces. Prefer importing from here
// rather than redefining a local copy in a component.

const NaN_LAP = '--:--.---'
const NaN_SECTOR = '--.---'

// `mm:ss.mmm` with zero-padded minutes. Used for circuit-mode lap times,
// leaderboard rows, lap history rows, and shared text. Returns the dashed
// placeholder when the input is non-finite or negative.
export function formatLapTime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return NaN_LAP
  const total = Math.max(0, Math.round(ms))
  const minutes = Math.floor(total / 60000)
  const seconds = Math.floor((total % 60000) / 1000)
  const millis = total % 1000
  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')
  const mmm = String(millis).padStart(3, '0')
  return `${mm}:${ss}.${mmm}`
}

// Sub-minute "s.mmm" with an automatic spillover to mm:ss.mmm above 60s.
// Used by the HUD's per-sector badges and the lap-chart sector hover so a
// short sector reads as a tiny number while a long one stays unambiguous.
export function formatSectorTime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return NaN_SECTOR
  const total = Math.max(0, Math.round(ms))
  if (total >= 60000) return formatLapTime(total)
  const seconds = Math.floor(total / 1000)
  const millis = total % 1000
  return `${seconds}.${String(millis).padStart(3, '0')}`
}

// Drag-mode finish time: seconds with two decimals, no minutes, no `s`
// suffix. Callers append the unit themselves so they can wrap the digits
// in their own typography.
export function formatDragTime(ms: number): string {
  if (!Number.isFinite(ms)) return '0.00'
  return (ms / 1000).toFixed(2)
}
