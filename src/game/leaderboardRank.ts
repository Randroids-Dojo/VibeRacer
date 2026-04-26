/**
 * Pure helpers for the leaderboard-rank HUD chip and per-track best-rank
 * tracking. The race-submit response carries `submittedRank` and `boardSize`
 * (1-indexed rank plus the post-insert board size); we classify that pair
 * into a tier (P1 / podium / topTen / topPercent / topHalf / ranked) and
 * format it as a compact badge label so the player sees where they stand on
 * the leaderboard at a glance, not just inside the transient lap-saved toast.
 *
 * Keeping the logic pure makes it trivial to unit test and keeps the HUD
 * focused on rendering. The chip is rendered alongside the existing
 * MedalBadge / NextMedalChip / StreakBadge cluster on the BEST (ALL TIME)
 * tile so the player's rank reads as another property of their PB lane.
 */

export interface LeaderboardRankInfo {
  /** 1-indexed position on the (slug, version) leaderboard. */
  rank: number
  /** Total number of entries on the (slug, version) leaderboard. */
  boardSize: number
}

// Tier ladder ordered from best to worst. The order doubles as the canonical
// render priority: when picking the most-flattering label for a rank, we walk
// the ladder top-down and stop at the first matching tier.
export const RANK_TIERS = [
  'p1',
  'podium',
  'topTen',
  'topPercent',
  'topHalf',
  'ranked',
] as const
export type RankTier = (typeof RANK_TIERS)[number]

// Friendly label displayed inside the chip. P1 stays compact; the other
// tiers get short uppercase descriptors so the chip reads like a badge.
export const RANK_TIER_LABELS: Record<RankTier, string> = {
  p1: 'P1',
  podium: 'PODIUM',
  topTen: 'TOP 10',
  topPercent: 'TOP %',
  topHalf: 'TOP HALF',
  ranked: 'RANKED',
}

// Hex accent color per tier. P1 uses the platinum cool gray (matches the
// platinum medal so the visual language reads as "best of the best"), podium
// uses the gold tone for second / third place. The remaining tiers fade
// through bronze / amber / muted gray so the chip's color tracks how
// flattering the label is.
export const RANK_TIER_COLORS: Record<RankTier, string> = {
  p1: '#c0c8d4',
  podium: '#ffd166',
  topTen: '#f0a64b',
  topPercent: '#ce8048',
  topHalf: '#a48870',
  ranked: '#9aa3b0',
}

// Description copy used for tooltips and screen reader labels. Plain
// language so a hover or aria-label tells the player exactly what the chip
// means without forcing them to learn the tier names.
export const RANK_TIER_DESCRIPTIONS: Record<RankTier, string> = {
  p1: 'Track record holder.',
  podium: 'On the leaderboard podium (top 3).',
  topTen: 'Inside the top 10 of the leaderboard.',
  topPercent: 'Inside the top 10% of the leaderboard.',
  topHalf: 'Inside the top half of the leaderboard.',
  ranked: 'Ranked on the leaderboard.',
}

// Threshold for the "top percent" tier. 10% is forgiving enough that a board
// with a few dozen entries can land players in the bracket while still
// reading as an above-average finish. Inclusive boundary: a player at exactly
// the 10% line still gets the tier so a rank of 10 on a board of 100 reads as
// TOP %.
export const RANK_TOP_PERCENT_FRACTION = 0.1

/**
 * Returns true when the value is a structurally-valid LeaderboardRankInfo:
 * positive integer rank, positive integer boardSize, rank <= boardSize.
 * Defensive against missing fields, fractional values, non-finite numbers,
 * and a zero-board-size hand-edited blob so a corrupt storage read can never
 * feed the renderer garbage.
 */
