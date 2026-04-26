// Achievement system. A list of named, lifetime-scoped milestones the player
// can unlock as they race. Unlocks persist across tracks and sessions in
// localStorage (cross-track because most achievements are about the player's
// overall journey, not a single layout).
//
// Pure helpers only: storage and toast wiring live in `src/lib/achievements.ts`
// and `src/components/Game.tsx`. Each achievement is described once here and
// the evaluator runs the snapshot through every check on every lap completion.
//
// Snapshot contract: `evaluateAchievements` is called from `handleLapComplete`
// with the just-completed lap plus a small set of derived counters the caller
// already has on hand (running PB streak, optimal-lap completeness, distinct
// slugs visited, etc.). The evaluator returns the ids that newly qualify.
// `unlockAchievements` then merges the list into the stored map with timestamps
// so repeat triggers do not retoast a previously-unlocked achievement.

export const ACHIEVEMENT_IDS = [
  'first-lap',
  'first-pb',
  'sub-30',
  'sub-20',
  'sub-15',
  'drift-king',
  'triple-pb-streak',
  'five-pb-streak',
  'track-veteran',
  'marathoner',
  'perfectionist',
  'variety-pack',
  'wrong-way',
  'platinum-medal',
] as const

export type AchievementId = (typeof ACHIEVEMENT_IDS)[number]

export interface AchievementDef {
  id: AchievementId
  name: string
  description: string
  // Short display category, surfaced as a small chip on the achievement card.
  // 'speed' = lap time milestones, 'progression' = repeat play, 'style' =
  // drift / wrong way, 'mastery' = optimal lap / medals / streaks, 'discovery'
  // = first-time interactions across the app.
  category: 'speed' | 'progression' | 'style' | 'mastery' | 'discovery'
}

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  {
    id: 'first-lap',
    name: 'First Lap',
    description: 'Complete your first lap on any track.',
    category: 'discovery',
  },
  {
    id: 'first-pb',
    name: 'Local Hero',
    description: 'Set your first personal best on any track.',
    category: 'progression',
  },
  {
    id: 'sub-30',
    name: 'Sub-30',
    description: 'Complete a lap in under 30 seconds.',
    category: 'speed',
  },
  {
    id: 'sub-20',
    name: 'Sub-20',
    description: 'Complete a lap in under 20 seconds.',
    category: 'speed',
  },
  {
    id: 'sub-15',
    name: 'Sub-15',
    description: 'Complete a lap in under 15 seconds.',
    category: 'speed',
  },
  {
    id: 'drift-king',
    name: 'Drift King',
    description: 'Score 1000 or more drift points in a single lap.',
    category: 'style',
  },
  {
    id: 'triple-pb-streak',
    name: 'Hat Trick',
    description: 'Set three personal bests in a row in a single session.',
    category: 'mastery',
  },
  {
    id: 'five-pb-streak',
    name: 'On Fire',
    description: 'Set five personal bests in a row in a single session.',
    category: 'mastery',
  },
  {
    id: 'track-veteran',
    name: 'Track Veteran',
    description: 'Complete 50 laps on the same track version.',
    category: 'progression',
  },
  {
    id: 'marathoner',
    name: 'Marathoner',
    description: 'Spend 30 minutes racing a single track version.',
    category: 'progression',
  },
  {
    id: 'perfectionist',
    name: 'Perfectionist',
    description: 'Build a complete optimal lap on any track.',
    category: 'mastery',
  },
  {
    id: 'variety-pack',
    name: 'Variety Pack',
    description: 'Race on five or more different tracks.',
    category: 'discovery',
  },
  {
    id: 'wrong-way',
    name: 'Lost Tourist',
    description: 'Trigger the WRONG WAY warning by driving against the racing line.',
    category: 'style',
  },
  {
    id: 'platinum-medal',
    name: 'Platinum',
    description: 'Match or beat the leaderboard #1 lap time on any track.',
    category: 'mastery',
  },
]

