import type { Replay } from '@/lib/replay'
import { REPLAY_SAMPLE_MS } from '@/lib/replay'

// Live ghost gap: how far ahead of (or behind) the active ghost the player is
// in time. Computed every frame by finding the replay sample whose recorded
// position is nearest the player's current world position, then comparing the
// player's elapsed lap time to that sample's recorded time.
//
// Negative gap = player is AHEAD (you reached this point earlier than the
// ghost did at the same lap-time mark). Positive gap = BEHIND.
//
// The chip pairs with the existing ghost car: when you can see the ghost, the
// chip tells you the time delta you would need to make up (or hold) to match
// the lap that produced it.

// Time-units. Mirrors the rounding convention used by the split tile so the
// chip never reads as more precise than the underlying replay sample period.
export const GHOST_GAP_DISPLAY_MS_FLOOR = 0

// Search-window radius (in samples) around a hint index. Walking the entire
// replay every frame would be O(N) per frame; a hinted windowed search is
// O(W) and survives sharp turns by widening to the full pool when nothing
// nearby beats the hint sample's distance.
export const GHOST_GAP_DEFAULT_WINDOW_SAMPLES = 12

// Maximum displacement (world units squared) we count as "near" the ghost
// trail. When the player drifts farther off-course than this, the gap chip
// hides rather than locking onto a stale sample halfway across the map.
// `8 * 8` keeps the chip live within roughly one track-width-and-a-bit; far
// enough to survive a wide drift but not so far that an off-track excursion
// snaps to a meaningless sample.
export const GHOST_GAP_MAX_NEAR_DIST_SQ = 64

export interface GhostGapResult {
  // Signed milliseconds the player is ahead of (negative) or behind (positive)
  // the ghost at the player's current world position. Rounded to whole ms so
  // the throttled HUD bail-out is stable across frames.
  gapMs: number
  // The replay sample index used to compute the gap. Pass back as `hintIdx`
  // on the next frame so the windowed search starts near the correct place.
  sampleIdx: number
}

// Find the replay sample index whose recorded (x, z) is nearest the supplied
// world position. Uses a windowed search around `hintIdx` (default 12 samples
// each side) to keep per-frame work O(W) instead of O(N). Returns the absolute
// best sample within the window. When the window is empty (degenerate replay
// or out-of-range hint) returns -1 so the caller can drop the result.
export function findClosestSampleIdx(
  replay: Replay,
  x: number,
  z: number,
  hintIdx: number = 0,
  windowSamples: number = GHOST_GAP_DEFAULT_WINDOW_SAMPLES,
): number {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return -1
  const samples = replay.samples
  const n = samples.length
  if (n === 0) return -1
  // Defensive clamping: a stray hint outside the array still searches inside
  // the array, just centered at the nearest legal index.
  const safeHint = Number.isFinite(hintIdx) ? hintIdx : 0
  const clampedHint = Math.min(Math.max(Math.floor(safeHint), 0), n - 1)
  const safeWindow = Number.isFinite(windowSamples) ? windowSamples : 0
  const w = Math.max(0, Math.floor(safeWindow))
  const lo = Math.max(0, clampedHint - w)
  const hi = Math.min(n - 1, clampedHint + w)
  let bestIdx = lo
  let bestDistSq = Infinity
  for (let i = lo; i <= hi; i++) {
    const [sx, , sz] = samples[i]
    const dx = sx - x
    const dz = sz - z
    const d = dx * dx + dz * dz
    if (d < bestDistSq) {
      bestDistSq = d
      bestIdx = i
    }
  }
  return bestIdx
}

// Compute the live ghost gap. Walks the replay samples to find the one whose
// (x, z) is closest to (`playerX`, `playerZ`), then derives the time-at-that-
// sample (`sampleIdx * REPLAY_SAMPLE_MS`) and returns `playerLapMs - tAtSample`.
// Negative = ahead, positive = behind, 0 = matched.
//
// Returns null when:
//   - the replay is empty or invalid,
//   - the player is too far from the ghost trail (chip would lock onto a
//     stale sample),
//   - any of the inputs is non-finite or the player has not started the lap
//     yet (`playerLapMs <= 0` is treated as "no measurement yet").
export function ghostGapMs(
  replay: Replay | null,
  playerX: number,
  playerZ: number,
  playerLapMs: number,
  hintIdx?: number,
  options?: { maxNearDistSq?: number; windowSamples?: number },
): GhostGapResult | null {
  if (!replay) return null
  if (!Number.isFinite(playerX) || !Number.isFinite(playerZ)) return null
  if (!Number.isFinite(playerLapMs) || playerLapMs < 0) return null
  const samples = replay.samples
  if (samples.length === 0) return null
  const maxNearDistSq = options?.maxNearDistSq ?? GHOST_GAP_MAX_NEAR_DIST_SQ
  const windowSamples = options?.windowSamples ?? GHOST_GAP_DEFAULT_WINDOW_SAMPLES
  const idx = findClosestSampleIdx(
    replay,
    playerX,
    playerZ,
    hintIdx ?? 0,
    windowSamples,
  )
  if (idx < 0) return null
  const [sx, , sz] = samples[idx]
  const dx = sx - playerX
  const dz = sz - playerZ
  if (dx * dx + dz * dz > maxNearDistSq) return null
  const sampleTimeMs = idx * REPLAY_SAMPLE_MS
  const gapMs = Math.round(playerLapMs - sampleTimeMs)
  return { gapMs, sampleIdx: idx }
}

// Format a signed ghost-gap delta as a HUD-ready string. Mirrors
// `formatSplitDelta` exactly so the visual language across the two chips
// matches: always sign + 3 decimal seconds (e.g. "+0.421", "-1.034"). 0 reads
// as "+0.000" so the chip is never just a sign-less number. Returns null on
// non-finite input so the caller can hide the chip cleanly rather than
// rendering garbage.
export function formatGhostGap(gapMs: number | null): string | null {
  if (gapMs === null) return null
  if (!Number.isFinite(gapMs)) return null
  const sign = gapMs > 0 ? '+' : gapMs < 0 ? '-' : '+'
  const abs = Math.abs(gapMs)
  const seconds = Math.floor(abs / 1000)
  const millis = Math.round(abs % 1000)
  // Guard the millis rounding case where 999.5 ms rounds to 1000.
  const adjSeconds = millis === 1000 ? seconds + 1 : seconds
  const adjMillis = millis === 1000 ? 0 : millis
  return `${sign}${adjSeconds}.${String(adjMillis).padStart(3, '0')}`
}
