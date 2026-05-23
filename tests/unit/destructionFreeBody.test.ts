import { describe, expect, it } from 'vitest'
import {
  BoxGeometry,
  Mesh,
  MeshBasicMaterial,
  Object3D,
} from 'three'
import {
  FREE_BODY_GRAVITY,
  computeGroundY,
  pruneFreeBodies,
  spawnFreeBody,
  tickFreeBodies,
} from '@/game/destruction/freeBody'

function rng(): () => number {
  let a = 0x12345
  return () => {
    a = (a * 1103515245 + 12345) & 0x7fffffff
    return a / 0x7fffffff
  }
}

function box(w: number, h: number, d: number): Mesh {
  return new Mesh(new BoxGeometry(w, h, d), new MeshBasicMaterial())
}

describe('computeGroundY', () => {
  it('returns half the smallest extent of a box', () => {
    const m = box(2, 0.2, 1)
    // Smallest extent is 0.2 -> half = 0.1.
    expect(computeGroundY(m)).toBeCloseTo(0.1, 4)
  })
  it('falls back to a small floor when no geometry exists', () => {
    expect(computeGroundY(new Object3D())).toBeCloseTo(0.05, 4)
  })
})

describe('spawnFreeBody', () => {
  it('places the panel at the requested position with outward+up velocity', () => {
    const m = box(0.5, 0.05, 0.4)
    const r = rng()
    const item = spawnFreeBody(m, {
      position: { x: 2, y: 1, z: -3 },
      outward: { nx: 1, nz: 0 },
      linearSpeed: 4,
      upKick: 3,
      rng: r,
    })
    expect(m.position.x).toBeCloseTo(2)
    expect(m.position.y).toBeCloseTo(1)
    expect(m.position.z).toBeCloseTo(-3)
    expect(item.vx).toBeGreaterThan(0)
    expect(item.vy).toBeGreaterThan(0)
    expect(item.alive).toBe(true)
  })
})

describe('tickFreeBodies', () => {
  it('drops a panel toward its ground-Y under gravity', () => {
    const m = box(0.5, 0.05, 0.4)
    const r = rng()
    const item = spawnFreeBody(m, {
      position: { x: 0, y: 4, z: 0 },
      outward: { nx: 0, nz: 0 },
      linearSpeed: 0,
      upKick: 0,
      rng: r,
    })
    // Several steps drop the panel toward groundY.
    for (let i = 0; i < 60; i++) {
      tickFreeBodies([item], 1 / 60)
    }
    expect(m.position.y).toBeLessThan(1)
  })

  it('settles a stationary panel to the ground plane', () => {
    const m = box(0.5, 0.05, 0.4)
    const r = rng()
    const item = spawnFreeBody(m, {
      position: { x: 0, y: 0.1, z: 0 },
      outward: { nx: 0, nz: 0 },
      linearSpeed: 0,
      upKick: 0,
      rng: r,
    })
    // Drive several seconds of integration to let the bounces damp out.
    for (let i = 0; i < 300; i++) {
      tickFreeBodies([item], 1 / 60)
    }
    expect(m.position.y).toBeCloseTo(item.groundY, 3)
    expect(Math.abs(item.vy)).toBeLessThan(0.1)
  })

  it('applies gravity to vy on every step', () => {
    const m = box(0.5, 0.05, 0.4)
    const r = rng()
    const item = spawnFreeBody(m, {
      position: { x: 0, y: 10, z: 0 },
      outward: { nx: 0, nz: 0 },
      linearSpeed: 0,
      upKick: 0,
      rng: r,
    })
    const start = item.vy
    tickFreeBodies([item], 0.1)
    expect(item.vy).toBeCloseTo(start + FREE_BODY_GRAVITY * 0.1, 3)
  })
})

describe('pruneFreeBodies', () => {
  it('compacts the array and reports the removed count', () => {
    const m = box(0.5, 0.05, 0.4)
    const r = rng()
    const a = spawnFreeBody(m, {
      position: { x: 0, y: 0, z: 0 },
      outward: { nx: 0, nz: 0 },
      linearSpeed: 0,
      upKick: 0,
      rng: r,
    })
    const b = spawnFreeBody(m.clone() as Mesh, {
      position: { x: 1, y: 0, z: 0 },
      outward: { nx: 0, nz: 0 },
      linearSpeed: 0,
      upKick: 0,
      rng: r,
    })
    a.alive = false
    const list = [a, b]
    const removed = pruneFreeBodies(list)
    expect(removed).toBe(1)
    expect(list.length).toBe(1)
    expect(list[0]).toBe(b)
  })
})
