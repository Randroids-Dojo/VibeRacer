import { Box3, Mesh, type Object3D } from 'three'

// Tiny ballistic integrator for detached vehicle panels in derby mode. A
// piece of debris is a Three.js Object3D plus a position/velocity/spin
// triple; the simulator advances it each frame with constant gravity and
// no horizontal drag, bounces it once on the ground plane (y = 0) with
// loss, and culls it when it leaves the arena bounds. Collisions between
// debris and cars are explicitly skipped: it would more than double the
// per-frame contact work without changing gameplay since debris is
// purely cosmetic in v1.

export interface DerbyDebrisItem {
  object: Object3D
  // World-space velocity (units per second).
  vx: number
  vy: number
  vz: number
  // Angular velocity around each axis (radians per second).
  rotX: number
  rotY: number
  rotZ: number
  // World-space Y at which the item rests on the ground. Equals the
  // panel's smallest half-extent so a flat panel does not clip below the
  // dirt; falls back to a small floor (0.05) when the mesh has no usable
  // bounding box.
  groundY: number
  // Reset to false on cull so the host can drop it from the active list.
  alive: boolean
}

export const DEBRIS_GRAVITY = -16
export const DEBRIS_GROUND_RESTITUTION = 0.35
export const DEBRIS_GROUND_FRICTION = 0.7
// Multiplier applied to angular velocity on every bounce. Each ground
// impact bleeds rotational energy so panels don't keep spinning forever
// after they settle.
export const DEBRIS_ANGULAR_BOUNCE_DAMP = 0.55
// Linear-velocity threshold under which we consider the panel settled and
// snap its angular velocity to zero. Without this, a panel that bounced
// flat still spins about its vertical axis indefinitely.
const DEBRIS_REST_SPEED = 0.4

// Compute the smallest half-extent of the object's bounding box. A flat
// panel rests on its thin side so its center sits at half the thickness
// above the ground plane. Using min half-extent avoids the panel
// floating high (max half-extent) or clipping deep (zero).
export function computeGroundY(object: Object3D): number {
  const box = new Box3()
  let hasGeometry = false
  object.traverse((node) => {
    if (node instanceof Mesh && node.geometry) {
      hasGeometry = true
    }
  })
  if (!hasGeometry) return 0.05
  box.setFromObject(object)
  if (
    !Number.isFinite(box.min.x) ||
    !Number.isFinite(box.min.y) ||
    !Number.isFinite(box.min.z) ||
    !Number.isFinite(box.max.x) ||
    !Number.isFinite(box.max.y) ||
    !Number.isFinite(box.max.z)
  ) {
    return 0.05
  }
  const halfX = (box.max.x - box.min.x) / 2
  const halfY = (box.max.y - box.min.y) / 2
  const halfZ = (box.max.z - box.min.z) / 2
  const minHalf = Math.min(halfX, halfY, halfZ)
  return Math.max(0.05, minHalf)
}

// Spawn a piece of debris at the given world position with an outward
// initial velocity and a random spin. Reuses the supplied Mesh as-is so
// the caller controls the visual geometry; the integrator only writes to
// position and rotation. Caller is responsible for adding `object` to the
// scene before calling.
export function spawnDebris(
  object: Object3D,
  position: { x: number; y: number; z: number },
  outward: { nx: number; nz: number },
  speed: number,
  rng: () => number,
): DerbyDebrisItem {
  object.position.set(position.x, position.y, position.z)
  return {
    object,
    vx: outward.nx * speed + (rng() - 0.5) * 2,
    vy: 4 + rng() * 3,
    vz: outward.nz * speed + (rng() - 0.5) * 2,
    rotX: (rng() - 0.5) * 6,
    rotY: (rng() - 0.5) * 6,
    rotZ: (rng() - 0.5) * 6,
    groundY: computeGroundY(object),
    alive: true,
  }
}

// Advance every alive item by dt seconds. Items that hit the ground bounce
// once with a fixed restitution; once vertical speed drops below 0.5 m/s
// after a bounce, the item locks to the ground and stops integrating.
// Items outside the bounding circle of arenaRadius get culled.
export function tickDebris(
  items: DerbyDebrisItem[],
  dtSec: number,
  arenaRadius: number,
): void {
  for (const item of items) {
    if (!item.alive) continue
    // Apply gravity.
    item.vy += DEBRIS_GRAVITY * dtSec
    item.object.position.x += item.vx * dtSec
    item.object.position.y += item.vy * dtSec
    item.object.position.z += item.vz * dtSec
    item.object.rotation.x += item.rotX * dtSec
    item.object.rotation.y += item.rotY * dtSec
    item.object.rotation.z += item.rotZ * dtSec
    if (item.object.position.y <= item.groundY) {
      item.object.position.y = item.groundY
      if (Math.abs(item.vy) < 0.5) {
        item.vy = 0
        // Clamp the friction multiplier above zero so a frame drop or tab
        // backgrounding cannot flip velocity sign.
        const damp = Math.max(0, 1 - DEBRIS_GROUND_FRICTION * dtSec * 4)
        item.vx *= damp
        item.vz *= damp
        // Once linear motion has settled to a crawl, zero angular velocity
        // so the panel stops spinning. Without this the panel pirouettes
        // forever after it stops sliding because nothing in the integrator
        // damps rotational energy.
        if (Math.hypot(item.vx, item.vz) < DEBRIS_REST_SPEED) {
          item.rotX = 0
          item.rotY = 0
          item.rotZ = 0
        } else {
          item.rotX *= damp
          item.rotY *= damp
          item.rotZ *= damp
        }
      } else {
        item.vy = -item.vy * DEBRIS_GROUND_RESTITUTION
        item.vx *= 1 - DEBRIS_GROUND_FRICTION * 0.5
        item.vz *= 1 - DEBRIS_GROUND_FRICTION * 0.5
        // Drop rotational energy on every bounce so the panel doesn't
        // tumble forever even before vy settles.
        item.rotX *= DEBRIS_ANGULAR_BOUNCE_DAMP
        item.rotY *= DEBRIS_ANGULAR_BOUNCE_DAMP
        item.rotZ *= DEBRIS_ANGULAR_BOUNCE_DAMP
      }
    }
    const r = Math.hypot(item.object.position.x, item.object.position.z)
    if (r > arenaRadius + 4) {
      item.alive = false
    }
  }
}

// Convenience: scrub the dead items out of the array, returning the count
// removed so the caller can dispose related materials/geometry as needed.
export function pruneDebris(items: DerbyDebrisItem[]): number {
  let writeIdx = 0
  let removed = 0
  for (let i = 0; i < items.length; i++) {
    if (items[i].alive) {
      items[writeIdx] = items[i]
      writeIdx++
    } else {
      removed++
    }
  }
  items.length = writeIdx
  return removed
}
