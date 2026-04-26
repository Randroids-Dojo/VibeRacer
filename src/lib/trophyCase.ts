/**
 * Trophy case: a compact summary of the player's lifetime achievement
 * unlocks designed to live on the home page next to the medal cabinet and
 * lifetime stats.
 *
 * The full per-achievement detail lives in the pause-menu Achievements pane.
 * The home-page card is a quick "did I unlock anything new since I last
 * visited" affordance: total progress (n / total), the most-recent N unlocks
 * with their names and category accents, plus a per-category progress
 * breakdown so the player can see at a glance which avenues they have
 * explored and which they have not.
 *
 * Pure helpers only: storage and React wiring live in
 * `src/lib/achievements.ts` and `src/components/TrophyCase.tsx`. Each function
 * takes its inputs explicitly so the contract is unit-testable without a DOM.
 */
import {
  ACHIEVEMENTS,
  type AchievementDef,
  type AchievementMap,
} from '@/game/achievements'

// Number of recent unlocks to surface in the home-page summary. Tuned to fit
// in a single 2-3 row strip without scrolling on phone widths. The full list
// lives in the pause-menu pane.
export const TROPHY_CASE_RECENT_LIMIT = 3

// Categories in display order. Intentionally explicit (rather than derived
// from ACHIEVEMENTS) so a future achievement that introduces a new category
// shows up in a stable slot in the UI without depending on insertion order.
export const TROPHY_CASE_CATEGORY_ORDER = [
  'speed',
  'progression',
  'style',
  'mastery',
  'discovery',
] as const

export type TrophyCategory = (typeof TROPHY_CASE_CATEGORY_ORDER)[number]

export interface TrophyRecentUnlock {
  def: AchievementDef
  unlockedAt: number
  slug: string
}

export interface TrophyCategoryProgress {
  category: TrophyCategory
  unlocked: number
  total: number
}

export interface TrophyCaseSummary {
  // Total unlocks across every category. Mirrors `achievementProgress.unlocked`
  // but redeclared here so callers do not need a second import path.
  unlockedCount: number
  totalCount: number
  // Most-recent unlocks first, capped at TROPHY_CASE_RECENT_LIMIT entries.
  // Only includes ids that resolve to a known AchievementDef (a stale stored
  // payload with a renamed achievement is filtered out so the row never tries
  // to render a missing definition).
  recent: TrophyRecentUnlock[]
  // Per-category progress in TROPHY_CASE_CATEGORY_ORDER order. Every category
  // is always present (even when its unlocked count is zero) so the UI can
  // render a stable row of chips rather than a moving target.
  byCategory: TrophyCategoryProgress[]
}

/**
 * Empty summary, returned when the player has never unlocked anything. Fresh
 * objects on every call so callers can mutate the result (or hand it to React
 * state) without aliasing a shared default.
 */
export function emptyTrophyCaseSummary(): TrophyCaseSummary {
  return {
    unlockedCount: 0,
    totalCount: ACHIEVEMENTS.length,
    recent: [],
    byCategory: TROPHY_CASE_CATEGORY_ORDER.map((category) => ({
      category,
      unlocked: 0,
      total: countCategoryTotal(category),
    })),
  }
}

/**
 * Build a TrophyCaseSummary from a stored achievement map. Pure: callers pass
 * the parsed map (the storage layer in `src/lib/achievements.ts` is
 * responsible for filtering unknown ids before this runs, but this helper
 * defends against them too in case a future caller skips that step).
 *
 * Recent unlocks are sorted newest-first by `unlockedAt`. Ties break on the
 * canonical ACHIEVEMENTS catalog order so the same map always yields the same
 * recent list (deterministic when two unlocks share a millisecond timestamp).
 */
