/**
 * Pure rendering helpers for the post-run speed-trace panel. No DOM, no
 * React, just math and string output, so the SVG layer in
 * `src/components/SpeedTracePanel.tsx` stays a thin shell and the tricky
 * bits (nice-tick math, color ramp, polyline path strings) get unit tests.
 *
 * Two views ride on these helpers:
 *  - Time view: speed (m/s) vs lap time (s). Uses `niceTicks` for both axes
 *    and `buildLinePath` for the trace.
 *  - Track view: a polyline of (x, z) projected through the existing
 *    minimap geometry, with each segment colored by its sample's speed via
 *    `speedColor`.
 */

/** SVG path "d" attribute that draws no strokes. */
export const EMPTY_PATH_D = ''

interface NiceTickResult {
  /** Lower edge of the rounded range, less than or equal to `min`. */
  niceMin: number
  /** Upper edge of the rounded range, greater than or equal to `max`. */
  niceMax: number
  /** Step between adjacent ticks. Always positive. */
  step: number
  /**
   * Inclusive list of tick values in ascending order from niceMin to
   * niceMax.
   */
  values: number[]
}

/**
 * Generate a "nice" tick set for an axis given the data range [min, max] and
 * a target tick count. Picks a step from {1, 2, 5} times a power of 10 so
 * the labels read as round numbers, then snaps the range outward to the
 * nearest step. Defensive: any non-finite input or min > max collapses to a
 * unit-length range starting at 0 with five integer ticks.
 */
export function niceTicks(
  min: number,
  max: number,
  targetTicks = 5,
): NiceTickResult {
  if (
    !Number.isFinite(min) ||
    !Number.isFinite(max) ||
    !Number.isFinite(targetTicks) ||
    targetTicks < 2 ||
    min > max
  ) {
    return { niceMin: 0, niceMax: 4, step: 1, values: [0, 1, 2, 3, 4] }
  }
  if (min === max) {
    const m = min
    if (m === 0) {
      return { niceMin: 0, niceMax: 1, step: 0.25, values: [0, 0.25, 0.5, 0.75, 1] }
    }
    const half = Math.abs(m) * 0.5
    return niceTicks(m - half, m + half, targetTicks)
  }
  const ticks = Math.max(2, Math.floor(targetTicks))
  const range = max - min
  const roughStep = range / (ticks - 1)
  const exp = Math.floor(Math.log10(roughStep))
  const pow = Math.pow(10, exp)
  const norm = roughStep / pow
  let stepMul: number
  if (norm < 1.5) stepMul = 1
  else if (norm < 3) stepMul = 2
  else if (norm < 7) stepMul = 5
  else stepMul = 10
  const step = stepMul * pow
  const niceMin = Math.floor(min / step) * step
  const niceMax = Math.ceil(max / step) * step
  const values: number[] = []
  // Use multiplication instead of accumulating addition so the values land
  // on exact step multiples and survive equality compares in tests.
  const count = Math.round((niceMax - niceMin) / step)
  for (let i = 0; i <= count; i++) {
    values.push(niceMin + i * step)
  }
  return { niceMin, niceMax, step, values }
}

/**
 * Map a 0-to-1 scalar to a CSS color along a blue-to-red speed ramp. Slow =
 * blue (220deg HSL), fast = red (0deg). Clamps outside [0, 1] so a sample
 * over the param's maxSpeed reads as fully fast rather than wrapping back
 * into blue. Non-finite input falls back to neutral grey so a wonky frame
 * does not paint a black hole.
 */
export function speedColor(t: number): string {
  if (!Number.isFinite(t)) return 'hsl(0 0% 60%)'
  const c = t < 0 ? 0 : t > 1 ? 1 : t
  const hue = 220 - 220 * c
  return `hsl(${hue.toFixed(1)} 80% 50%)`
}

/**
 * Build an SVG path "d" attribute drawing a connected polyline through the
 * given (x, y) view-space points. Empty input returns an empty string so
 * the consumer can render nothing. A single point produces a "M" command
 * only (no line segment) so a one-sample telemetry blob still renders a
 * dot via stroke-linecap. The first finite point always emits the move
 * command, even when leading samples are non-finite, so a path that drops
 * a few NaN entries at the start still produces valid SVG.
 */
export function buildLinePath(points: ReadonlyArray<readonly [number, number]>): string {
  if (points.length === 0) return EMPTY_PATH_D
  let d = ''
  let hasMove = false
  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue
    d += hasMove
      ? ` L${fmt(p[0])} ${fmt(p[1])}`
      : `M${fmt(p[0])} ${fmt(p[1])}`
    hasMove = true
  }
  return d
}

/**
 * Compute the index stride needed to downsample a sample array to at most
 * `maxOut` elements. Returns 1 when no downsampling is needed (i.e.
 * `count <= maxOut`), or `ceil(count / maxOut)` otherwise. The Track view
 * uses this to bound the number of `<path>` elements (one per segment) it
 * mounts: at the upper sample bound (`MAX_REPLAY_SAMPLES = 5400`) a 1:1
 * polyline would mount thousands of SVG nodes which is slow to rasterize.
 * Defensive against non-finite or non-positive inputs.
 */
export function downsampleByStride(count: number, maxOut: number): number {
  if (!Number.isFinite(count) || !Number.isFinite(maxOut)) return 1
  if (count <= 0 || maxOut <= 0) return 1
  if (count <= maxOut) return 1
  return Math.ceil(count / maxOut)
}

/**
 * Map a sample's speed and the param's max-speed reference to the [0, 1]
 * fraction the color ramp expects. Defensive against zero / negative cap so
 * a degenerate run never divides by zero.
 */
export function speedFraction(speed: number, maxRef: number): number {
  if (!Number.isFinite(speed) || !Number.isFinite(maxRef) || maxRef <= 0) return 0
  if (speed <= 0) return 0
  if (speed >= maxRef) return 1
  return speed / maxRef
}

/** Trim trailing zeros so SVG path strings stay short. */
function fmt(n: number): string {
  return Number.parseFloat(n.toFixed(2)).toString()
}

/**
 * Format milliseconds as `m:ss.mss` (e.g. `1:04.275`). Used by the
 * per-event off-track rows on the feedback screen so the player can pinpoint
 * each excursion against the lap clock. Defensive against non-finite input.
 */
export function formatLapTime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0:00.000'
  const total = Math.round(ms)
  const minutes = Math.floor(total / 60000)
  const seconds = Math.floor((total % 60000) / 1000)
  const millis = total % 1000
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`
}

/**
 * Format a signed scalar as a fixed-decimal string with an explicit sign
 * prefix: `+0.42`, `-1.00`, `0.00`. Negative values get a minus prefix
 * (the underlying `toFixed` would have produced one for free, but pairing
 * the absolute value with an explicit sign keeps the output in lockstep
 * with the positive branch and survives a future change of digits). Zero
 * renders without a sign so a stationary stick reads as a clean `0.00`.
 * Defensive against non-finite input.
 */
export function formatSigned(n: number, digits: number): string {
  if (!Number.isFinite(n)) return '0'
  const sign = n > 0 ? '+' : n < 0 ? '-' : ''
  return `${sign}${Math.abs(n).toFixed(digits)}`
}

/**
 * Format milliseconds as a 2-decimal seconds string with the `s` suffix
 * (e.g. `0.42s`). Used for the off-track event aggregate and per-event
 * duration. Non-finite or non-positive input collapses to `0.00s`.
 */
export function formatDurationSec(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0.00s'
  return `${(ms / 1000).toFixed(2)}s`
}
