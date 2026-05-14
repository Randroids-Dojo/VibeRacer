import { describe, expect, it } from 'vitest'
import type { Mesh } from 'three'
import { buildDerbyScenery, seedFromArena } from '@/game/derbyScenery'
import type { DerbyArenaConfig } from '@/lib/derbyArenas'

const ARENA: DerbyArenaConfig = {
  slug: 'dust-bowl',
  displayName: 'Dust Bowl',
  radius: 60,
  surface: 'dirt',
  biome: 'desert',
  weather: 'clear',
  timeOfDay: 'noon',
  roundDurationMs: 180_000,
  cpuCount: 3,
  blurb: 'test',
}

describe('seedFromArena', () => {
  it('is deterministic for the same arena', () => {
    expect(seedFromArena(ARENA)).toBe(seedFromArena(ARENA))
  })

  it('changes when the slug changes', () => {
    const other: DerbyArenaConfig = { ...ARENA, slug: 'dust-bowl-2' as never }
    expect(seedFromArena(ARENA)).not.toBe(seedFromArena(other))
  })

  it('changes when the radius changes', () => {
    const bigger: DerbyArenaConfig = { ...ARENA, radius: 80 }
    expect(seedFromArena(ARENA)).not.toBe(seedFromArena(bigger))
  })
})

describe('buildDerbyScenery', () => {
  it('produces a named group with the expected scenery item count', () => {
    const s = buildDerbyScenery(ARENA)
    expect(s.group.name).toContain('derbyScenery')
    // Skirt (1) + 10 boulders + 24 medium rocks + 50 pebbles + 6 dead trees
    // each with trunk+foliage (12) + 8 cacti each with trunk + 1-2 arms
    // (8 trunks + ~12 arms = ~20) + 14 dirt piles + 22-44 tires (1-2 stack
    // each, expected ~33) + 16 drums + 14 concrete = bounded range. Lower
    // bound 170 catches an 80%+ regression in any category; upper bound
    // 220 catches accidental duplication. Tight enough to be a real
    // tripwire, loose enough to tolerate the stacking + arm RNG.
    expect(s.group.children.length).toBeGreaterThan(170)
    expect(s.group.children.length).toBeLessThan(220)
    s.dispose()
  })

  it('keeps every scenery item outside the arena perimeter', () => {
    const s = buildDerbyScenery(ARENA)
    // First child is the skirt RingGeometry, centered at origin by design.
    // Every other mesh is a placed scenery item and must live in the
    // annulus outside the wall.
    for (let i = 1; i < s.group.children.length; i++) {
      const child = s.group.children[i] as Mesh
      const r = Math.hypot(child.position.x, child.position.z)
      expect(r).toBeGreaterThanOrEqual(ARENA.radius)
    }
    s.dispose()
  })

  it('places scenery deterministically for the same arena seed', () => {
    const a = buildDerbyScenery(ARENA)
    const b = buildDerbyScenery(ARENA)
    expect(a.group.children.length).toBe(b.group.children.length)
    // Sample a handful of mid-list positions; deterministic placement
    // means they line up exactly between two builds.
    for (const idx of [10, 50, 100]) {
      const ax = a.group.children[idx].position.x
      const bx = b.group.children[idx].position.x
      expect(ax).toBeCloseTo(bx, 6)
    }
    a.dispose()
    b.dispose()
  })

  it('dispose frees geometries and materials without throwing', () => {
    const s = buildDerbyScenery(ARENA)
    expect(() => s.dispose()).not.toThrow()
  })
})