export function buildTrophyCaseSummary(
  map: AchievementMap,
): TrophyCaseSummary {
  const totalCount = ACHIEVEMENTS.length
  let unlockedCount = 0
  const unlocked: TrophyRecentUnlock[] = []
  const categoryUnlocked: Record<TrophyCategory, number> = {
    speed: 0,
    progression: 0,
    style: 0,
    mastery: 0,
    discovery: 0,
  }

  for (const def of ACHIEVEMENTS) {
    const meta = map[def.id]
    if (!meta) continue
    const unlockedAt = meta.unlockedAt
    if (typeof unlockedAt !== 'number' || !Number.isFinite(unlockedAt) || unlockedAt <= 0) {
      // A hand-edited or quota-corrupt entry can leak past the storage schema
      // if a caller skips it. Drop the row so the summary never carries a
      // bogus timestamp into the recent-unlock sort.
      continue
    }
    unlockedCount += 1
    if (isTrophyCategory(def.category)) {
      categoryUnlocked[def.category] += 1
    }
    unlocked.push({
      def,
      unlockedAt,
      slug: typeof meta.slug === 'string' ? meta.slug : '',
    })
  }

  // Newest-first by timestamp; tie-break on the ACHIEVEMENTS catalog index so
  // ties (same-ms unlocks) stay deterministic across renders.
  const catalogIndex = new Map<string, number>()
  ACHIEVEMENTS.forEach((def, idx) => catalogIndex.set(def.id, idx))
  unlocked.sort((a, b) => {
    if (a.unlockedAt !== b.unlockedAt) return b.unlockedAt - a.unlockedAt
    const ai = catalogIndex.get(a.def.id) ?? 0
    const bi = catalogIndex.get(b.def.id) ?? 0
    return ai - bi
  })

  const recent = unlocked.slice(0, TROPHY_CASE_RECENT_LIMIT)

  const byCategory: TrophyCategoryProgress[] = TROPHY_CASE_CATEGORY_ORDER.map(
    (category) => ({
      category,
      unlocked: categoryUnlocked[category],
      total: countCategoryTotal(category),
    }),
  )

  return { unlockedCount, totalCount, recent, byCategory }
}

/**
 * Count the achievements that belong to a given category. Pure derivation
 * from the ACHIEVEMENTS catalog; useful for the summary's per-category total
 * field and for any caller that wants the static denominator without
 * scanning the map.
 */
export function countCategoryTotal(category: TrophyCategory): number {
  let count = 0
  for (const def of ACHIEVEMENTS) {
    if (def.category === category) count += 1
  }
  return count
}

/**
 * Format the unlocked-at timestamp as a short relative-time label suitable
 * for a row in the recent unlocks list. Mirrors the fuzzy style used by the
 * recent tracks list ("today" / "yesterday" / "3d ago") so the home-page
 * sections feel consistent.
 *
 * Defensive against non-finite, non-positive, or future timestamps so a
 * misbehaving clock or a hand-edited payload never renders a confusing
 * "-5d ago" label.
 */
export function formatTrophyTimestamp(
  unlockedAt: number,
  nowMs: number = Date.now(),
): string {
  if (!Number.isFinite(unlockedAt) || unlockedAt <= 0) return ''
  if (!Number.isFinite(nowMs) || nowMs <= 0) return ''
  const diffMs = Math.max(0, nowMs - unlockedAt)
  const dayMs = 24 * 60 * 60 * 1000
  const days = Math.floor(diffMs / dayMs)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) {
    const weeks = Math.floor(days / 7)
    return weeks === 1 ? '1w ago' : `${weeks}w ago`
  }
  if (days < 365) {
    const months = Math.floor(days / 30)
    return months === 1 ? '1mo ago' : `${months}mo ago`
  }
  const years = Math.floor(days / 365)
  return years === 1 ? '1y ago' : `${years}y ago`
}

/**
 * Type guard for the trophy-category enum. Returns false for any string
 * outside the canonical TROPHY_CASE_CATEGORY_ORDER so a future achievement
 * with a typo'd category falls into the no-op branch rather than poisoning
 * the per-category counts.
 */
export function isTrophyCategory(value: unknown): value is TrophyCategory {
  if (typeof value !== 'string') return false
  return (TROPHY_CASE_CATEGORY_ORDER as readonly string[]).includes(value)
}