// Look up a definition by id. Returns null for an unknown id so a stored
// payload with stale entries (e.g. from an older client) does not crash the
// pane. Render-time UI filters nulls before drawing.
export function getAchievementDef(id: string): AchievementDef | null {
  for (const def of ACHIEVEMENTS) {
    if (def.id === id) return def
  }
  return null
}

// Type guard for storage validation.
export function isAchievementId(value: unknown): value is AchievementId {
  if (typeof value !== 'string') return false
  return ACHIEVEMENT_IDS.includes(value as AchievementId)
}

// Drift score threshold for the Drift King achievement. Exposed as a constant
// so the lap-complete handler reads from the same number the description
// promises to the player.
export const DRIFT_KING_THRESHOLD = 1000

// Lap time thresholds for the speed achievements (ms).
export const SUB_30_MS = 30_000
export const SUB_20_MS = 20_000
export const SUB_15_MS = 15_000

// Track Veteran requires this many recorded laps on the SAME (slug, version).
export const TRACK_VETERAN_LAP_COUNT = 50

// Marathoner threshold: cumulative drive-time on a single (slug, version), ms.
export const MARATHONER_DRIVE_MS = 30 * 60 * 1000

// Variety Pack: distinct slugs the player has set foot on.
export const VARIETY_PACK_SLUG_COUNT = 5

// Streak thresholds.
export const TRIPLE_PB_STREAK = 3
export const FIVE_PB_STREAK = 5

// Snapshot of everything the evaluator needs to decide which achievements have
// just been earned. The caller (Game.tsx::handleLapComplete) has all of these
// values on hand by the time a lap completes; passing them in keeps the helper
// pure and unit-testable without React refs.
export interface AchievementSnapshot {
  // Most recent lap's time in ms. null when this evaluation is for a non-lap
  // event (e.g. wrong-way triggered without a lap completion).
  lapTimeMs: number | null
  // True when the just-completed lap was a fresh personal best on the current
  // (slug, versionHash). The first lap on a brand-new track also reads as
  // isPb=true (matches Game.tsx's lap-complete branch).
  isPb: boolean
  // Best drift score achieved during the just-completed lap. null when this
  // event is not a lap completion.
  driftLapScore: number | null
  // Live PB-streak counter after applying this lap's update. The caller already
  // computed this for the HUD chip; passing it in avoids re-deriving here.
  pbStreak: number
  // Cumulative lap count across every session on the current (slug, version)
  // including this lap. Sourced from the persisted TrackStats snapshot.
  trackLapCount: number
  // Cumulative drive time across every session on the current (slug, version)
  // including this lap. Sourced from the persisted TrackStats snapshot.
  trackDriveMs: number
  // True when the current optimal-lap snapshot covers every sector on this
  // track. Mirrors the OPTIMAL block's "complete" tinting.
  optimalComplete: boolean
  // Count of distinct slugs the player has touched, including the current one.
  // Sourced from the slug-visits storage helper. Lifetime across all sessions.
  distinctSlugCount: number
  // True when the player has triggered the wrong-way warning at any point in
  // the current session. The caller mirrors this from RaceCanvas's debouncer.
  wrongWayTriggered: boolean
  // Highest medal tier the player has earned on the current (slug, version),
  // or null when no medal yet. The Platinum achievement compares directly.
  medalTier: 'bronze' | 'silver' | 'gold' | 'platinum' | null
}

