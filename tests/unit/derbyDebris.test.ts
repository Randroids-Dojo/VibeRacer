import { describe, expect, it } from 'vitest'
import { Mesh, BoxGeometry, MeshBasicMaterial, Object3D } from 'three'
import {
  computeGroundY,
  pruneDebris,
  spawnDebris,
  tickDebris,
  type DerbyDebrisItem,
} from '@/game/derbyDebris'

function makeMesh() {
  return new Mesh(new BoxGeometry(0.5, 0.5, 0.5), new MeshBasicMaterial())
}

function constantRng(): () => number {
  let n = 0
  return () => {
    n = (n + 1) % 7
    return n / 7
  }
}

describe('spawnDebris', () => {
  it('seats the mesh at the requested position with outward velocity', () => {
    const m = makeMesh()
    const item = spawnDebris(
      m,
      { x: 1, y: 2, z: 3 },
      { nx: 1, nz: 0 },
      5,
      constantRng(),
    )
    expect(m.position.x).toBe(1)
    expect(m.position.y).toBe(2)
    expect(m.position.z).toBe(3)
    expect(item.vx).toBeGreaterThan(0)
    expect(item.alive).toBe(true)
  })
})

describe('computeGroundY', () => {
  it('falls back when there is no geometry', () => {
    expect(computeGroundY(new Object3D())).toBe(0.05)
  })

  it('uses the smallest valid half extent', () => {
    const mesh = new Mesh(new BoxGeometry(2, 4, 6), new MeshBasicMaterial())
    expect(computeGroundY(mesh)).toBeCloseTo(1, 5)
  })

  it('clamps degenerate bounds to the ground floor', () => {
    const mesh = new Mesh(new BoxGeometry(0, 0, 0), new MeshBasicMaterial())
    expect(computeGroundY(mesh)).toBe(0.05)
  })

  it('falls back when any world bound is non-finite', () => {
    const mesh = makeMesh()
    mesh.position.y = Number.POSITIVE_INFINITY
    expect(computeGroundY(mesh)).toBe(0.05)
  })
})

describe('tickDebris', () => {
  it('falls under gravity and bounces on the ground', () => {
    const m = makeMesh()
    const item: DerbyDebrisItem = spawnDebris(
      m,
      { x: 0, y: 5, z: 0 },
      { nx: 0, nz: 0 },
      0,
      constantRng(),
    )
    const items = [item]
    for (let i = 0; i < 60; i++) tickDebris(items, 1 / 60, 200)
    expect(m.position.y).toBeGreaterThanOrEqual(0)
  })

  it('respects each item groundY when clamping to rest', () => {
    const m = makeMesh()
    const item: DerbyDebrisItem = {
      object: m,
      vx: 0,
      vy: -0.1,
      vz: 0,
      rotX: 0,
      rotY: 0,
      rotZ: 0,
      groundY: 2,
      alive: true,
    }
    m.position.y = 1
    tickDebris([item], 1 / 60, 200)
    expect(m.position.y).toBe(2)
  })

  it('damps angular velocity on bounce', () => {
    const m = makeMesh()
    const item: DerbyDebrisItem = {
      object: m,
      vx: 0,
      vy: -4,
      vz: 0,
      rotX: 3,
      rotY: -2,
      rotZ: 1,
      groundY: 0.25,
      alive: true,
    }
    m.position.y = 0
    tickDebris([item], 1 / 60, 200)
    expect(Math.abs(item.rotX)).toBeLessThan(3)
    expect(Math.abs(item.rotY)).toBeLessThan(2)
    expect(Math.abs(item.rotZ)).toBeLessThan(1)
  })

  it('zeros angular velocity when the item settles', () => {
    const m = makeMesh()
    const item: DerbyDebrisItem = {
      object: m,
      vx: 0.01,
      vy: -0.1,
      vz: 0.01,
      rotX: 3,
      rotY: -2,
      rotZ: 1,
      groundY: 0.25,
      alive: true,
    }
    m.position.y = 0
    tickDebris([item], 1 / 60, 200)
    expect(item.rotX).toBe(0)
    expect(item.rotY).toBe(0)
    expect(item.rotZ).toBe(0)
  })

  it('culls items that leave the arena bounds', () => {
    const m = makeMesh()
    const item: DerbyDebrisItem = spawnDebris(
      m,
      { x: 0, y: 1, z: 0 },
      { nx: 1, nz: 0 },
      30,
      constantRng(),
    )
    const items = [item]
    for (let i = 0; i < 60; i++) tickDebris(items, 1 / 60, 5)
    expect(item.alive).toBe(false)
  })
})

describe('pruneDebris', () => {
  it('drops dead items and keeps alive ones in order', () => {
    const a: DerbyDebrisItem = { object: makeMesh(), vx: 0, vy: 0, vz: 0, rotX: 0, rotY: 0, rotZ: 0, groundY: 0.25, alive: true }
    const b: DerbyDebrisItem = { object: makeMesh(), vx: 0, vy: 0, vz: 0, rotX: 0, rotY: 0, rotZ: 0, groundY: 0.25, alive: false }
    const c: DerbyDebrisItem = { object: makeMesh(), vx: 0, vy: 0, vz: 0, rotX: 0, rotY: 0, rotZ: 0, groundY: 0.25, alive: true }
    const items: DerbyDebrisItem[] = [a, b, c]
    expect(pruneDebris(items)).toBe(1)
    expect(items).toHaveLength(2)
    expect(items[0]).toBe(a)
    expect(items[1]).toBe(c)
  })
})
