// Per-frame visual effects: rear-tire skid mark trail and matching tire
// smoke puff cloud. Both maintain a fixed-size pool of three.js objects
// recycled in a ring buffer so the scene's draw count stays bounded
// regardless of race length. Pure helpers (alpha curves, ring index math)
// live in `./skidMarks` and `./tireSmoke`; this module owns the imperative
// three.js side-effects so consumers stay decoupled from BufferGeometry,
// Sprite, and Material churn.

import {
  DataTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RGBAFormat,
  Sprite,
  SpriteMaterial,
  UnsignedByteType,
} from 'three'
import { TRACK_WIDTH } from './trackPath'
import {
  SKID_MARK_LENGTH,
  SKID_MARK_POOL_SIZE,
  nextSkidMarkIndex,
  skidMarkAlpha,
} from './skidMarks'
import {
  TIRE_SMOKE_BASE_Y,
  TIRE_SMOKE_POOL_SIZE,
  nextTireSmokeIndex,
  puffAlpha,
  puffRise,
  puffScale,
} from './tireSmoke'

// Pool of low-opacity dark planes laid along the rear axle when the tires
// are sliding. Each spawn drops two stripes (one per rear wheel); the pool
// recycles oldest-first so the on-screen footprint stays bounded regardless
// of race length. Each quad owns its own material so per-mark alpha can fade
// independently without touching shaders.
//
// Spawn poses are passed in as world `(x, z, heading)` plus the slide's peak
// intensity. The renderer offsets each mark to the rear-axle stripes (left
// and right of the chassis) so the trail reads as two distinct tire marks.
export interface SkidMarkLayer {
  group: Group
  spawn: (x: number, z: number, heading: number, peakAlpha: number, nowMs: number) => void
  tick: (nowMs: number) => void
  clear: () => void
  dispose: () => void
}

interface SkidMarkSlot {
  mesh: Mesh
  mat: MeshBasicMaterial
  spawnedAt: number
  peak: number
  active: boolean
}

// Half the rear-axle width in world units. TRACK_WIDTH is 8; the car's
// rendered footprint is roughly 2 wide after the GLB scale, so 1.0 places
// the two stripes about a tire's width apart. Tuned visually so the marks
// read as paired stripes rather than a single smeared blob.
const SKID_MARK_REAR_OFFSET = 1.05
// How far behind the chassis center the rear axle sits. The car GLB pivots
// near its midpoint, so this is the back-half of the visible footprint.
const SKID_MARK_REAR_BACK = 1.4
// Sit slightly above the road plane (which itself sits at y=0.01) so the
// marks render on top without z-fighting the road material.
const SKID_MARK_Y = 0.02

