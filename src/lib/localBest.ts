import { z } from 'zod'
import { ReplaySchema, type Replay } from './replay'
import { CheckpointHitSchema, type CheckpointHit } from './schemas'
import type { SectorDuration } from '@/game/optimalLap'
import { emptyStats, type TrackStats } from '@/game/trackStats'
import {
  isLeaderboardRankInfo,
  type LeaderboardRankInfo,
} from '@/game/leaderboardRank'

function bestKey(slug: string, versionHash: string): string {
  return `viberacer.best.${slug}.${versionHash}`
}

function replayKey(slug: string, versionHash: string): string {
  return `viberacer.replay.${slug}.${versionHash}`
}

function splitsKey(slug: string, versionHash: string): string {
  return `viberacer.splits.${slug}.${versionHash}`
}

function driftBestKey(slug: string, versionHash: string): string {
  return `viberacer.driftBest.${slug}.${versionHash}`
}

function bestSectorsKey(slug: string, versionHash: string): string {
  return `viberacer.bestSectors.${slug}.${versionHash}`
}

function trackStatsKey(slug: string, versionHash: string): string {
  return `viberacer.stats.${slug}.${versionHash}`
}

function pbStreakBestKey(slug: string, versionHash: string): string {
  return `viberacer.pbStreakBest.${slug}.${versionHash}`
}

function lastSubmitNonceKey(slug: string, versionHash: string): string {
  return `viberacer.lastSubmitNonce.${slug}.${versionHash}`
}

function reactionTimeBestKey(slug: string, versionHash: string): string {
  return `viberacer.bestReaction.${slug}.${versionHash}`
}

function bestRankKey(slug: string, versionHash: string): string {
  return `viberacer.bestRank.${slug}.${versionHash}`
}

// Lifetime best across every (slug, version). The per-track key tracks "best
// reaction time on this layout" so a player can chase tier upgrades on a
// familiar track; the lifetime key tracks "best reaction time anywhere" so a
// player who hops between layouts has a single bar to beat.
const REACTION_TIME_LIFETIME_KEY = 'viberacer.bestReactionLifetime'

// The nonce of the player's most recent successful submission on this
// (slug, version), tracked alongside the lap time it represents. Used by the
// pause-menu Challenge a Friend flow to build a URL pinned to that exact
// recorded ghost. Stored as JSON because the lap time is needed in the URL
// even when the player no longer matches their displayed PB on disk.
const LastSubmitSchema = z.object({
  // 16 random bytes hex-encoded, matches the race-token nonce shape.
  nonce: z.string().regex(/^[a-f0-9]{32}$/),
  lapTimeMs: z.number().int().positive(),
})
export type LastSubmit = z.infer<typeof LastSubmitSchema>

const SplitsArraySchema = z.array(CheckpointHitSchema)

// Persisted shape mirrors SectorDuration but validates each entry so a
// hand-edited or corrupt localStorage payload can never feed the HUD a
// negative or non-finite duration.
const SectorDurationSchema = z.object({
  cpId: z.number().int().nonnegative(),
  durationMs: z.number().positive().finite(),
})
const SectorDurationsArraySchema = z.array(SectorDurationSchema)

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

export function readLocalBestReplay(
  slug: string,
  versionHash: string,
): Replay | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(replayKey(slug, versionHash))
  if (!raw) return null
  try {
    const parsed = ReplaySchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function writeLocalBestReplay(
  slug: string,
  versionHash: string,
  replay: Replay,
): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      replayKey(slug, versionHash),
      JSON.stringify(replay),
    )
  } catch {
    // Quota exceeded or storage disabled. Ghost is a best-effort enhancement;
    // failing silently keeps the rest of the lap-complete flow working.
  }
}

// Per-PB checkpoint splits. The HUD's live "delta vs PB" tile compares the
// current lap's just-crossed checkpoint against this stored array.
export function readLocalBestSplits(
  slug: string,
  versionHash: string,
): CheckpointHit[] | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(splitsKey(slug, versionHash))
  if (!raw) return null
  try {
    const parsed = SplitsArraySchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function writeLocalBestSplits(
  slug: string,
  versionHash: string,
  hits: CheckpointHit[],
): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      splitsKey(slug, versionHash),
      JSON.stringify(hits),
    )
  } catch {
    // Splits are a best-effort UX enhancement. A quota failure should never
    // break the lap-complete flow.
  }
}

