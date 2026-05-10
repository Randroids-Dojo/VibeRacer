import { describe, expect, it } from 'vitest'
import {
  arenaContains,
  arenaWallNormalAt,
  buildArenaMesh,
  clampInsideArena,
} from '@/game/derbyArena'
import { DERBY_ARENAS } from '@/lib/derbyArenas'

const ARENA = DERBY_ARENAS['dust-bowl']

describe('arenaContains', () => {
  it('returns true at the origin and false outside the radius', () => {
    expect(arenaContains(ARENA, 0, 0)).toBe(true)
    expect(arenaContains(ARENA, ARENA.radius - 1, 0)).toBe(true)
    expect(arenaContains(ARENA, ARENA.radius + 1, 0)).toBe(false)
  })

  it('respects the buffer parameter', () => {
    expect(arenaContains(ARENA, ARENA.radius - 0.5, 0, 0)).toBe(true)
    expect(arenaContains(ARENA, ARENA.radius - 0.5, 0, 1)).toBe(false)
  })
})

describe('arenaWallNormalAt', () => {
  it('points from the boundary toward the origin', () => {
    const n = arenaWallNormalAt(ARENA, ARENA.radius, 0)
    expect(n.nx).toBeCloseTo(-1, 5)
    expect(n.nz).toBeCloseTo(0, 5)
  })

  it('returns a unit vector for non-origin inputs', () => {
    const n = arenaWallNormalAt(ARENA, 30, 30)
    expect(Math.hypot(n.nx, n.nz)).toBeCloseTo(1, 5)
  })

  it('returns a defined direction at the origin', () => {
    const n = arenaWallNormalAt(ARENA, 0, 0)
    expect(Number.isFinite(n.nx)).toBe(true)
    expect(Number.isFinite(n.nz)).toBe(true)
  })
})

describe('clampInsideArena', () => {
  it('passes interior points through unchanged', () => {
    const out = clampInsideArena(ARENA, 5, 5, 1)
    expect(out.x).toBe(5)
    expect(out.z).toBe(5)
    expect(out.clamped).toBe(false)
  })

  it('pulls outside points back to the boundary minus the buffer', () => {
    const out = clampInsideArena(ARENA, ARENA.radius * 2, 0, 2)
    expect(out.clamped).toBe(true)
    expect(Math.hypot(out.x, out.z)).toBeCloseTo(ARENA.radius - 2, 5)
  })

  it('handles the origin case without dividing by zero', () => {
    const out = clampInsideArena(ARENA, 0, 0, 1)
    expect(out.clamped).toBe(false)
    expect(out.x).toBe(0)
    expect(out.z).toBe(0)
  })
})

describe('buildArenaMesh', () => {
  it('produces a Group with a ground and a wall mesh', () => {
    const mesh = buildArenaMesh(ARENA)
    try {
      expect(mesh.group.children).toContain(mesh.ground)
      expect(mesh.group.children).toContain(mesh.wall)
      expect(mesh.group.name).toBe(`derbyArena:${ARENA.slug}`)
    } finally {
      mesh.dispose()
    }
  })

  it('dispose can be called without throwing', () => {
    const mesh = buildArenaMesh(ARENA)
    expect(() => mesh.dispose()).not.toThrow()
  })
})
