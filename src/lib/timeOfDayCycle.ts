import { z } from 'zod'
import {
  DEFAULT_TIME_OF_DAY,
  TIME_OF_DAY_NAMES,
  type TimeOfDay,
} from './lighting'

// Time-of-day auto cycle. When a player picks a non-off mode in Settings, the
// active scene mood rotates through the four time-of-day presets at a fixed
// cadence. Pure cosmetic. Default 'off' so legacy stored payloads keep their
// existing screen exactly as it was.
//
// Modes are wall-clock paced (real-world ms, independent of physics dtMs) so a
// pause does not stall the cycle; the next time the renderer polls the active
// time-of-day ref it picks up wherever the cycle is.

export const TIME_OF_DAY_CYCLE_MODES = ['off', 'slow', 'fast'] as const
export type TimeOfDayCycleMode = (typeof TIME_OF_DAY_CYCLE_MODES)[number]

export const DEFAULT_TIME_OF_DAY_CYCLE: TimeOfDayCycleMode = 'off'

export const TimeOfDayCycleModeSchema = z.enum(TIME_OF_DAY_CYCLE_MODES)

// Friendly labels for the Settings UI. One source of truth for capitalization
// so renames cannot drift between the picker and the persisted enum.
export const TIME_OF_DAY_CYCLE_LABELS: Record<TimeOfDayCycleMode, string> = {
  off: 'Off',
  slow: 'Slow',
  fast: 'Fast',
}

// Short blurbs shown beneath the picker so the player knows what they are
// committing to before they race a long session under it. The numeric cadence
// is intentionally surfaced so a player can predict when the next sky flip
// will land.
export const TIME_OF_DAY_CYCLE_DESCRIPTIONS: Record<TimeOfDayCycleMode, string> = {
  off: 'Hold the picked time of day for the whole session.',
  slow: 'Rotate noon to morning to sunset to night every 5 minutes.',
  fast: 'Rotate noon to morning to sunset to night every 60 seconds.',
}

// Per-mode dwell time in ms. 'fast' is a brisk demo cadence so a single race
// of an oval-sized track sees one or two transitions. 'slow' is paced so a
// long session sees variety without flickering between presets every lap.
// 'off' is sentinel-only (no cycle effect runs) but we expose a value so the
// helper surface stays uniform.
export const TIME_OF_DAY_CYCLE_PERIOD_MS: Record<TimeOfDayCycleMode, number> = {
  off: 0,
  slow: 5 * 60 * 1000,
  fast: 60 * 1000,
}

// Fixed rotation order: noon -> morning -> sunset -> night -> back to noon.
// Mirrors a real day so the visual pacing feels natural even without
// crossfade. Keeping the order separate from `TIME_OF_DAY_NAMES` (which is
// the canonical schema enum) means a future schema reorder cannot accidentally
// scramble the rotation.
export const TIME_OF_DAY_CYCLE_ORDER: readonly TimeOfDay[] = [
  'noon',
  'morning',
  'sunset',
  'night',
] as const

// Index of `name` in the rotation. Returns 0 when the input is unknown so a
// corrupt mood (e.g. a future preset that is not yet in the rotation list)
// degrades to "start at noon" rather than throwing or returning -1.
export function cycleIndexFor(name: TimeOfDay | null | undefined): number {
  if (name == null) return 0
  const idx = TIME_OF_DAY_CYCLE_ORDER.indexOf(name)
  return idx >= 0 ? idx : 0
}

// Look up the active time-of-day at a given moment in the cycle. Pure: same
// inputs always return the same output, so unit tests are trivial and the
// renderer effect can call this each tick without side effects.
//
// `mode` 'off' short-circuits to the base time-of-day so a flip back to off
// snaps the scene to whatever the player picked.
//
// `startMs` and `nowMs` are wall-clock-style epoch milliseconds. The helper
// is defensive against reversed clocks (nowMs < startMs) and non-finite or
// non-positive periods so a pathological input never traps the renderer.
//
// `base` seeds the rotation: passing the player's current pick keeps the
// cycle visually anchored to wherever they were last looking, so flipping
// the cycle on does not snap to noon mid-race.
export function activeTimeOfDayAt(
  startMs: number,
  nowMs: number,
  mode: TimeOfDayCycleMode,
  base: TimeOfDay,
): TimeOfDay {
  if (mode === 'off') return base
  const period = TIME_OF_DAY_CYCLE_PERIOD_MS[mode]
  if (!Number.isFinite(period) || period <= 0) return base
  if (!Number.isFinite(startMs) || !Number.isFinite(nowMs)) return base
  const elapsed = Math.max(0, nowMs - startMs)
  const stepsAdvanced = Math.floor(elapsed / period)
  const baseIdx = cycleIndexFor(base)
  const len = TIME_OF_DAY_CYCLE_ORDER.length
  // Modulo over a positive length is always non-negative since stepsAdvanced is
  // floored from a non-negative number, but guard against a degenerate empty
  // rotation just in case the table is ever shortened.
  if (len <= 0) return base
  const idx = ((baseIdx + stepsAdvanced) % len + len) % len
  return TIME_OF_DAY_CYCLE_ORDER[idx]
}

// Type guard for safe ingestion of stored / URL values without invoking the
// full schema parser.
export function isTimeOfDayCycleMode(value: unknown): value is TimeOfDayCycleMode {
  return (
    typeof value === 'string' &&
    (TIME_OF_DAY_CYCLE_MODES as readonly string[]).includes(value)
  )
}

// Re-export the canonical name list so a downstream module can iterate the
// cycle's rotation order without importing both this module and `lighting.ts`
// just to get a `TimeOfDay` value. Useful for tests that walk every preset.
export { TIME_OF_DAY_NAMES, DEFAULT_TIME_OF_DAY }
