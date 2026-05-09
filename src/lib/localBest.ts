import { z } from 'zod'
import { ReplaySchema, type Replay } from './replay'
import { CheckpointHitSchema, type CheckpointHit } from './schemas'
import type { SectorDuration } from '@/game/optimalLap'
import { emptyStats, type TrackStats } from '@/game/trackStats'
import {
  isLeaderboardRankInfo,
  type LeaderboardRankInfo,
} from '@/game/leaderboardRank'
import { readJson, readNumber, writeJson, writeNumber } from './storage'

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

function topSpeedBestKey(slug: string, versionHash: string): string {
  return `viberacer.bestTopSpeed.${slug}.${versionHash}`
}

// Lifetime best across every (slug, version). The per-track key tracks "best
// reaction time on this layout" so a player can chase tier upgrades on a
// familiar track; the lifetime key tracks "best reaction time anywhere" so a
// player who hops between layouts has a single bar to beat.
const REACTION_TIME_LIFETIME_KEY = 'viberacer.bestReactionLifetime'

// Lifetime best top speed across every (slug, version). One number, one key,
// no slug namespace. Lets the home page and the in-race HUD chip surface a
// single "fastest you've ever gone" the player can chase on any track. The
// per-track key (above) tracks the per-layout PB so a familiar oval and a
// brand-new sandbox each carry their own headline number.
const TOP_SPEED_LIFETIME_KEY = 'viberacer.bestTopSpeedLifetime'

// Cap a stored top speed at a comfortably-above-stock-tuning ceiling so a
// hand-edited blob can never seed an absurd "infinity / s" PB the gauge
// cannot show. Mirrors `MAX_REASONABLE_TOP_SPEED_US` in `src/game/topSpeedPb.ts`
// (kept as a module-private constant so the storage layer does not have to
// import the game module just for one number).
const TOP_SPEED_STORAGE_CAP_US = 200

// Sanity cap for a stored reaction time. Anything above 30s is almost
// certainly a corrupted or hand-edited blob; the renderer agrees on the same
// ceiling so the storage layer and the HUD will never disagree on what counts
// as "a real reaction time".
const REACTION_TIME_CAP_MS = 30_000

const positiveNumber = (n: number): boolean => n > 0
const positiveBelow = (cap: number) => (n: number): boolean => n > 0 && n <= cap

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
  return readNumber(bestKey(slug, versionHash), positiveNumber)
}

export function writeLocalBest(
  slug: string,
  versionHash: string,
  lapTimeMs: number,
): void {
  writeNumber(bestKey(slug, versionHash), Math.round(lapTimeMs))
}

export function readLocalBestReplay(
  slug: string,
  versionHash: string,
): Replay | null {
  return readJson(replayKey(slug, versionHash), ReplaySchema)
}

export function writeLocalBestReplay(
  slug: string,
  versionHash: string,
  replay: Replay,
): void {
  writeJson(replayKey(slug, versionHash), replay)
}

// Per-PB checkpoint splits. The HUD's live "delta vs PB" tile compares the
// current lap's just-crossed checkpoint against this stored array.
export function readLocalBestSplits(
  slug: string,
  versionHash: string,
): CheckpointHit[] | null {
  return readJson(splitsKey(slug, versionHash), SplitsArraySchema)
}

export function writeLocalBestSplits(
  slug: string,
  versionHash: string,
  hits: CheckpointHit[],
): void {
  writeJson(splitsKey(slug, versionHash), hits)
}

// All-time best drift score for this (slug, versionHash). Persists across
// sessions in the same browser. The HUD's BEST DRIFT block compares the live
// best against this value so a fresh page load shows the true PB instead of
// just the in-memory session record.
export function readLocalBestDrift(
  slug: string,
  versionHash: string,
): number | null {
  return readNumber(driftBestKey(slug, versionHash), positiveNumber)
}

export function writeLocalBestDrift(
  slug: string,
  versionHash: string,
  score: number,
): void {
  if (!Number.isFinite(score) || score <= 0) return
  writeNumber(driftBestKey(slug, versionHash), Math.round(score))
}

// Per-sector best durations for the theoretical-best ("OPTIMAL") lap HUD
// block. Stored alongside the PB lap time so a fresh page load shows the
// player's optimal lap from the very first frame instead of waiting for the
// first lap to seed it.
export function readLocalBestSectors(
  slug: string,
  versionHash: string,
): SectorDuration[] | null {
  return readJson(bestSectorsKey(slug, versionHash), SectorDurationsArraySchema)
}

export function writeLocalBestSectors(
  slug: string,
  versionHash: string,
  sectors: readonly SectorDuration[],
): void {
  writeJson(bestSectorsKey(slug, versionHash), sectors)
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
  return readJson(trackStatsKey(slug, versionHash), TrackStatsSchema)
}

export function writeTrackStats(
  slug: string,
  versionHash: string,
  stats: TrackStats,
): void {
  // Defensive: refuse to persist an obviously corrupt snapshot so a single
  // bad write does not poison the stored record. The schema mirrors the
  // reader's shape so a write that survives this check will round-trip.
  const parsed = TrackStatsSchema.safeParse(stats)
  if (!parsed.success) return
  writeJson(trackStatsKey(slug, versionHash), parsed.data)
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
  const n = readNumber(pbStreakBestKey(slug, versionHash), positiveNumber)
  return n === null ? null : Math.floor(n)
}

