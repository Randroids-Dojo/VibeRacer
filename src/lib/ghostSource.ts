import { z } from 'zod'
import type { Replay } from './replay'
import type { GhostMeta } from '@/game/ghostNameplate'

// Which ghost to show alongside the player. The boolean `showGhost` toggle
// in ControlSettings is the master "show or not"; ghostSource picks WHICH
// ghost when `showGhost` is true.
//
// auto: prefer the player's local PB replay; fall back to the leaderboard's
//   top recording. Matches the legacy behavior so users who never open the
//   picker see no change.
// top:  always show the leaderboard's top recording, even when the player
//   has set a personal best. Useful for chasing the record.
// pb:   only show the player's local PB replay; do not fall back to the
//   leaderboard top. Useful for racing yourself in isolation.
// lastLap: show the player's MOST RECENT completed lap (regardless of PB
//   status). Updates after every lap, so the player can chase their last
//   attempt even when slowly slipping off pace. Hides the ghost until the
//   first lap of the session completes.
export const GHOST_SOURCES = ['auto', 'top', 'pb', 'lastLap'] as const
export type GhostSource = (typeof GHOST_SOURCES)[number]

export const DEFAULT_GHOST_SOURCE: GhostSource = 'auto'

export const GhostSourceSchema = z.enum(GHOST_SOURCES)

export const GHOST_SOURCE_LABELS: Record<GhostSource, string> = {
  auto: 'Auto',
  top: 'Top time',
  pb: 'Your PB',
  lastLap: 'Last lap',
}

export const GHOST_SOURCE_DESCRIPTIONS: Record<GhostSource, string> = {
  auto: 'Race your personal best. Falls back to the leaderboard top time when you do not have one yet.',
  top: 'Always race the leaderboard #1 recording, even after you set a personal best.',
  pb: 'Only race your own personal best. Hides the ghost until you set one.',
  lastLap:
    'Race your most recent completed lap, refreshed every time you finish a lap (even when it is not a PB).',
}

export function isGhostSource(value: unknown): value is GhostSource {
  return (
    typeof value === 'string' &&
    (GHOST_SOURCES as readonly string[]).includes(value)
  )
}

// Pure: pick which replay (if any) should be shown given the player's
// preference and the available replays. Mirrors the resolution logic that
// runs at race start in Game.tsx.
//
// - If localPb is null, source 'auto' falls back to top.
// - Source 'pb' never falls back: returns localPb (which may be null).
// - Source 'top' always returns top (which may be null when no leaderboard
//   replay is on file yet).
// - Source 'lastLap' returns the lastLap replay (which is null at race
//   start since no lap has completed yet this session). The renderer keeps
//   chasing this ref as it fills in via the per-lap update path; there is
//   no fallback to PB or top because the whole point is to chase the most
//   recent attempt, not a stale one.
export function pickGhostReplay(
  source: GhostSource,
  localPb: Replay | null,
  top: Replay | null,
  lastLap: Replay | null = null,
): Replay | null {
  if (source === 'pb') return localPb
  if (source === 'top') return top
  if (source === 'lastLap') return lastLap
  // auto
  return localPb ?? top
}

// Pure: pick which replay should become the active ghost AFTER a fresh
// personal-best lap. Mirrors the resolution logic that runs in
// handleLapComplete in Game.tsx.
//
// - 'pb' and 'auto' both swap to the new local PB so the next lap chases
//   the player's freshest path.
// - 'top' keeps the existing active ghost (typically the leaderboard top
//   recording) so the player keeps chasing the record after their PB.
// - 'lastLap' keeps the existing active ghost: the per-lap update path
//   (which fires for every completed lap including PB laps) is the
//   canonical writer for this source, so a separate post-PB swap here
//   would double-write.
export function pickGhostAfterPb(
  source: GhostSource,
  newLocalPb: Replay,
  prevActive: Replay | null,
): Replay | null {
  if (source === 'top') return prevActive
  if (source === 'lastLap') return prevActive
  return newLocalPb
}

// Pure: should the loader fetch the leaderboard top replay at race start?
// 'pb' and 'lastLap' never need it (neither source falls back to top).
export function ghostSourceNeedsTopFetch(source: GhostSource): boolean {
  return source !== 'pb' && source !== 'lastLap'
}

// Pure: pick which ghost-meta tuple (initials + lap time) belongs to the
// active ghost replay. Mirrors `pickGhostReplay` branch-for-branch so the
// nameplate renderer never shows the wrong identity above the ghost car.
//
// All inputs are nullable because some sources legitimately have no meta
// to display: 'pb' returns null until the player sets a personal best on
// the slug, 'lastLap' returns null until the first lap of the session
// completes, and 'top' returns null when the leaderboard is empty.
export function pickGhostMeta(
  source: GhostSource,
  localPbMeta: GhostMeta | null,
  topMeta: GhostMeta | null,
  lastLapMeta: GhostMeta | null = null,
): GhostMeta | null {
  if (source === 'pb') return localPbMeta
  if (source === 'top') return topMeta
  if (source === 'lastLap') return lastLapMeta
  return localPbMeta ?? topMeta
}

// Pure: pick which ghost-meta tuple should become active AFTER a fresh
// personal-best lap. Mirrors `pickGhostAfterPb` so the nameplate swap
// stays in lockstep with the replay swap.
export function pickGhostMetaAfterPb(
  source: GhostSource,
  newPbMeta: GhostMeta,
  prevActive: GhostMeta | null,
): GhostMeta | null {
  if (source === 'top') return prevActive
  if (source === 'lastLap') return prevActive
  return newPbMeta
}