export function isLeaderboardRankInfo(
  value: unknown,
): value is LeaderboardRankInfo {
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
 * Defensive sanitizer that returns the canonical RankInfo or null on any
 * malformed input. Floors fractional values rather than rejecting outright
 * so a server payload that ever drifts slightly (e.g. a future API change)
 * still surfaces a usable rank.
 */
export function sanitizeRankInfo(raw: unknown): LeaderboardRankInfo | null {
  if (!raw || typeof raw !== 'object') return null
  const v = raw as { rank?: unknown; boardSize?: unknown }
  const r =
    typeof v.rank === 'number' && Number.isFinite(v.rank)
      ? Math.floor(v.rank)
      : null
  const bs =
    typeof v.boardSize === 'number' && Number.isFinite(v.boardSize)
      ? Math.floor(v.boardSize)
      : null
  if (r === null || bs === null) return null
  if (r < 1 || bs < 1) return null
  if (r > bs) return null
  return { rank: r, boardSize: bs }
}

/**
 * Returns the most-flattering tier the player's rank qualifies for. The
 * ladder cascades top-down so a P1 also matches every lower tier; we
 * intentionally stop at the highest match so the chip always shows the
 * proudest label.
 */
export function classifyRank(info: LeaderboardRankInfo): RankTier {
  if (info.rank === 1) return 'p1'
  if (info.rank <= 3) return 'podium'
  if (info.rank <= 10) return 'topTen'
  // Inclusive top-percent boundary: rank 10 on a board of 100 (exactly
  // RANK_TOP_PERCENT_FRACTION * boardSize) qualifies. Round up the limit so a
  // board of 11 still lets rank 1 bypass the topTen check above and land
  // here; the rank-1 short circuit prevents that ambiguity.
  const topPercentLimit = Math.max(1, Math.ceil(info.boardSize * RANK_TOP_PERCENT_FRACTION))
  if (info.rank <= topPercentLimit) return 'topPercent'
  // Top half: a board of 10 has a half at rank 5 (inclusive). Rounded up so
  // a board of 11 still lets rank 6 qualify, matching what a player would
  // expect from "top half".
  const topHalfLimit = Math.max(1, Math.ceil(info.boardSize / 2))
  if (info.rank <= topHalfLimit) return 'topHalf'
  return 'ranked'
}

/**
 * Compact label rendered inside the rank chip. P1 collapses to just the
 * rank ("P1") since it is always the headline. Podium shows the rank ("P2",
 * "P3") so second and third are distinguishable at a glance. Top tiers
 * append the rank in parentheses ("TOP 10 #7") so the player sees exactly
 * where they sit. The ranked-only fallback shows "P{rank} / {boardSize}".
 */
export function formatRankBadge(info: LeaderboardRankInfo): string {
  const tier = classifyRank(info)
  if (tier === 'p1') return 'P1'
  if (tier === 'podium') return `P${info.rank}`
  if (tier === 'topTen') return `TOP 10 #${info.rank}`
  if (tier === 'topPercent') return `TOP % #${info.rank}`
  if (tier === 'topHalf') return `TOP HALF #${info.rank}`
  return `P${info.rank} / ${info.boardSize}`
}

/**
 * Plain-language label for the chip's aria-label and tooltip. Includes the
 * tier description plus the raw "Rank R of B" so a screen reader user gets
 * the exact placement, not just the bucket.
 */
export function formatRankAriaLabel(info: LeaderboardRankInfo): string {
  const tier = classifyRank(info)
  const desc = RANK_TIER_DESCRIPTIONS[tier]
  return `${desc} Rank ${info.rank} of ${info.boardSize}.`
}

/**
 * Returns true when the fresh rank is a structurally-better placement than
 * the prior. "Better" here means strictly lower 1-indexed rank, since the
 * board size can change as new players post times. A null prior always
 * returns true so the very first rank lands as an upgrade.
 */
export function isRankUpgrade(
  prev: LeaderboardRankInfo | null | undefined,
  fresh: LeaderboardRankInfo,
): boolean {
  if (!prev) return true
  if (!isLeaderboardRankInfo(prev)) return true
  return fresh.rank < prev.rank
}
