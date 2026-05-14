import { describe, expect, it } from 'vitest'
import { Color, InstancedMesh, Matrix4, type Mesh } from 'three'
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
  it('produces exactly bowl + 5 seat strips + 8 poles + 8 heads + 1 crowd InstancedMesh', () => {
    const stadium = buildDerbyStadium(ARENA, 128)
    expect(stadium.group.name).toContain('derbyStadium')
    // Exact structure: 1 lathe bowl + 5 painted seat cylinders + 8 light
    // poles + 8 light heads + 1 crowd InstancedMesh = 23 children.
    expect(stadium.group.children.length).toBe(23)
    const instanced = stadium.group.children.filter(
      (c) => c instanceof InstancedMesh,
    )
    expect(instanced).toHaveLength(1)
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

  it('crowd InstancedMesh has at least 50 instances with varied colors from the palette', () => {
    const stadium = buildDerbyStadium(ARENA, 128)
    const crowd = stadium.group.children.find(
      (c): c is InstancedMesh => c instanceof InstancedMesh,
    )
    expect(crowd).toBeDefined()
    expect(crowd!.count).toBeGreaterThan(50)
    expect(crowd!.instanceColor).not.toBeNull()
    // Sample 12 instances and assert at least 3 distinct colors. A default-
    // initialized instanceColor buffer (no setColorAt calls) would leave
    // every entry at black (0,0,0); a buggy "always pick palette[0]" would
    // also fail this check.
    const seen = new Set<string>()
    const tmp = new Color()
    const sampleCount = Math.min(12, crowd!.count)
    for (let i = 0; i < sampleCount; i++) {
      const idx = Math.floor((i * crowd!.count) / sampleCount)
      crowd!.getColorAt(idx, tmp)
      seen.add(tmp.getHexString())
    }
    expect(seen.size).toBeGreaterThanOrEqual(3)
  })

  it('is deterministic across two builds: identical crowd positions and colors', () => {
    const a = buildDerbyStadium(ARENA, 128)
    const b = buildDerbyStadium(ARENA, 128)
    const crowdA = a.group.children.find(
      (c): c is InstancedMesh => c instanceof InstancedMesh,
    )!
    const crowdB = b.group.children.find(
      (c): c is InstancedMesh => c instanceof InstancedMesh,
    )!
    expect(crowdA.count).toBe(crowdB.count)
    // Sample positions and colors across the crowd; identical-positioned
    // matrices and identical colors prove deterministic seeding.
    const mA = new Matrix4()
    const mB = new Matrix4()
    const cA = new Color()
    const cB = new Color()
    for (const idx of [0, Math.floor(crowdA.count / 2), crowdA.count - 1]) {
      crowdA.getMatrixAt(idx, mA)
      crowdB.getMatrixAt(idx, mB)
      for (let e = 0; e < 16; e++) {
        expect(mA.elements[e]).toBeCloseTo(mB.elements[e], 6)
      }
      crowdA.getColorAt(idx, cA)
      crowdB.getColorAt(idx, cB)
      expect(cA.getHexString()).toBe(cB.getHexString())
    }
    a.dispose()
    b.dispose()
  })

  it('dispose frees geometries and materials without throwing', () => {
    const s = buildDerbyStadium(ARENA, 128)
    expect(() => s.dispose()).not.toThrow()
  })
})
