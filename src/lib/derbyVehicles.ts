import type { CarParams } from '@/game/physics'
import type { DerbyVehicleType } from './schemas'

// Derby vehicle catalog. Four prebuilt vehicles, each pretuned. The CarParams
// here feed the same stepPhysics() the loop and drag modes use; the extra
// fields (health, baseDamage, mass, collisionRadius) drive the derby damage
// model in src/game/derbyDamage.ts. theoreticalMinWinMs is the lowest plausible
// time-to-win for this vehicle type and is used as a server-side anti-cheat
// floor when accepting leaderboard submissions in /api/derby/submit.

export interface DerbyVehicleConfig {
  type: DerbyVehicleType
  displayName: string
  // Path to the GLB asset under /public. Slice 8 lands the placeholder GLBs
  // that satisfy the named-submesh contract; real assets swap in later with
  // no code changes.
  modelUrl: string
  carParams: CarParams
  // Starting health for this vehicle. Higher health vehicles take more hits
  // to destroy. Range 130..400 for v1.
  health: number
  // Base damage scalar this vehicle deals on a clean hit. The actual damage
  // applied by derbyDamage scales this linearly by closing speed and the
  // attacker/victim mass ratio. Range 12..24 for v1.
  baseDamage: number
  // Mass in arbitrary units. Used for collision impulse split and the
  // attacker heuristic when speeds are close. Range 800..3000 for v1.
  mass: number
  // Approximate XZ-plane collision radius around the car center. Used for
  // arena containment and as a cheap broad-phase before the per-pair OBB
  // narrow-phase test. Should be >= half the diagonal of the OBB so it
  // never misses a real overlap.
  collisionRadius: number
  // Oriented-bounding-box half-extents, in metres. width = half the
  // dimension along the car's local X axis (door-to-door); length = half
  // the dimension along the local forward axis. Used by derbyTick's OBB
  // SAT contact pass so a long vehicle cannot be clipped
  // through its front or rear by a smaller car.
  obbHalfWidth: number
  obbHalfLength: number
  // Theoretical lowest time-to-win for this vehicle in milliseconds. The
  // server rejects submissions that beat this floor. Computed from the
  // vehicle's baseDamage and the worst-case enemy health (the schoolBus at
  // full health) assuming continuous full-power ramming, with a 30 percent
  // headroom cushion.
  theoreticalMinWinMs: number
  blurb: string
}

// CarParams baselines. Each vehicle starts from DEFAULT_CAR_PARAMS-ish numbers
// and skews on a small set of axes (top speed, accel, steering, off-track
// behavior) to give each pick a distinct feel without exploding the tuning
// surface. Derby never goes off-piece in v1 (the arena is one open dirt
// disk), so offTrackMaxSpeed and offTrackDrag are set to mostly mirror the
// on-track numbers.

const CAR_PARAMS: CarParams = {
  maxSpeed: 24,
  maxReverseSpeed: 9,
  accel: 16,
  brake: 32,
  reverseAccel: 11,
  rollingFriction: 4,
  steerRateLow: 2.4,
  steerRateHigh: 2.0,
  minSpeedForSteering: 0.6,
  offTrackMaxSpeed: 22,
  offTrackDrag: 6,
}

const SCHOOL_BUS_PARAMS: CarParams = {
  maxSpeed: 18,
  maxReverseSpeed: 6,
  accel: 9,
  brake: 22,
  reverseAccel: 7,
  rollingFriction: 5,
  steerRateLow: 1.4,
  steerRateHigh: 1.1,
  minSpeedForSteering: 0.6,
  offTrackMaxSpeed: 16,
  offTrackDrag: 5,
}

const BIG_TRUCK_PARAMS: CarParams = {
  maxSpeed: 20,
  maxReverseSpeed: 7,
  accel: 11,
  brake: 26,
  reverseAccel: 8,
  rollingFriction: 5,
  steerRateLow: 1.6,
  steerRateHigh: 1.3,
  minSpeedForSteering: 0.6,
  offTrackMaxSpeed: 18,
  offTrackDrag: 5,
}

const RACECAR_PARAMS: CarParams = {
  maxSpeed: 32,
  maxReverseSpeed: 10,
  accel: 22,
  brake: 40,
  reverseAccel: 12,
  rollingFriction: 4,
  steerRateLow: 2.8,
  steerRateHigh: 2.4,
  minSpeedForSteering: 0.6,
  offTrackMaxSpeed: 28,
  offTrackDrag: 7,
}

// The ambulance has the highest health among shipping vehicles; the worst
// case for time-to-win is destroying three ambulances. Multiply by an
// inverse efficiency floor so the anti-cheat floor stays generous: a real
// player landing every hit at peak closing speed will still clear it.
const WORST_CASE_TARGET_HEALTH = 400 * 3
const ANTI_CHEAT_HEADROOM = 0.7