// Pure evaluator. Returns the ids that should be unlocked given the snapshot.
// Caller is responsible for filtering against the already-unlocked set and
// surfacing the toast. Defensive: non-finite or non-positive numeric inputs
// short-circuit out of their respective checks (defensive against a corrupted
// stats payload feeding the helper garbage).
export function evaluateAchievements(
  snapshot: AchievementSnapshot,
): AchievementId[] {
  const earned: AchievementId[] = []

  // First Lap: any completed lap qualifies.
  if (snapshot.lapTimeMs !== null && Number.isFinite(snapshot.lapTimeMs) && snapshot.lapTimeMs > 0) {
    earned.push('first-lap')
  }

  // First PB: any PB lap qualifies. The first lap on a fresh slug counts.
  if (snapshot.isPb) {
    earned.push('first-pb')
  }

  // Speed milestones, ordered fastest-to-slowest. Only the highest tier the
  // lap qualifies for IS earned, but the evaluator returns each one so a lap
  // that breaks two thresholds in one go (e.g. first sub-15 lap from a player
  // who never broke 30) unlocks all the missing tiers in a single pass.
  if (snapshot.lapTimeMs !== null && Number.isFinite(snapshot.lapTimeMs) && snapshot.lapTimeMs > 0) {
    if (snapshot.lapTimeMs < SUB_30_MS) earned.push('sub-30')
    if (snapshot.lapTimeMs < SUB_20_MS) earned.push('sub-20')
    if (snapshot.lapTimeMs < SUB_15_MS) earned.push('sub-15')
  }

  // Drift King: a single-lap drift score that crosses the threshold.
  if (
    snapshot.driftLapScore !== null &&
    Number.isFinite(snapshot.driftLapScore) &&
    snapshot.driftLapScore >= DRIFT_KING_THRESHOLD
  ) {
    earned.push('drift-king')
  }

  // PB streak tiers. A five-streak lap implicitly clears the three-streak
  // requirement so both ids ship together for a player who never paused on
  // x3.
  if (snapshot.pbStreak >= TRIPLE_PB_STREAK) earned.push('triple-pb-streak')
  if (snapshot.pbStreak >= FIVE_PB_STREAK) earned.push('five-pb-streak')

  // Track Veteran: lap count on the current (slug, version).
  if (snapshot.trackLapCount >= TRACK_VETERAN_LAP_COUNT) {
    earned.push('track-veteran')
  }

  // Marathoner: cumulative drive time on the current (slug, version).
  if (snapshot.trackDriveMs >= MARATHONER_DRIVE_MS) {
    earned.push('marathoner')
  }

  // Perfectionist: every sector covered on the current (slug, version).
  if (snapshot.optimalComplete) earned.push('perfectionist')

  // Variety Pack: distinct slugs visited.
  if (snapshot.distinctSlugCount >= VARIETY_PACK_SLUG_COUNT) {
    earned.push('variety-pack')
  }

  // Wrong-way: best-effort flag, surfaces once per session detection.
  if (snapshot.wrongWayTriggered) earned.push('wrong-way')

  // Platinum medal on any track.
  if (snapshot.medalTier === 'platinum') earned.push('platinum-medal')

  return earned
}

// Stored shape: a map of achievement id to unlock metadata. The unlockedAt
// timestamp surfaces in the pane's "earned on YYYY-MM-DD" line; slug and
// versionHash credit the track that triggered the unlock so the player can
// jump back to it later.
export interface AchievementUnlock {
  unlockedAt: number
  slug: string
  versionHash: string
}

export type AchievementMap = Partial<Record<AchievementId, AchievementUnlock>>

// Merge newly-earned ids into the existing map. Already-unlocked ids are kept
// at their original timestamp (no retoast, no overwrite); new ids land with
// the supplied metadata. Returns a fresh object so React state updates fire on
// reference inequality.
export function unlockAchievements(
  prev: AchievementMap,
  newlyEarned: readonly AchievementId[],
  meta: AchievementUnlock,
): { next: AchievementMap; unlocked: AchievementId[] } {
  const next: AchievementMap = { ...prev }
  const unlocked: AchievementId[] = []
  for (const id of newlyEarned) {
    if (next[id]) continue
    next[id] = { ...meta }
    unlocked.push(id)
  }
  return { next, unlocked }
}

// Fraction (0..1) of achievements the player has unlocked. Used by the pane's
// header readout. Defensive against extra ids in the stored map by counting
// only known ids.
export function achievementProgress(map: AchievementMap): {
  unlockedCount: number
  totalCount: number
  fraction: number
} {
  const totalCount = ACHIEVEMENTS.length
  let unlockedCount = 0
  for (const def of ACHIEVEMENTS) {
    if (map[def.id]) unlockedCount += 1
  }
  return {
    unlockedCount,
    totalCount,
    fraction: totalCount === 0 ? 0 : unlockedCount / totalCount,
  }
}
