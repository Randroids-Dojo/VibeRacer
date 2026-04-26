/**
 * Pure helpers that map a session's lap history into the geometry needed to
 * draw a small lap-time line chart. Kept separate from `lapHistory.ts` so the
 * data model stays clean and the rendering helpers stay testable in
 * isolation.
 *
 * Coordinate convention: SVG-style. Origin is top-left, +y points DOWN.
 * Faster laps (lower time) get a HIGHER bar (smaller y), so the chart reads
 * "higher is better" the way racers expect.
 */

import type { LapHistoryEntry } from './lapHistory'

export interface LapChartPoint {
  // Source lap entry the point was derived from. Carries the lap number,
  // raw time, and PB flag so the renderer can label individual ticks.
  entry: LapHistoryEntry
  // Pixel-space coordinates inside the chart's drawing area. (0, 0) is the
  // top-left corner, (width, height) is the bottom-right corner. Single-lap
  // sessions get x = width / 2 so the lone tick sits centered.
  x: number
  y: number
}

export interface LapChartGeometry {
  // Per-lap markers in input order.
  points: LapChartPoint[]
  // y for the best lap (gold reference line). Null when history is empty.
  bestY: number | null
  // y for the average lap (dashed reference line). Null when history is
  // empty.
  averageY: number | null
  // Domain of the y-axis: the slowest and fastest lap times in ms. Useful
  // for axis labels above the chart. Null when history is empty.
  slowestMs: number | null
  fastestMs: number | null
}

export interface LapChartOptions {
  width: number
  height: number
  // Vertical padding inside the drawing area so the best / worst markers
  // never sit flush against the top / bottom edge. Defaults to 6 px.
  padY?: number
}

/**
 * Build the SVG-space geometry for a lap-time chart. Pure: same inputs always
 * produce the same outputs and no DOM is touched.
 *
 * Empty history short-circuits to a no-op geometry (empty points + null
 * stats). Single-entry history places the lone tick at the horizontal center
 * and at the vertical center of the inner band; without two distinct times
 * the y-domain is degenerate, so a midline read avoids divide-by-zero
 * artifacts.
 *
 * Non-finite or non-positive lap times are skipped so a corrupt entry can
 * never poison the chart geometry.
 */
export function buildLapChartGeometry(
  history: readonly LapHistoryEntry[],
  options: LapChartOptions,
): LapChartGeometry {
  const { width, height } = options
  const padY = options.padY ?? 6
  const empty: LapChartGeometry = {
    points: [],
    bestY: null,
    averageY: null,
    slowestMs: null,
    fastestMs: null,
  }
  if (!Number.isFinite(width) || !Number.isFinite(height)) return empty
  if (width <= 0 || height <= 0) return empty
  // Filter out any entry whose lap time is non-finite or non-positive so the
  // domain math below cannot produce NaN. The original entry order is
  // preserved for the surviving rows.
  const valid: LapHistoryEntry[] = []
  for (const entry of history) {
    if (!Number.isFinite(entry.lapTimeMs)) continue
    if (entry.lapTimeMs <= 0) continue
    valid.push(entry)
  }
  if (valid.length === 0) return empty

  let fastestMs = valid[0].lapTimeMs
  let slowestMs = valid[0].lapTimeMs
  let totalMs = 0
  for (const entry of valid) {
    if (entry.lapTimeMs < fastestMs) fastestMs = entry.lapTimeMs
    if (entry.lapTimeMs > slowestMs) slowestMs = entry.lapTimeMs
    totalMs += entry.lapTimeMs
  }
  const averageMs = totalMs / valid.length
  const innerTop = padY
  const innerBottom = height - padY
  const innerHeight = Math.max(1, innerBottom - innerTop)
  const yForTime = (ms: number): number => {
    if (slowestMs === fastestMs) {
      // Degenerate domain: every lap is the same time. Center the line
      // vertically so the reader sees a stable baseline rather than a
      // collapsed sliver.
      return innerTop + innerHeight / 2
    }
    const ratio = (ms - fastestMs) / (slowestMs - fastestMs)
    return innerTop + ratio * innerHeight
  }
  const points: LapChartPoint[] = []
  if (valid.length === 1) {
    points.push({ entry: valid[0], x: width / 2, y: yForTime(valid[0].lapTimeMs) })
  } else {
    const stride = width / (valid.length - 1)
    for (let i = 0; i < valid.length; i++) {
      points.push({ entry: valid[i], x: i * stride, y: yForTime(valid[i].lapTimeMs) })
    }
  }
  return {
    points,
    bestY: yForTime(fastestMs),
    averageY: yForTime(averageMs),
    slowestMs,
    fastestMs,
  }
}

/**
 * Build the SVG `points` attribute string for a polyline drawn through the
 * geometry's points in order. Returns an empty string for empty geometries
 * so the caller can render a placeholder without branching.
 */
export function pointsToPolyline(geometry: LapChartGeometry): string {
  if (geometry.points.length === 0) return ''
  const parts: string[] = []
  for (const p of geometry.points) {
    parts.push(`${formatCoord(p.x)},${formatCoord(p.y)}`)
  }
  return parts.join(' ')
}

function formatCoord(n: number): string {
  // Two decimals is plenty for SVG; trims the file size and keeps snapshot
  // tests stable across float-precision wobble.
  if (!Number.isFinite(n)) return '0'
  return Number(n.toFixed(2)).toString()
}