function theoreticalMinWinMs(baseDamage: number): number {
  // Crude lower bound: assume one impactful hit per 1.2 seconds at this
  // vehicle's baseDamage. Multiply through by the cushion. The real number
  // is far higher in practice; this exists to reject impossibly-fast
  // submissions, not to predict good-player times.
  const hitsRequired = WORST_CASE_TARGET_HEALTH / baseDamage
  const naiveMs = hitsRequired * 1200
  return Math.round(naiveMs * ANTI_CHEAT_HEADROOM)
}

export const DERBY_VEHICLES: Record<DerbyVehicleType, DerbyVehicleConfig> = {
  car: {
    type: 'car',
    displayName: 'Sedan',
    modelUrl: '/models/derby/car.glb',
    carParams: CAR_PARAMS,
    health: 200,
    baseDamage: 7,
    mass: 1300,
    // Kenney CC0 sedan, sliced into named submeshes in
    // tools/blender/slice_kenney_vehicle.py. GLB bbox: W 4.50 x L 3.67.
    // Half-diagonal = 2.91; bump to 3.0 so the broad phase always wraps
    // any OBB overlap.
    collisionRadius: 3.00,
    obbHalfWidth: 2.25,
    obbHalfLength: 1.83,
    theoreticalMinWinMs: theoreticalMinWinMs(7),
    blurb: 'Balanced ride. Enough speed to chase, enough HP to trade hits.',
  },
  schoolBus: {
    // 'schoolBus' is the stable internal type id so existing leaderboards
    // keep parsing. The player-facing vehicle is the Kenney CC0 ambulance.
    type: 'schoolBus',
    displayName: 'Ambulance',
    modelUrl: '/models/derby/schoolBus.glb',
    carParams: SCHOOL_BUS_PARAMS,
    health: 400,
    baseDamage: 8,
    mass: 2800,
    // GLB bbox: W 4.80 x L 6.45. Half-diagonal ~4.04.
    collisionRadius: 4.20,
    obbHalfWidth: 2.40,
    obbHalfLength: 3.22,
    theoreticalMinWinMs: theoreticalMinWinMs(8),
    blurb: 'Long-wheelbase tank. Soaks dozens of hits and shoves anything sideways.',
  },
  bigTruck: {
    type: 'bigTruck',
    displayName: 'Pickup Truck',
    modelUrl: '/models/derby/bigTruck.glb',
    carParams: BIG_TRUCK_PARAMS,
    health: 320,
    baseDamage: 12,
    mass: 2400,
    // GLB bbox: W 5.10 x L 4.81. Half-diagonal ~3.51.
    collisionRadius: 3.60,
    obbHalfWidth: 2.55,
    obbHalfLength: 2.40,
    theoreticalMinWinMs: theoreticalMinWinMs(12),
    blurb: 'Heavy hitter. The hardest single hit in the field; chews through lighter cars.',
  },
  racecar: {
    type: 'racecar',
    displayName: 'Race Car',
    modelUrl: '/models/derby/racecar.glb',
    carParams: RACECAR_PARAMS,
    health: 130,
    baseDamage: 6,
    mass: 900,
    // GLB bbox: W 4.20 x L 3.76. Half-diagonal ~2.82.
    collisionRadius: 2.95,
    obbHalfWidth: 2.10,
    obbHalfLength: 1.88,
    theoreticalMinWinMs: theoreticalMinWinMs(6),
    blurb: 'Glass cannon on wheels. Outmaneuver heavies or you melt in a handful of hits.',
  },
}

export const ALL_DERBY_VEHICLES: readonly DerbyVehicleConfig[] = (
  ['car', 'schoolBus', 'bigTruck', 'racecar'] as const
).map((t) => DERBY_VEHICLES[t])

// Stable string used by derbyConfigHash() to pin the catalog into the start
// token. Includes only fields a server change would invalidate a leaderboard
// run for; cosmetic fields (displayName, blurb) are excluded so renames do
// not poison in-flight tokens.
export function derbyVehicleCanonical(v: DerbyVehicleConfig): string {
  return JSON.stringify({
    type: v.type,
    health: v.health,
    baseDamage: v.baseDamage,
    mass: v.mass,
    collisionRadius: v.collisionRadius,
    obbHalfWidth: v.obbHalfWidth,
    obbHalfLength: v.obbHalfLength,
    carParams: v.carParams,
    // Anti-cheat floor is consulted by /api/derby/submit. Pinning it into
    // the configHash means a server-side floor change retires in-flight
    // tokens cleanly instead of silently changing the rules under them.
    theoreticalMinWinMs: v.theoreticalMinWinMs,
  })
}