// All-time best drift score for this (slug, versionHash). Persists across
// sessions in the same browser. The HUD's BEST DRIFT block compares the live
// best against this value so a fresh page load shows the true PB instead of
// just the in-memory session record.
export function readLocalBestDrift(
  slug: string,
  versionHash: string,
): number | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(driftBestKey(slug, versionHash))
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

export function writeLocalBestDrift(
  slug: string,
  versionHash: string,
  score: number,
): void {
  if (typeof window === 'undefined') return
  if (!Number.isFinite(score) || score <= 0) return
  try {
    window.localStorage.setItem(
      driftBestKey(slug, versionHash),
      String(Math.round(score)),
    )
  } catch {
    // Drift score persistence is a best-effort UX enhancement. Quota
    // exhaustion should never break the lap-complete flow.
  }
}

// Per-sector best durations for the theoretical-best ("OPTIMAL") lap HUD
// block. Stored alongside the PB lap time so a fresh page load shows the
// player's optimal lap from the very first frame instead of waiting for the
// first lap to seed it.
export function readLocalBestSectors(
  slug: string,
  versionHash: string,
): SectorDuration[] | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(bestSectorsKey(slug, versionHash))
  if (!raw) return null
  try {
    const parsed = SectorDurationsArraySchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function writeLocalBestSectors(
  slug: string,
  versionHash: string,
  sectors: readonly SectorDuration[],
): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      bestSectorsKey(slug, versionHash),
      JSON.stringify(sectors),
    )
  } catch {
    // Best-sectors persistence is a best-effort UX enhancement. A quota
    // failure should never break the lap-complete flow.
  }
}

// Per-track engagement stats (lap count, total drive time, session count,
// first / last played timestamps). Persisted across sessions so the pause
// menu's Stats pane can show "you have spent 4:32 racing this layout across
// 7 sessions" instead of resetting on every reload.
const TrackStatsSchema = z.object({
  lapCount: z.number().int().nonnegative().finite(),
  totalDriveMs: z.number().nonnegative().finite(),
  sessionCount: z.number().int().nonnegative().finite(),
  firstPlayedAt: z.number().positive().finite().nullable(),
  lastPlayedAt: z.number().positive().finite().nullable(),
})

export function readTrackStats(
  slug: string,
  versionHash: string,
): TrackStats | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(trackStatsKey(slug, versionHash))
  if (!raw) return null
  try {
    const parsed = TrackStatsSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function writeTrackStats(
  slug: string,
  versionHash: string,
  stats: TrackStats,
): void {
  if (typeof window === 'undefined') return
  // Defensive: refuse to persist an obviously corrupt snapshot so a single
  // bad write does not poison the stored record. The schema mirrors the
  // reader's shape so a write that survives this check will round-trip.
  const parsed = TrackStatsSchema.safeParse(stats)
  if (!parsed.success) return
  try {
    window.localStorage.setItem(
      trackStatsKey(slug, versionHash),
      JSON.stringify(parsed.data),
    )
  } catch {
    // Engagement stats are a best-effort UX enhancement. A quota failure
    // should never break the lap-complete flow.
  }
}

// Build a starting snapshot for a fresh slug + version. Re-exports the pure
// helper so callers do not have to import from two places.
export function freshTrackStats(): TrackStats {
  return emptyStats()
}

// All-time best PB streak (consecutive PB laps) for this (slug, versionHash).
// Persists across sessions so the pause-menu Stats pane can surface it as a
// long-standing personal achievement and the player has a target to beat.
// The live in-session counter is held in HudState only; this storage is for
// the high-water mark across all sessions.
export function readLocalBestPbStreak(
  slug: string,
  versionHash: string,
): number | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(pbStreakBestKey(slug, versionHash))
  if (!raw) return null
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.floor(n)
}

export function writeLocalBestPbStreak(
  slug: string,
  versionHash: string,
  streak: number,
): void {
  if (typeof window === 'undefined') return
  if (!Number.isFinite(streak) || streak <= 0) return
  try {
    window.localStorage.setItem(
      pbStreakBestKey(slug, versionHash),
      String(Math.floor(streak)),
    )
  } catch {
    // PB streak persistence is a best-effort UX enhancement. A quota
    // failure should never break the lap-complete flow.
  }
}