export function buildSkidMarkLayer(
  poolSize = SKID_MARK_POOL_SIZE,
): SkidMarkLayer {
  const group = new Group()
  // One geometry shared across every quad in the pool. Each slot owns its
  // own material so per-mark alpha animates independently.
  const geom = new PlaneGeometry(TRACK_WIDTH * 0.08, SKID_MARK_LENGTH)
  const slots: SkidMarkSlot[] = []
  for (let i = 0; i < poolSize; i++) {
    const mat = new MeshBasicMaterial({
      color: 0x1a1a1a,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    })
    const mesh = new Mesh(geom, mat)
    mesh.rotation.x = -Math.PI / 2
    mesh.visible = false
    group.add(mesh)
    slots.push({ mesh, mat, spawnedAt: 0, peak: 0, active: false })
  }

  // Two slots per spawn (one stripe per rear wheel). Track them via a
  // single ring index that advances by 2 each spawn.
  let writeIdx = 0

  function placeSlot(
    slot: SkidMarkSlot,
    cx: number,
    cz: number,
    headingY: number,
    peak: number,
    nowMs: number,
  ) {
    slot.mesh.position.set(cx, SKID_MARK_Y, cz)
    // The plane started in the XY plane (width on X, length on Y). After
    // `rotation.x = -PI/2` the local +Y direction maps to world -Z, so a
    // mark with `rotation.y = 0` lays its length along world -Z. To align
    // the length with the car's heading we rotate about world Y by
    // `heading - PI/2`: at heading 0 (car facing +X) this is -PI/2, which
    // takes -Z back around to +X.
    slot.mesh.rotation.y = headingY - Math.PI / 2
    slot.spawnedAt = nowMs
    slot.peak = peak
    slot.active = true
    slot.mat.opacity = peak
    slot.mesh.visible = peak > 0
  }

  return {
    group,
    spawn(x, z, heading, peakAlpha, nowMs) {
      if (peakAlpha <= 0) return
      // Rear axle is back along the car's local -X (heading 0 looks +X).
      const cosH = Math.cos(heading)
      const sinH = -Math.sin(heading) // world Z = -sin(heading) for our coord system
      // The "back" vector is opposite of the heading.
      const backX = -cosH * SKID_MARK_REAR_BACK
      const backZ = -sinH * SKID_MARK_REAR_BACK
      // The "right" vector is perpendicular to heading in the XZ plane.
      // For heading 0 (+X), right is +Z. So right = (-sinH, cosH) but our
      // sinH already encodes the negation, so:
      const rightX = -sinH
      const rightZ = cosH
      const baseX = x + backX
      const baseZ = z + backZ
      const leftSlot = slots[writeIdx]
      const rightSlot = slots[(writeIdx + 1) % poolSize]
      placeSlot(
        leftSlot,
        baseX + rightX * -SKID_MARK_REAR_OFFSET,
        baseZ + rightZ * -SKID_MARK_REAR_OFFSET,
        heading,
        peakAlpha,
        nowMs,
      )
      placeSlot(
        rightSlot,
        baseX + rightX * SKID_MARK_REAR_OFFSET,
        baseZ + rightZ * SKID_MARK_REAR_OFFSET,
        heading,
        peakAlpha,
        nowMs,
      )
      writeIdx = nextSkidMarkIndex(
        nextSkidMarkIndex(writeIdx, poolSize),
        poolSize,
      )
    },
    tick(nowMs) {
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i]
        if (!s.active) continue
        const age = nowMs - s.spawnedAt
        const a = skidMarkAlpha(age, s.peak)
        if (a <= 0) {
          s.active = false
          s.mesh.visible = false
          s.mat.opacity = 0
        } else {
          s.mat.opacity = a
        }
      }
    },
    clear() {
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i]
        s.active = false
        s.mesh.visible = false
        s.mat.opacity = 0
      }
      writeIdx = 0
    },
    dispose() {
      for (let i = 0; i < slots.length; i++) {
        slots[i].mat.dispose()
      }
      geom.dispose()
    },
  }
}

// Tire smoke puff layer: a fixed pool of soft white camera-facing sprites
// recycled in a ring buffer. Each spawn places two puffs (one per rear wheel)
// at the same world position the skid mark layer uses, then the puff rises
// and fades over its lifetime. Camera-facing sprites avoid having to author
// per-frame billboard math; the SpriteMaterial renders the texture as if it
// always faces the camera, which reads as volumetric smoke from any angle.
export interface TireSmokeLayer {
  group: Group
  spawn: (
    x: number,
    z: number,
    heading: number,
    peakAlpha: number,
    nowMs: number,
  ) => void
  tick: (nowMs: number) => void
  clear: () => void
  dispose: () => void
}

interface TireSmokeSlot {
  sprite: Sprite
  mat: SpriteMaterial
  spawnedAt: number
  peak: number
  baseX: number
  baseZ: number
  active: boolean
}

// Build an alpha-feathered RGBA byte array used as the puff sprite texture.
// Soft circular falloff so the sprite reads as a fluffy round cloud rather
// than a hard square. Pure helper exported for unit testing without a WebGL
// context.
export function buildTireSmokePuffSprite(size: number): Uint8Array {
  if (!Number.isFinite(size) || size <= 0) {
    return new Uint8Array(0)
  }
  const px = Math.floor(size)
  const data = new Uint8Array(px * px * 4)
  const center = (px - 1) / 2
  const radius = px / 2
  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      const dx = x - center
      const dy = y - center
      const dist = Math.sqrt(dx * dx + dy * dy)
      // Soft cosine-style falloff. At the center alpha is full; at the
      // radius edge alpha is zero. Squared falloff hides the hard sprite
      // boundary and reads as a soft puff edge.
      const t = Math.max(0, 1 - dist / radius)
      const alpha = Math.round(255 * t * t)
      const idx = (y * px + x) * 4
      // White RGB; the alpha channel does the visible work.
      data[idx + 0] = 255
      data[idx + 1] = 255
      data[idx + 2] = 255
      data[idx + 3] = alpha
    }
  }
  return data
}

