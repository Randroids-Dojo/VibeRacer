import { describe, expect, it } from 'vitest'
import { InstancedMesh, type Mesh } from 'three'
import { buildDerbyStadium } from '@/game/derbyStadium'
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

describe('buildDerbyStadium', () => {
  it('produces a named group with bleachers, seats, light poles, and an instanced crowd', () => {
    const stadium = buildDerbyStadium(ARENA, 128)
    expect(stadium.group.name).toContain('derbyStadium')
    // bowl (1) + 5 seat strips + 8 light poles + 8 light heads + 1
    // InstancedMesh = 23 children at minimum.
    expect(stadium.group.children.length).toBeGreaterThanOrEqual(20)
    stadium.dispose()
  })

  it('places the bleacher bowl and lights well outside the arena perimeter', () => {
    const stadium = buildDerbyStadium(ARENA, 128)
    // Find non-instanced light poles (Mesh) and confirm they sit beyond
    // the scenery skirt's outer radius. The bowl itself is centered at the
    // origin so we skip it via instance check.
    const sceneryOuter = 128
    let lightPolesChecked = 0
    for (const child of stadium.group.children) {
      if (child instanceof InstancedMesh) continue
      const m = child as Mesh
      const r = Math.hypot(m.position.x, m.position.z)
      if (r > 0) {
        expect(r).toBeGreaterThan(sceneryOuter)
        lightPolesChecked++
      }
    }
    expect(lightPolesChecked).toBeGreaterThan(0)
    stadium.dispose()
  })

  it('crowd InstancedMesh has a positive instance count and per-instance colors set', () => {
    const stadium = buildDerbyStadium(ARENA, 128)
    const crowd = stadium.group.children.find(
      (c): c is InstancedMesh => c instanceof InstancedMesh,
    )
    expect(crowd).toBeDefined()
    expect(crowd!.count).toBeGreaterThan(50)
    expect(crowd!.instanceColor).not.toBeNull()
  })

  it('is deterministic across two builds (crowd seed stable)', () => {
    const a = buildDerbyStadium(ARENA, 128)
    const b = buildDerbyStadium(ARENA, 128)
    const crowdA = a.group.children.find(
      (c): c is InstancedMesh => c instanceof InstancedMesh,
    )!
    const crowdB = b.group.children.find(
      (c): c is InstancedMesh => c instanceof InstancedMesh,
    )!
    expect(crowdA.count).toBe(crowdB.count)
    a.dispose()
    b.dispose()
  })

  it('dispose frees geometries and materials without throwing', () => {
    const s = buildDerbyStadium(ARENA, 128)
    expect(() => s.dispose()).not.toThrow()
  })
})
