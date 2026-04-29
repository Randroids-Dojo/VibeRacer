import type { CarParams } from './physics'

export const TRACK_TRANSMISSION_MODES = ['automatic', 'manual'] as const
export type TrackTransmissionMode = (typeof TRACK_TRANSMISSION_MODES)[number]

export const DEFAULT_TRACK_TRANSMISSION: TrackTransmissionMode = 'automatic'

export const MANUAL_GEAR_MIN = 1
export const MANUAL_GEAR_MAX = 5
export const DEFAULT_MANUAL_GEAR = 1

export interface ManualGearSpec {
  gear: number
  maxSpeedFactor: number
  accelFactor: number
}

export const MANUAL_GEAR_SPECS: readonly ManualGearSpec[] = [
  { gear: 1, maxSpeedFactor: 0.34, accelFactor: 1.45 },
  { gear: 2, maxSpeedFactor: 0.5, accelFactor: 1.25 },
  { gear: 3, maxSpeedFactor: 0.66, accelFactor: 1.05 },
  { gear: 4, maxSpeedFactor: 0.82, accelFactor: 0.9 },
  { gear: 5, maxSpeedFactor: 1, accelFactor: 0.78 },
] as const

export function isTrackTransmissionMode(
  value: unknown,
): value is TrackTransmissionMode {
  return (
    typeof value === 'string' &&
    (TRACK_TRANSMISSION_MODES as readonly string[]).includes(value)
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
  mode: TrackTransmissionMode,
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