export function buildTireSmokeLayer(
  poolSize = TIRE_SMOKE_POOL_SIZE,
): TireSmokeLayer {
  const group = new Group()

  // Procedural soft round texture so no binary asset ships. 32x32 is plenty
  // for a sprite that scales up to a couple world units at most. NearestFilter
  // would alias the soft edge, so we let the default linear filter handle it.
  const SPRITE_PX = 32
  const spritePixels = buildTireSmokePuffSprite(SPRITE_PX)
  const spriteTex = new DataTexture(
    spritePixels,
    SPRITE_PX,
    SPRITE_PX,
    RGBAFormat,
    UnsignedByteType,
  )
  spriteTex.needsUpdate = true

  const slots: TireSmokeSlot[] = []
  for (let i = 0; i < poolSize; i++) {
    const mat = new SpriteMaterial({
      map: spriteTex,
      // Soft warm white reads as tire smoke against most asphalts. Slightly
      // cooler than pure white so it reads as smoke rather than a paper puff.
      color: 0xe8e8ec,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      // Normal blending (not additive) so the puff actually obscures what is
      // behind it rather than glowing through a dark scene like a flare. A
      // little additive bleed on top of dark asphalt would be fine but normal
      // blending reads more like a real cloud.
    })
    const sprite = new Sprite(mat)
    sprite.scale.set(1, 1, 1)
    sprite.visible = false
    group.add(sprite)
    slots.push({
      sprite,
      mat,
      spawnedAt: 0,
      peak: 0,
      baseX: 0,
      baseZ: 0,
      active: false,
    })
  }

  // Two slots per spawn (one puff per rear wheel). Track them via a single
  // ring index that advances by 2 each spawn.
  let writeIdx = 0

  function placeSlot(
    slot: TireSmokeSlot,
    x: number,
    z: number,
    peak: number,
    nowMs: number,
  ) {
    slot.baseX = x
    slot.baseZ = z
    slot.spawnedAt = nowMs
    slot.peak = peak
    slot.active = true
    slot.mat.opacity = peak
    slot.sprite.position.set(x, TIRE_SMOKE_BASE_Y, z)
    slot.sprite.scale.setScalar(0.7) // matches TIRE_SMOKE_START_SCALE
    slot.sprite.visible = peak > 0
  }

  return {
    group,
    spawn(x, z, heading, peakAlpha, nowMs) {
      if (peakAlpha <= 0) return
      // Same rear-axle math as the skid mark layer so the puffs land exactly
      // behind the wheels, paired stripes of smoke chasing the paired stripes
      // of mark.
      const cosH = Math.cos(heading)
      const sinH = -Math.sin(heading)
      const backX = -cosH * 1.4
      const backZ = -sinH * 1.4
      const rightX = -sinH
      const rightZ = cosH
      const baseX = x + backX
      const baseZ = z + backZ
      const offset = 1.05
      const leftSlot = slots[writeIdx]
      const rightSlot = slots[(writeIdx + 1) % poolSize]
      placeSlot(
        leftSlot,
        baseX + rightX * -offset,
        baseZ + rightZ * -offset,
        peakAlpha,
        nowMs,
      )
      placeSlot(
        rightSlot,
        baseX + rightX * offset,
        baseZ + rightZ * offset,
        peakAlpha,
        nowMs,
      )
      writeIdx = nextTireSmokeIndex(
        nextTireSmokeIndex(writeIdx, poolSize),
        poolSize,
      )
    },
    tick(nowMs) {
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i]
        if (!s.active) continue
        const age = nowMs - s.spawnedAt
        const a = puffAlpha(age, s.peak)
        if (a <= 0) {
          s.active = false
          s.sprite.visible = false
          s.mat.opacity = 0
          continue
        }
        s.mat.opacity = a
        const scale = puffScale(age)
        s.sprite.scale.set(scale, scale, 1)
        const rise = puffRise(age)
        s.sprite.position.set(s.baseX, TIRE_SMOKE_BASE_Y + rise, s.baseZ)
      }
    },
    clear() {
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i]
        s.active = false
        s.sprite.visible = false
        s.mat.opacity = 0
      }
      writeIdx = 0
    },
    dispose() {
      for (let i = 0; i < slots.length; i++) {
        slots[i].mat.dispose()
      }
      spriteTex.dispose()
    },
  }
}
