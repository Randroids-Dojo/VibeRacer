import { CarParams, DEFAULT_CAR_PARAMS } from './physics'
import {
  resolveLoadout,
  type DragLoadout,
  type ResolvedDragLoadout,
} from '@/lib/dragParts'
import {
  surfaceFromBiomeWeather,
  type DragStripConfig,
} from '@/lib/dragStrips'

// Pure parts-to-CarParams mapping. Players never edit CarParams directly in
// drag mode; they pick parts and the runtime derives params plus a launch
// profile based on the chosen strip's environment. Slope is NOT folded in
// here: it is a per-frame world-acceleration term computed by dragTick from
// slopeAt(profile, arcLengthS) and the car's mass.

export const REFERENCE_WEIGHT_KG = 1200
export const REFERENCE_RPM = 6500
export const RPM_GAIN = 0.35
// Earth-ish gravity in world units per second squared. The world is metric
// arcade so the constant is the only place to retune the strength of slope
// effects.
export const GRAVITY = 9.81

// Drag-mode base values. Road racing uses DEFAULT_CAR_PARAMS; drag picks
// its own ceiling and acceleration so the stock loadout caps at ~200 mph
// (90 m/s * MPS_TO_MPH ≈ 201). Base accel is low because drag now runs a
// 5-gear manual box: the player times shifts and the strip's length, not
// raw accel, gates how close they get to the cap. Salt Flats (800 m) is
// the only strip on which the default loadout can reach the cap, and only
// when shifts are perfect.
export const DRAG_BASE_MAX_SPEED = 90
export const DRAG_BASE_ACCEL = 5

export interface LaunchProfile {
  // Acceleration multiplier applied immediately after a jump-start foul. The
  // multiplier decays exponentially toward 1 at decayPerSec; minDuration
  // floors how long the dampening lasts so a tap that beats GO by 1 ms still
  // feels punishing.
  jumpStartAccelFactor: number
  decayPerSec: number
  minDuration: number
}

export interface DragDerivation {
  totalWeight: number
  weightFactor: number
  rpmFactor: number
  firstGearFactor: number
  topGearFactor: number
  surfaceMul: number
  surfaceKey: 'dry' | 'wet' | 'snow' | 'sand'
  accelMul: number
  maxSpeedMul: number
  // Mass term used by dragTick to scale the gravity-along-slope effect.
  // Heavier cars feel grades more.
  massForSlope: number
  totalAccel: number
  totalMaxSpeed: number
}

export interface DerivedDragSetup {
  params: CarParams
  launch: LaunchProfile
  derivation: DragDerivation
  resolved: ResolvedDragLoadout
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

export function deriveDragCarParams(
  loadout: DragLoadout,
  strip: DragStripConfig,
): DerivedDragSetup {
  const resolved = resolveLoadout(loadout)
  const { tire, body, engine, transmission } = resolved

  const totalWeight =
    body.weight + engine.weight + transmission.weight + tire.weight
  const weightFactor = clamp(REFERENCE_WEIGHT_KG / totalWeight, 0.55, 1.6)

  const rpmFactor = clamp(
    1 + ((engine.launchRpm - REFERENCE_RPM) / REFERENCE_RPM) * RPM_GAIN,
    0.6,
    1.5,
  )

  // Numerically higher first-gear ratio gives stronger off-line acceleration.
  const firstGearFactor = clamp(transmission.firstGearRatio / 2.5, 0.7, 1.5)
  // Numerically lower top-gear ratio is overdrive and yields higher top end.
  // Numerator picks 0.85 so the stock 'standard' transmission (topGearRatio
  // 0.85) lands at 1.0 -- the default loadout caps at DRAG_BASE_MAX_SPEED
  // exactly. Tighter clamp ceiling keeps the long-gear setup from running
  // away to absurd numbers when stacked with a high surface multiplier.
  const topGearFactor = clamp(0.85 / transmission.topGearRatio, 0.7, 1.3)

  const surfaceKey = surfaceFromBiomeWeather(strip)
  const surfaceMul = clamp(
    tire.surfaceAffinity[surfaceKey] * tire.baseGrip,
    0.5,
    1.3,
  )

  const accelMul = weightFactor * rpmFactor * firstGearFactor * surfaceMul
  const maxSpeedMul = topGearFactor * surfaceMul

  const totalAccel = DRAG_BASE_ACCEL * accelMul
  const totalMaxSpeed = DRAG_BASE_MAX_SPEED * maxSpeedMul

  const params: CarParams = {
    maxSpeed: totalMaxSpeed,
    maxReverseSpeed: 0,
    accel: totalAccel,
    brake: DEFAULT_CAR_PARAMS.brake * Math.sqrt(surfaceMul),
    reverseAccel: 0,
    rollingFriction:
      DEFAULT_CAR_PARAMS.rollingFriction * (body.dragCoefficient / 0.34),
    steerRateLow: 0.5,
    steerRateHigh: 0.3,
    minSpeedForSteering: DEFAULT_CAR_PARAMS.minSpeedForSteering,
    offTrackMaxSpeed: DEFAULT_CAR_PARAMS.offTrackMaxSpeed * surfaceMul,
    offTrackDrag: DEFAULT_CAR_PARAMS.offTrackDrag,
  }

  // Higher-RPM engines recover from a foul faster; eco engines slower. Bias
  // is small so the foul always costs something measurable.
  const rpmBias = clamp((engine.launchRpm - REFERENCE_RPM) / REFERENCE_RPM, -0.5, 0.5)
  const launch: LaunchProfile = {
    jumpStartAccelFactor: 0.15,
    decayPerSec: clamp(1.5 + rpmBias * 0.4, 0.9, 2.1),
    minDuration: 0.2,
  }

  const derivation: DragDerivation = {
    totalWeight,
    weightFactor,
    rpmFactor,
    firstGearFactor,
    topGearFactor,
    surfaceMul,
    surfaceKey,
    accelMul,
    maxSpeedMul,
    massForSlope: totalWeight,
    totalAccel,
    totalMaxSpeed,
  }

  return { params, launch, derivation, resolved }
}

// Per-frame world-frame longitudinal acceleration produced by gravity acting
// along the local slope tangent. Negative on uphill (decelerates the car
// moving forward), positive on downhill. Pure helper so dragTick and tests
// agree on the math.
export function slopeAccel(
  slopeRad: number,
  totalWeight: number,
  gravity: number = GRAVITY,
  referenceWeight: number = REFERENCE_WEIGHT_KG,
): number {
  if (!Number.isFinite(slopeRad)) return 0
  if (slopeRad === 0) return 0
  const massRatio = totalWeight / referenceWeight
  return -gravity * Math.sin(slopeRad) * massRatio
}
