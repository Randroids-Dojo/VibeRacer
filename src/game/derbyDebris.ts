import type { Object3D } from 'three'

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
  // Reset to false on cull so the host can drop it from the active list.
  alive: boolean
}

export const DEBRIS_GRAVITY = -16
export const DEBRIS_GROUND_RESTITUTION = 0.35
export const DEBRIS_GROUND_FRICTION = 0.7

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
    if (item.object.position.y <= 0) {
      item.object.position.y = 0
      if (Math.abs(item.vy) < 0.5) {
        item.vy = 0
        // Clamp the friction multiplier above zero so a frame drop or tab
        // backgrounding cannot flip velocity sign.
        const damp = Math.max(0, 1 - DEBRIS_GROUND_FRICTION * dtSec * 4)
        item.vx *= damp
        item.vz *= damp
      } else {
        item.vy = -item.vy * DEBRIS_GROUND_RESTITUTION
        item.vx *= 1 - DEBRIS_GROUND_FRICTION * 0.5
        item.vz *= 1 - DEBRIS_GROUND_FRICTION * 0.5
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

