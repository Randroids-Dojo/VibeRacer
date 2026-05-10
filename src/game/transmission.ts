import type { CarParams } from './physics'

export const TRANSMISSION_MODES = ['automatic', 'manual'] as const
export type TransmissionMode = (typeof TRANSMISSION_MODES)[number]

export const DEFAULT_TRANSMISSION: TransmissionMode = 'automatic'

export const MANUAL_GEAR_MIN = 1
export const MANUAL_GEAR_MAX = 5
export const DEFAULT_MANUAL_GEAR = 1

export interface ManualGearSpec {
  gear: number
  maxSpeedFactor: number
  accelFactor: number
}

// Geometric spacing (each gear ~1.37x the last) so RPM lands in the same band
// across shifts, and lower gears cover narrow speed ranges. Real gearboxes are
// laid out like this; arithmetic spacing flattened the feel of every shift.
export const MANUAL_GEAR_SPECS: readonly ManualGearSpec[] = [
  { gear: 1, maxSpeedFactor: 0.28, accelFactor: 1.65 },
  { gear: 2, maxSpeedFactor: 0.4, accelFactor: 1.35 },
  { gear: 3, maxSpeedFactor: 0.55, accelFactor: 1.1 },
  { gear: 4, maxSpeedFactor: 0.75, accelFactor: 0.9 },
  { gear: 5, maxSpeedFactor: 1, accelFactor: 0.75 },
] as const

export function isTransmissionMode(value: unknown): value is TransmissionMode {
  return (
    typeof value === 'string' &&
    (TRANSMISSION_MODES as readonly string[]).includes(value)
  )
}

export function clampManualGear(gear: number): number {
  if (!Number.isFinite(gear)) return DEFAULT_MANUAL_GEAR
  return Math.max(MANUAL_GEAR_MIN, Math.min(MANUAL_GEAR_MAX, Math.round(gear)))
}

export function shiftManualGear(
  currentGear: number,
  direction: 'up' | 'down',
): number {
  const gear = clampManualGear(currentGear)
  return clampManualGear(direction === 'up' ? gear + 1 : gear - 1)
}

export function manualGearSpec(gear: number): ManualGearSpec {
  const clamped = clampManualGear(gear)
  return MANUAL_GEAR_SPECS[clamped - 1]
}

export function carParamsForTransmission(
  params: CarParams,
  mode: TransmissionMode,
  gear: number,
): CarParams {
  if (mode !== 'manual') return params
  const spec = manualGearSpec(gear)
  return {
    ...params,
    maxSpeed: Math.max(1, params.maxSpeed * spec.maxSpeedFactor),
    accel: Math.max(0, params.accel * spec.accelFactor),
  }
}

// Speed band each gear covers, in absolute world units. Used both for the
// automatic shift logic (pick the gear whose band the current speed falls in)
// and for the RPM-based audio model (pitch sweeps from idle to redline as
// speed climbs through this band).
export function gearSpeedBand(
  gear: number,
  baseMaxSpeed: number,
): { min: number; max: number } {
  const clamped = clampManualGear(gear)
  const spec = MANUAL_GEAR_SPECS[clamped - 1]
  const prevFactor =
    clamped > 1 ? MANUAL_GEAR_SPECS[clamped - 2].maxSpeedFactor : 0
  return {
    min: Math.max(0, prevFactor * baseMaxSpeed),
    max: Math.max(0, spec.maxSpeedFactor * baseMaxSpeed),
  }
}

// 0 at the gear's min speed, 1 at the gear's max speed. This is the audio's
// stand-in for engine RPM: pitch and filter sweep from idle to redline as the
// player drives through the band, then snap back when the gear changes.
// Hot path (called twice per audio frame plus once for the HUD); kept
// allocation-free to avoid GC churn on a 60Hz rAF loop.
export function gearProgress01(
  speedAbs: number,
  gear: number,
  baseMaxSpeed: number,
): number {
  const clamped = clampManualGear(gear)
  const spec = MANUAL_GEAR_SPECS[clamped - 1]
  const prevFactor =
    clamped > 1 ? MANUAL_GEAR_SPECS[clamped - 2].maxSpeedFactor : 0
  const min = prevFactor * baseMaxSpeed
  const max = spec.maxSpeedFactor * baseMaxSpeed
  const span = max - min
  if (span <= 1e-6) return 0
  const t = (speedAbs - min) / span
  return t < 0 ? 0 : t > 1 ? 1 : t
}

// Hysteresis on auto-downshifts. Downshift only when the ratio falls to 70%
// of the previous gear's max. Without this the car flip-flops between gears
// every time you brush the boundary under partial throttle.
const AUTO_DOWNSHIFT_HYSTERESIS = 0.7

// Auto transmission shift logic. Upshifts greedily when the current gear's
// band is exceeded, downshifts only when speed has fallen well into the
// gear-below's band so light throttle modulation doesn't cause oscillation.
export function autoShiftGear(
  speedAbs: number,
  baseMaxSpeed: number,
  prevGear: number,
): number {
  let gear = clampManualGear(prevGear)
  if (baseMaxSpeed <= 0) return MANUAL_GEAR_MIN
  const ratio = speedAbs / baseMaxSpeed
  while (
    gear < MANUAL_GEAR_MAX &&
    ratio > MANUAL_GEAR_SPECS[gear - 1].maxSpeedFactor
  ) {
    gear += 1
  }
  while (
    gear > MANUAL_GEAR_MIN &&
    ratio < MANUAL_GEAR_SPECS[gear - 2].maxSpeedFactor * AUTO_DOWNSHIFT_HYSTERESIS
  ) {
    gear -= 1
  }
  return gear
}