// Most-recent-submit pointer for the friend-challenge link. Updated on every
// successful PB submit (the only laps that promote the local PB replay). The
// stored nonce is the lookup key for `/api/replay/byNonce`.
export function readLastSubmit(
  slug: string,
  versionHash: string,
): LastSubmit | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(lastSubmitNonceKey(slug, versionHash))
  if (!raw) return null
  try {
    const parsed = LastSubmitSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function writeLastSubmit(
  slug: string,
  versionHash: string,
  value: LastSubmit,
): void {
  if (typeof window === 'undefined') return
  // Validate before write so an upstream caller passing garbage cannot poison
  // the localStorage entry. A failed validation is a no-op rather than a
  // throw so the caller's lap-complete path keeps working.
  const parsed = LastSubmitSchema.safeParse(value)
  if (!parsed.success) return
  try {
    window.localStorage.setItem(
      lastSubmitNonceKey(slug, versionHash),
      JSON.stringify(parsed.data),
    )
  } catch {
    // Quota or storage disabled. Best-effort, never breaks gameplay.
  }
}

// Per-(slug, versionHash) best reaction time at the GO light, in milliseconds.
// The Stats pane and the HUD chip both read from here so a fresh page load
// surfaces the player's true PB instead of resetting to "no PB on file" each
// session. Defensive: a corrupt or non-finite stored value reads as null and
// the writer refuses non-finite / non-positive / absurdly-large numbers so a
// hand-edited blob can never poison the rest of the flow.
export function readLocalBestReaction(
  slug: string,
  versionHash: string,
): number | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(reactionTimeBestKey(slug, versionHash))
  if (!raw) return null
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return null
  // Sanity cap: anything above 30s is almost certainly garbage. Mirrors the
  // pure helper's MAX_REASONABLE_REACTION_MS so the storage layer agrees with
  // the renderer on what counts as "a real reaction time".
  if (n > 30_000) return null
  return Math.round(n)
}

export function writeLocalBestReaction(
  slug: string,
  versionHash: string,
  reactionMs: number,
): void {
  if (typeof window === 'undefined') return
  if (!Number.isFinite(reactionMs) || reactionMs <= 0) return
  if (reactionMs > 30_000) return
  try {
    window.localStorage.setItem(
      reactionTimeBestKey(slug, versionHash),
      String(Math.round(reactionMs)),
    )
  } catch {
    // Reaction-time persistence is a best-effort UX enhancement. A quota
    // failure should never break the race-start flow.
  }
}

// Lifetime best reaction time across every (slug, versionHash). One number,
// one key, no slug namespace. Lets the home page and the in-race HUD chip
// surface a single "overall best" that the player can chase on any track.
export function readLifetimeBestReaction(): number | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(REACTION_TIME_LIFETIME_KEY)
  if (!raw) return null
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return null
  if (n > 30_000) return null
  return Math.round(n)
}

export function writeLifetimeBestReaction(reactionMs: number): void {
  if (typeof window === 'undefined') return
  if (!Number.isFinite(reactionMs) || reactionMs <= 0) return
  if (reactionMs > 30_000) return
  try {
    window.localStorage.setItem(
      REACTION_TIME_LIFETIME_KEY,
      String(Math.round(reactionMs)),
    )
  } catch {
    // Best-effort, never breaks gameplay.
  }
}

// Per-track best leaderboard placement. Stored alongside the local PB lap
// time so the HUD can surface the player's standing on the (slug, version)
// leaderboard between sessions without waiting for a fresh submit. The
// "best" semantics mean strictly lower 1-indexed rank wins; the board size
// at the moment the best rank was reached is preserved alongside so the
// chip can label tiers honestly even when the live board has grown since.
const StoredRankSchema = z.object({
  rank: z.number().int().positive(),
  boardSize: z.number().int().positive(),
})

export function readLocalBestRank(
  slug: string,
  versionHash: string,
): LeaderboardRankInfo | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(bestRankKey(slug, versionHash))
  if (!raw) return null
  try {
    const parsed = StoredRankSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) return null
    if (parsed.data.rank > parsed.data.boardSize) return null
    return parsed.data
  } catch {
    return null
  }
}

export function writeLocalBestRank(
  slug: string,
  versionHash: string,
  info: LeaderboardRankInfo,
): void {
  if (typeof window === 'undefined') return
  if (!isLeaderboardRankInfo(info)) return
  try {
    window.localStorage.setItem(
      bestRankKey(slug, versionHash),
      JSON.stringify({ rank: info.rank, boardSize: info.boardSize }),
    )
  } catch {
    // Rank persistence is a best-effort UX enhancement. A quota failure
    // should never break the lap-submit flow.
  }
}
