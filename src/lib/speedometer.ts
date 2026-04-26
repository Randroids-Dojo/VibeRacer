// Speedometer math. Pure helpers shared by the HUD speedometer overlay and
// any future telemetry surface.
//
// The physics integrator in `src/game/physics.ts` works in abstract world
// units per second. For a player-readable speedometer we treat 1 world unit
// as roughly 1 meter so the resulting numbers feel arcade-plausible: the
// stock car's `maxSpeed = 26` reads as ~58 mph or ~94 km/h, which lines up
// with the cartoony driving feel of the rest of the game. The "us" unit is
// also exposed for tuners who care about the raw integrator number.
//
// All conversion helpers take the signed raw speed (negative when the car is
// reversing) and return an absolute display value. The signed value is
// retained at the call site so the speedometer can render a different glyph
// for reverse if desired.

import { z } from 'zod'

export const SPEED_UNITS = ['mph', 'kmh', 'us'] as const
export type SpeedUnit = (typeof SPEED_UNITS)[number]

export const DEFAULT_SPEED_UNIT: SpeedUnit = 'mph'

// 1 m/s -> 2.2369362920544 mph, 3.6 km/h. Constants pinned so refactors
// can't quietly drift the displayed speed.
export const MPS_TO_MPH = 2.2369362920544
export const MPS_TO_KMH = 3.6

export const SpeedUnitSchema = z.enum(SPEED_UNITS)

export function convertSpeed(rawUs: number, unit: SpeedUnit): number {
  if (!Number.isFinite(rawUs)) return 0
  const abs = Math.abs(rawUs)
  switch (unit) {
    case 'mph':
      return abs * MPS_TO_MPH
    case 'kmh':
      return abs * MPS_TO_KMH
    case 'us':
      return abs
  }
}

// Round-and-stringify to a single decimal at low units (us) and to whole
// numbers at higher-magnitude units (mph/kmh). Keeps the readout legible at
// a glance without flickering decimal noise on the larger units.
export function formatSpeed(rawUs: number, unit: SpeedUnit): string {
  const value = convertSpeed(rawUs, unit)
  if (unit === 'us') {
    return value.toFixed(1)
  }
  return Math.round(value).toString()
}

export function unitLabel(unit: SpeedUnit): string {
  switch (unit) {
    case 'mph':
      return 'MPH'
    case 'kmh':
      return 'KM/H'
    case 'us':
      return 'U/S'
  }
}

// Map a signed raw speed plus the player's current `maxSpeed` tuning onto a
// 0..1 fraction for the gauge needle. Negative speeds (reverse) read as 0
// fraction so the needle does not swing under the dial; the numeric readout
// still shows the magnitude. Defensive against zero / negative maxSpeed.
export function speedFraction(rawUs: number, maxSpeed: number): number {
  if (!Number.isFinite(rawUs) || !Number.isFinite(maxSpeed)) return 0
  if (maxSpeed <= 0) return 0
  const f = rawUs / maxSpeed
  if (f <= 0) return 0
  if (f >= 1) return 1
  return f
}

// Update the running session-best top speed (always a non-negative magnitude).
// Returns the new top plus a `becameTop` flag the caller can use to fire a
// celebration cue (a pulse, a toast, etc.) on the exact frame the player
// crossed their own bar. Reverse driving collapses to its absolute value so a
// hard reversal does not silently set a high "top" the gauge cannot show.
//
// The bar advances strictly: a tie does NOT count as "new top" because that
// would retrigger the celebration on every frame at the same peak. Defensive
// against non-finite inputs so a one-frame physics glitch can never poison the
// stored peak with NaN.
export function updateTopSpeed(
  prevTopUs: number,
  currentRawUs: number,
): { topUs: number; becameTop: boolean } {
  const safePrev = Number.isFinite(prevTopUs) && prevTopUs > 0 ? prevTopUs : 0
  if (!Number.isFinite(currentRawUs)) {
    return { topUs: safePrev, becameTop: false }
  }
  const abs = Math.abs(currentRawUs)
  if (abs > safePrev) {
    return { topUs: abs, becameTop: true }
  }
  return { topUs: safePrev, becameTop: false }
}

// Map a session-best speed magnitude to the same 0..1 fraction `speedFraction`
// uses for the live needle, so the marker tick sits on the same arc. Always
// non-negative input by construction (the tracker collapses reverse to its
// magnitude). Defensive against zero / negative maxSpeed and non-finite peak.
export function topSpeedFraction(topUs: number, maxSpeed: number): number {
  if (!Number.isFinite(topUs) || topUs <= 0) return 0
  if (!Number.isFinite(maxSpeed) || maxSpeed <= 0) return 0
  const f = topUs / maxSpeed
  if (f <= 0) return 0
  if (f >= 1) return 1
  return f
}
