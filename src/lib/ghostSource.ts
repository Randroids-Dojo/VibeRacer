import { z } from 'zod'
import type { Replay } from './replay'

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
export const GHOST_SOURCES = ['auto', 'top', 'pb'] as const
export type GhostSource = (typeof GHOST_SOURCES)[number]

export const DEFAULT_GHOST_SOURCE: GhostSource = 'auto'

export const GhostSourceSchema = z.enum(GHOST_SOURCES)

export const GHOST_SOURCE_LABELS: Record<GhostSource, string> = {
  auto: 'Auto',
  top: 'Top time',
  pb: 'Your PB',
}

export const GHOST_SOURCE_DESCRIPTIONS: Record<GhostSource, string> = {
  auto: 'Race your personal best. Falls back to the leaderboard top time when you do not have one yet.',
  top: 'Always race the leaderboard #1 recording, even after you set a personal best.',
  pb: 'Only race your own personal best. Hides the ghost until you set one.',
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
export function pickGhostReplay(
  source: GhostSource,
  localPb: Replay | null,
  top: Replay | null,
): Replay | null {
  if (source === 'pb') return localPb
  if (source === 'top') return top
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
export function pickGhostAfterPb(
  source: GhostSource,
  newLocalPb: Replay,
  prevActive: Replay | null,
): Replay | null {
  if (source === 'top') return prevActive
  return newLocalPb
}

// Pure: should the loader fetch the leaderboard top replay at race start?
// 'pb' never needs it (the source ignores top entirely).
export function ghostSourceNeedsTopFetch(source: GhostSource): boolean {
  return source !== 'pb'
}
