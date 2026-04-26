/**
 * Pure helpers that format the post-submit lap toast text shown in the HUD's
 * toast lane. The race-flow already surfaces a transient toast on every lap
 * completion ("lap N saved" / "NEW PB!" / "NEW RECORD!"); after the server
 * accepts the submission it returns the lap's leaderboard rank and the board
 * size so the toast can upgrade in place to include where the player landed.
 *
 * Keeping the formatting pure makes it trivial to unit test and keeps the
 * Game component focused on wiring rather than string juggling.
 */

import type { ToastKind } from '@/components/Game'

export interface LapRankInfo {
  /** 1-indexed position of the just-submitted lap on the (slug, version) leaderboard. */
  rank: number
  /** Total number of entries on the (slug, version) leaderboard after this submit. */
  boardSize: number
}

/**
 * Returns true when the rank info is structurally valid. Defensive against a
 * server response that omitted the fields (older client surface) or that
 * shipped a degenerate value (zero, negative, fractional, non-finite).
 */
export function isLapRankInfo(value: unknown): value is LapRankInfo {
  if (!value || typeof value !== 'object') return false
  const v = value as { rank?: unknown; boardSize?: unknown }
  if (typeof v.rank !== 'number' || !Number.isFinite(v.rank)) return false
  if (!Number.isInteger(v.rank) || v.rank < 1) return false
  if (typeof v.boardSize !== 'number' || !Number.isFinite(v.boardSize)) {
    return false
  }
  if (!Number.isInteger(v.boardSize) || v.boardSize < 1) return false
  if (v.rank > v.boardSize) return false
  return true
}

/**
 * Formats the rank suffix as a compact `#R / B` string (e.g. `#3 / 47`). The
 * spaces around the slash improve readability inside the existing single-line
 * toast and avoid getting confused with a fraction.
 */
export function formatRankSuffix(info: LapRankInfo): string {
  return `#${info.rank} / ${info.boardSize}`
}

/**
 * Builds the upgraded toast text for a lap whose server submission has just
 * landed. The base toast (`baseToast`) is the same string the lap-complete
 * branch wrote into HudState ("lap N saved" / "NEW PB!" / "NEW RECORD!"). The
 * rank suffix is appended after a separator so the original celebratory
 * phrasing remains the dominant element. When `info` is missing or invalid
 * the base toast is returned unchanged so older API clients (or a server
 * outage) never blank the lane.
 *
 * `kind` is the toast's classification; for `'record'` the rank is always #1
 * by definition so we omit the suffix to avoid redundancy.
 */
export function buildToastWithRank(
  baseToast: string,
  kind: ToastKind | null,
  info: LapRankInfo | null | undefined,
): string {
  if (!baseToast) return baseToast
  if (kind === 'record') return baseToast
  if (!isLapRankInfo(info)) return baseToast
  return `${baseToast} · ${formatRankSuffix(info)}`
}