export function writeLocalBestPbStreak(
  slug: string,
  versionHash: string,
  streak: number,
): void {
  if (!Number.isFinite(streak) || streak <= 0) return
  writeNumber(pbStreakBestKey(slug, versionHash), Math.floor(streak))
}

// Most-recent-submit pointer for the friend-challenge link. Updated on every
// successful PB submit (the only laps that promote the local PB replay). The
// stored nonce is the lookup key for `/api/replay/byNonce`.
export function readLastSubmit(
  slug: string,
  versionHash: string,
): LastSubmit | null {
  return readJson(lastSubmitNonceKey(slug, versionHash), LastSubmitSchema)
}

export function writeLastSubmit(
  slug: string,
  versionHash: string,
  value: LastSubmit,
): void {
  // Validate before write so an upstream caller passing garbage cannot poison
  // the localStorage entry. A failed validation is a no-op rather than a
  // throw so the caller's lap-complete path keeps working.
  const parsed = LastSubmitSchema.safeParse(value)
  if (!parsed.success) return
  writeJson(lastSubmitNonceKey(slug, versionHash), parsed.data)
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
  const n = readNumber(
    reactionTimeBestKey(slug, versionHash),
    positiveBelow(REACTION_TIME_CAP_MS),
  )
  return n === null ? null : Math.round(n)
}

export function writeLocalBestReaction(
  slug: string,
  versionHash: string,
  reactionMs: number,
): void {
  if (!Number.isFinite(reactionMs) || reactionMs <= 0) return
  if (reactionMs > REACTION_TIME_CAP_MS) return
  writeNumber(reactionTimeBestKey(slug, versionHash), Math.round(reactionMs))
}

// Lifetime best reaction time across every (slug, versionHash). One number,
// one key, no slug namespace. Lets the home page and the in-race HUD chip
// surface a single "overall best" that the player can chase on any track.
export function readLifetimeBestReaction(): number | null {
  const n = readNumber(REACTION_TIME_LIFETIME_KEY, positiveBelow(REACTION_TIME_CAP_MS))
  return n === null ? null : Math.round(n)
}

export function writeLifetimeBestReaction(reactionMs: number): void {
  if (!Number.isFinite(reactionMs) || reactionMs <= 0) return
  if (reactionMs > REACTION_TIME_CAP_MS) return
  writeNumber(REACTION_TIME_LIFETIME_KEY, Math.round(reactionMs))
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
  const parsed = readJson(bestRankKey(slug, versionHash), StoredRankSchema)
  if (parsed === null) return null
  if (parsed.rank > parsed.boardSize) return null
  return parsed
}

export function writeLocalBestRank(
  slug: string,
  versionHash: string,
  info: LeaderboardRankInfo,
): void {
  if (!isLeaderboardRankInfo(info)) return
  writeJson(bestRankKey(slug, versionHash), {
    rank: info.rank,
    boardSize: info.boardSize,
  })
}

// Per-(slug, versionHash) best top speed reached on the layout, in raw "us"
// (world units per second). The Stats pane and the HUD chip both read from
// here so a fresh page load surfaces the player's true PB instead of resetting
// to zero each session. Defensive: a corrupt or non-finite stored value reads
// as null and the writer refuses non-finite / non-positive / absurdly-large
// numbers so a hand-edited blob can never poison the rest of the flow.
export function readLocalBestTopSpeed(
  slug: string,
  versionHash: string,
): number | null {
  const n = readNumber(
    topSpeedBestKey(slug, versionHash),
    positiveBelow(TOP_SPEED_STORAGE_CAP_US),
  )
  return n === null ? null : Math.round(n * 10) / 10
}

export function writeLocalBestTopSpeed(
  slug: string,
  versionHash: string,
  topSpeedUs: number,
): void {
  if (!Number.isFinite(topSpeedUs) || topSpeedUs <= 0) return
  if (topSpeedUs > TOP_SPEED_STORAGE_CAP_US) return
  writeNumber(topSpeedBestKey(slug, versionHash), Math.round(topSpeedUs * 10) / 10)
}

// Lifetime best top speed across every (slug, versionHash). One number, one
// key, no slug namespace. Lets the home page Stats tile and the in-race HUD
// chip surface a single "fastest you've ever gone" target the player can chase
// on any track.
export function readLifetimeBestTopSpeed(): number | null {
  const n = readNumber(TOP_SPEED_LIFETIME_KEY, positiveBelow(TOP_SPEED_STORAGE_CAP_US))
  return n === null ? null : Math.round(n * 10) / 10
}

export function writeLifetimeBestTopSpeed(topSpeedUs: number): void {
  if (!Number.isFinite(topSpeedUs) || topSpeedUs <= 0) return
  if (topSpeedUs > TOP_SPEED_STORAGE_CAP_US) return
  writeNumber(TOP_SPEED_LIFETIME_KEY, Math.round(topSpeedUs * 10) / 10)
}
