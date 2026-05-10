import type { DerbyCarState } from './derbyVehicleState'
import type { DerbyVehicleConfig } from '@/lib/derbyVehicles'

// Pure damage model for car-car collisions in derby mode. Inputs are two
// car states plus a contact normal computed by derbyTick from the OBB
// resolution pass; output is the per-car health delta and the verdict that
// drove it. derbyTick applies the deltas via derbyVehicleState.applyDamage.
//
// Attribution rule: when one car is clearly the attacker, only the victim
// loses health. When neither car is clearly attacking (slow side-impacts,
// near-equal speeds with neither moving into the contact), damage is
// distributed proportionally to the OPPOSING mass so the lighter car takes
// more. This mirrors the spec laid out in the implementation plan.

export type AttackerVerdict = 'aIsAttacker' | 'bIsAttacker' | 'split'

export interface ContactInfo {
  // Unit normal pointing from a's center to b's center in world XZ. Length 1.
  nx: number
  nz: number
}

export interface CollisionDamage {
  aDelta: number
  bDelta: number
  attacker: AttackerVerdict
  // Magnitude of the relative velocity at the contact, in world units per
  // second. Surfaced for HUD popups and the panel-detach heuristic.
  relativeSpeed: number
}

// Tunable constants. Kept explicit and at module scope so unit tests can
// reason about exact thresholds and so a future tuning pass has one place
// to look.
export const SPEED_DIFF_THRESHOLD = 6
export const VELOCITY_INTO_CONTACT_THRESHOLD = 3
export const DAMAGE_SCALE = 30
export const MAX_HIT_DAMAGE = 80

// World-frame velocity of a car given its physics state. Heading 0 = +X,
// PI/2 = -Z, matching stepPhysics. Speed is signed; a negative speed means
// the car is reversing.
function velocityOf(state: DerbyCarState): { vx: number; vz: number } {
  const { speed, heading } = state.physics
  return {
    vx: Math.cos(heading) * speed,
    vz: -Math.sin(heading) * speed,
  }
}

// "Speed into the contact" for car a, given the contact normal pointing
// from a to b. Positive when a is driving its body toward b. The b version
// flips the normal.
function speedIntoContact(
  state: DerbyCarState,
  nx: number,
  nz: number,
): number {
  const v = velocityOf(state)
  return v.vx * nx + v.vz * nz
}

export function classifyAttacker(
  a: DerbyCarState,
  b: DerbyCarState,
  contact: ContactInfo,
): AttackerVerdict {
  const speedA = Math.abs(a.physics.speed)
  const speedB = Math.abs(b.physics.speed)
  // Faster car wins by a clear margin.
  if (speedA - speedB > SPEED_DIFF_THRESHOLD) return 'aIsAttacker'
  if (speedB - speedA > SPEED_DIFF_THRESHOLD) return 'bIsAttacker'
  // Otherwise, pick whichever car is driving into the contact. The contact
  // normal points a -> b, so a moves into the contact when its velocity
  // component along (nx, nz) is strongly positive; b moves into the contact
  // when its velocity along the reversed normal is strongly positive.
  const aInto = speedIntoContact(a, contact.nx, contact.nz)
  const bInto = speedIntoContact(b, -contact.nx, -contact.nz)
  const aDriving = aInto > VELOCITY_INTO_CONTACT_THRESHOLD
  const bDriving = bInto > VELOCITY_INTO_CONTACT_THRESHOLD
  if (aDriving && !bDriving) return 'aIsAttacker'
  if (bDriving && !aDriving) return 'bIsAttacker'
  return 'split'
}

function clampHit(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0
  if (amount > MAX_HIT_DAMAGE) return MAX_HIT_DAMAGE
  return amount
}

// Resolve a single collision into per-car health deltas. The deltas are
// non-negative magnitudes; derbyTick subtracts them from the affected car
// via applyDamage and credits the attacker's kill counter on a destroying
// hit.
export function resolveCollision(
  a: DerbyCarState,
  b: DerbyCarState,
  aConfig: DerbyVehicleConfig,
  bConfig: DerbyVehicleConfig,
  contact: ContactInfo,
): CollisionDamage {
  const va = velocityOf(a)
  const vb = velocityOf(b)
  const dvx = va.vx - vb.vx
  const dvz = va.vz - vb.vz
  const relativeSpeed = Math.hypot(dvx, dvz)
  // Component of the relative velocity along the contact normal. Always
  // taken as an absolute so a "side-swipe with low normal energy" deals
  // less damage than a head-on at the same closing speed.
  const impactComponent = Math.abs(dvx * contact.nx + dvz * contact.nz)
  const verdict = classifyAttacker(a, b, contact)

  if (relativeSpeed < 1e-3) {
    return { aDelta: 0, bDelta: 0, attacker: verdict, relativeSpeed: 0 }
  }

  if (verdict === 'aIsAttacker') {
    // a's baseDamage scaled by relative speed and the attacker-mass weight
    // applied to b. Mass weight: 2 * mAttacker / (mAttacker + mVictim) so a
    // mass-matched hit is 1.0 and a heavy attacker into a light victim is
    // up to 2x.
    const massFactor =
      (2 * aConfig.mass) / Math.max(1, aConfig.mass + bConfig.mass)
    const raw =
      (aConfig.baseDamage * relativeSpeed * impactComponent * massFactor) /
      DAMAGE_SCALE
    return {
      aDelta: 0,
      bDelta: clampHit(Math.round(raw)),
      attacker: verdict,
      relativeSpeed,
    }
  }
  if (verdict === 'bIsAttacker') {
    const massFactor =
      (2 * bConfig.mass) / Math.max(1, aConfig.mass + bConfig.mass)
    const raw =
      (bConfig.baseDamage * relativeSpeed * impactComponent * massFactor) /
      DAMAGE_SCALE
    return {
      aDelta: clampHit(Math.round(raw)),
      bDelta: 0,
      attacker: verdict,
      relativeSpeed,
    }
  }
  // Split case: both take damage. Each car's incoming damage scales with
  // the OTHER car's baseDamage and mass fraction so the lighter car takes
  // more from the heavier one.
  const totalMass = Math.max(1, aConfig.mass + bConfig.mass)
  const aShare = (2 * bConfig.mass) / totalMass
  const bShare = (2 * aConfig.mass) / totalMass
  const halfA =
    (0.5 * bConfig.baseDamage * relativeSpeed * impactComponent * aShare) /
    DAMAGE_SCALE
  const halfB =
    (0.5 * aConfig.baseDamage * relativeSpeed * impactComponent * bShare) /
    DAMAGE_SCALE
  return {
    aDelta: clampHit(Math.round(halfA)),
    bDelta: clampHit(Math.round(halfB)),
    attacker: 'split',
    relativeSpeed,
  }
}
