import { Box3, Mesh, type Object3D, Vector3 } from 'three'

// Ballistic integrator for detached panels. Each free body owns an
// Object3D, a linear velocity, an angular velocity, and a ground-Y
// derived from its bounding box. Gravity pulls it down each frame; on
// touchdown the body bounces with restitution and damps linear +
// angular motion. Once total motion drops under a threshold the body
// locks against the ground plane so the wreck eventually settles.
//
// This is a new, lab-local integrator. It is intentionally separate
// from derbyDebris.ts because the parameters and ownership semantics
// differ (no arena radius culling, no shrapnel pool, panels keep their
// material until repair). The two modules are not related at runtime.

export const FREE_BODY_GRAVITY = -16
export const FREE_BODY_RESTITUTION = 0.32
export const FREE_BODY_GROUND_FRICTION = 0.6
export const FREE_BODY_ANGULAR_BOUNCE_DAMP = 0.55
const REST_SPEED = 0.4

export interface FreeBody {
  object: Object3D
  vx: number
  vy: number
  vz: number
  rotX: number
  rotY: number
  rotZ: number
  // World-space Y at which the panel rests on the ground.
  groundY: number
  alive: boolean
}

// Compute the smallest half-extent of `object`'s bounding box. Panels
// rest on their thin side so the smallest half-extent is the correct
// ground offset. A degenerate bbox falls back to a tiny floor so a
// missing geometry does not pin the panel through the ground plane.
export function computeGroundY(object: Object3D): number {
  const box = new Box3()
  let hasGeometry = false
  object.traverse((node) => {
    if (node instanceof Mesh && node.geometry) hasGeometry = true
  })
  if (!hasGeometry) return 0.05
  box.setFromObject(object)
  if (!Number.isFinite(box.min.x) || box.isEmpty()) return 0.05
  const size = box.getSize(new Vector3())
  const half = Math.min(size.x, size.y, size.z) * 0.5
  return Math.max(0.04, half)
}

export interface SpawnSeed {
  position: { x: number; y: number; z: number }
  // Outward XZ direction the panel was hit from; the integrator uses
  // this as the dominant linear-velocity axis so a hood pops away from
  // the front of the car.
  outward: { nx: number; nz: number }
  // Linear-velocity magnitude along the outward direction.
  linearSpeed: number
  // Vertical kick. Adds upward bounce so panels arc instead of sliding
  // off flat.
  upKick: number
  rng: () => number
}

export function spawnFreeBody(object: Object3D, seed: SpawnSeed): FreeBody {
  object.position.set(seed.position.x, seed.position.y, seed.position.z)
  const jx = (seed.rng() - 0.5) * 1.6
  const jz = (seed.rng() - 0.5) * 1.6
  return {
    object,
    vx: seed.outward.nx * seed.linearSpeed + jx,
    vy: seed.upKick + seed.rng() * 1.4,
    vz: seed.outward.nz * seed.linearSpeed + jz,
    rotX: (seed.rng() - 0.5) * 6,
    rotY: (seed.rng() - 0.5) * 6,
    rotZ: (seed.rng() - 0.5) * 6,
    groundY: computeGroundY(object),
    alive: true,
  }
}

export function tickFreeBodies(items: FreeBody[], dtSec: number): void {
  for (const item of items) {
    if (!item.alive) continue
    item.vy += FREE_BODY_GRAVITY * dtSec
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
        const damp = Math.max(0, 1 - FREE_BODY_GROUND_FRICTION * dtSec * 4)
        item.vx *= damp
        item.vz *= damp
        if (Math.hypot(item.vx, item.vz) < REST_SPEED) {
          item.rotX = 0
          item.rotY = 0
          item.rotZ = 0
        } else {
          item.rotX *= damp
          item.rotY *= damp
          item.rotZ *= damp
        }
      } else {
        item.vy = -item.vy * FREE_BODY_RESTITUTION
        item.vx *= 1 - FREE_BODY_GROUND_FRICTION * 0.5
        item.vz *= 1 - FREE_BODY_GROUND_FRICTION * 0.5
        item.rotX *= FREE_BODY_ANGULAR_BOUNCE_DAMP
        item.rotY *= FREE_BODY_ANGULAR_BOUNCE_DAMP
        item.rotZ *= FREE_BODY_ANGULAR_BOUNCE_DAMP
      }
    }
  }
}

// Compact the array, dropping bodies marked dead. Bodies are never
// auto-marked dead by this integrator; the orchestrator marks them
// dead when it wants to recycle them (e.g. exceeded cap).
export function pruneFreeBodies(items: FreeBody[]): number {
  let writeIdx = 0
  let removed = 0
  for (let i = 0; i < items.length; i++) {
    if (items[i].alive) {
      items[writeIdx++] = items[i]
    } else {
      removed++
    }
  }
  items.length = writeIdx
  return removed
}
