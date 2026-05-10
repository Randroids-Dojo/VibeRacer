import { describe, expect, it } from 'vitest'
import { Mesh, BoxGeometry, MeshBasicMaterial } from 'three'
import {
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
    const a: DerbyDebrisItem = { object: makeMesh(), vx: 0, vy: 0, vz: 0, rotX: 0, rotY: 0, rotZ: 0, alive: true }
    const b: DerbyDebrisItem = { object: makeMesh(), vx: 0, vy: 0, vz: 0, rotX: 0, rotY: 0, rotZ: 0, alive: false }
    const c: DerbyDebrisItem = { object: makeMesh(), vx: 0, vy: 0, vz: 0, rotX: 0, rotY: 0, rotZ: 0, alive: true }
    const items: DerbyDebrisItem[] = [a, b, c]
    expect(pruneDebris(items)).toBe(1)
    expect(items).toHaveLength(2)
    expect(items[0]).toBe(a)
    expect(items[1]).toBe(c)
  })
})
