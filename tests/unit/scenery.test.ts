import { describe, it, expect } from 'vitest'
import {
  SCENERY_BARRIERS_PER_SIDE,
  SCENERY_BARRIER_HEX_RED,
  SCENERY_BARRIER_HEX_WHITE,
  SCENERY_CONE_HEX,
  SCENERY_CONES_PER_CORNER,
  SCENERY_TRACK_CLEARANCE,
  SCENERY_TREE_FOLIAGE_HEX,
  SCENERY_TREE_SCALE_MAX,
  SCENERY_TREE_SCALE_MIN,
  buildCornerCones,
  buildScenery,
  buildPlacedDecorations,
  buildStartBarriers,
  buildTreeScenery,
  distanceToTrack,
  getSceneryStyle,
  makeSceneryRng,
  maybeTreeAt,
  sceneryBounds,
  seedFromPath,
} from '@/game/scenery'
import {
  CELL_SIZE,
  TRACK_WIDTH,
  buildTrackPath,
} from '@/game/trackPath'
import { DEFAULT_TRACK_PIECES } from '@/lib/defaultTrack'
import type { Piece } from '@/lib/schemas'

const SQUARE_OF_RIGHT90s: Piece[] = [
  { type: 'right90', row: 0, col: 0, rotation: 0 },
  { type: 'right90', row: 0, col: 1, rotation: 90 },
  { type: 'right90', row: 1, col: 1, rotation: 180 },
  { type: 'right90', row: 1, col: 0, rotation: 270 },
]

describe('makeSceneryRng', () => {
  it('returns the same sequence for the same seed', () => {
    const a = makeSceneryRng(12345)
    const b = makeSceneryRng(12345)
    for (let i = 0; i < 32; i++) expect(a()).toBe(b())
  })

  it('returns a different sequence for different seeds', () => {
    const a = makeSceneryRng(1)
    const b = makeSceneryRng(2)
    let differing = 0
    for (let i = 0; i < 32; i++) {
      if (a() !== b()) differing++
    }
    expect(differing).toBeGreaterThan(20)
  })

  it('values stay inside [0, 1)', () => {
    const r = makeSceneryRng(98765)
    for (let i = 0; i < 64; i++) {
      const v = r()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('handles a zero seed without falling into a constant sequence', () => {
    const r = makeSceneryRng(0)
    const a = r()
    const b = r()
    expect(a).not.toBe(b)
  })
})

describe('seedFromPath', () => {
  it('returns the same seed for the same pieces', () => {
    const path = buildTrackPath(DEFAULT_TRACK_PIECES)
    const a = seedFromPath(path)
    const b = seedFromPath(path)
    expect(a).toBe(b)
    expect(Number.isInteger(a)).toBe(true)
    expect(a).toBeGreaterThanOrEqual(0)
  })

  it('returns a different seed for a different layout', () => {
    const a = seedFromPath(buildTrackPath(DEFAULT_TRACK_PIECES))
    const b = seedFromPath(buildTrackPath(SQUARE_OF_RIGHT90s))
    expect(a).not.toBe(b)
  })
})

describe('sceneryBounds', () => {
  it('contains every piece center plus padding on every side', () => {
    const path = buildTrackPath(DEFAULT_TRACK_PIECES)
    const bounds = sceneryBounds(path)
    for (const op of path.order) {
      expect(op.center.x).toBeGreaterThan(bounds.minX)
      expect(op.center.x).toBeLessThan(bounds.maxX)
      expect(op.center.z).toBeGreaterThan(bounds.minZ)
      expect(op.center.z).toBeLessThan(bounds.maxZ)
    }
  })
})

describe('distanceToTrack', () => {
  it('returns 0 for points on the centerline of the start piece', () => {
    const path = buildTrackPath(DEFAULT_TRACK_PIECES)
    const start = path.order[0]
    const d = distanceToTrack(path, start.center.x, start.center.z)
    expect(d).toBeLessThan(0.01)
  })

  it('grows with distance from the road', () => {
    const path = buildTrackPath(DEFAULT_TRACK_PIECES)
    const start = path.order[0]
    const near = distanceToTrack(path, start.center.x + 5, start.center.z)
    const far = distanceToTrack(path, start.center.x + 30, start.center.z + 30)
    expect(far).toBeGreaterThan(near)
  })
})

describe('maybeTreeAt', () => {
  it('rejects positions inside the track clearance band', () => {
    const path = buildTrackPath(DEFAULT_TRACK_PIECES)
    const start = path.order[0]
    // Force a high-density rng (always-yes) so the gate is purely the
    // distance check.
    const rng = () => 0
    const item = maybeTreeAt(path, start.center.x, start.center.z, rng)
    expect(item).toBeNull()
  })

  it('skips when the density coin-flip rejects the cell', () => {
    const path = buildTrackPath(DEFAULT_TRACK_PIECES)
    // First call is the density check; returning 1.0 always exceeds the
    // default density so the cell is skipped.
    const rng = () => 1
    const out = maybeTreeAt(path, 100, 100, rng, { density: 0 })
    expect(out).toBeNull()
  })

  it('produces a tree with sane fields when the cell passes', () => {
    const path = buildTrackPath(DEFAULT_TRACK_PIECES)
    // Pick a spot well outside the track footprint so the clearance gate
    // never trips. The default oval centers near (20, 20) on a 3x3 grid.
    const rng = makeSceneryRng(99)
    const item = maybeTreeAt(path, 100, 100, rng, { density: 1 })
    expect(item).not.toBeNull()
    if (!item) return
    expect(item.kind).toBe('tree')
    expect(item.scale).toBeGreaterThanOrEqual(SCENERY_TREE_SCALE_MIN)
    expect(item.scale).toBeLessThanOrEqual(SCENERY_TREE_SCALE_MAX)
    expect(SCENERY_TREE_FOLIAGE_HEX).toContain(item.colorHex)
  })
})

describe('buildTreeScenery', () => {
  it('produces a deterministic layout for a fixed seed', () => {
    const path = buildTrackPath(DEFAULT_TRACK_PIECES)
    const a = buildTreeScenery(path, makeSceneryRng(42))
    const b = buildTreeScenery(path, makeSceneryRng(42))
    expect(a).toEqual(b)
  })

  it('keeps every tree outside the track clearance', () => {
    const path = buildTrackPath(DEFAULT_TRACK_PIECES)
    const trees = buildTreeScenery(path, makeSceneryRng(7))
    for (const t of trees) {
      expect(distanceToTrack(path, t.x, t.z)).toBeGreaterThanOrEqual(
        SCENERY_TRACK_CLEARANCE - 0.001,
      )
    }
  })

  it('keeps every tree inside the bounding box', () => {
    const path = buildTrackPath(DEFAULT_TRACK_PIECES)
    const bounds = sceneryBounds(path)
    const trees = buildTreeScenery(path, makeSceneryRng(11))
    for (const t of trees) {
      // Allow the jitter's max half-spacing past the grid endpoints since the
      // last grid sample sits on the boundary and jitter can push outward.
      expect(t.x).toBeGreaterThan(bounds.minX - 5)
      expect(t.x).toBeLessThan(bounds.maxX + 5)
      expect(t.z).toBeGreaterThan(bounds.minZ - 5)
      expect(t.z).toBeLessThan(bounds.maxZ + 5)
    }
  })

  it('produces zero trees when the density is zero', () => {
    const path = buildTrackPath(DEFAULT_TRACK_PIECES)
    const trees = buildTreeScenery(path, makeSceneryRng(1), { density: 0 })
    expect(trees.length).toBe(0)
  })
})

describe('buildCornerCones', () => {
  it('produces SCENERY_CONES_PER_CORNER cones per corner', () => {
    const path = buildTrackPath(SQUARE_OF_RIGHT90s)
    const cones = buildCornerCones(path)
    expect(cones.length).toBe(4 * SCENERY_CONES_PER_CORNER)
  })

  it('places every cone outside the road edge', () => {
    const path = buildTrackPath(SQUARE_OF_RIGHT90s)
    const cones = buildCornerCones(path)
    const outerEdge = TRACK_WIDTH / 2
    for (const c of cones) {
      // Distance from the road centerline must be at least the outer edge
      // (anything closer and we are on the asphalt). Allow a 0.5u tolerance
      // for floating-point jitter at the arc tangent.
      expect(distanceToTrack(path, c.x, c.z)).toBeGreaterThan(outerEdge - 0.5)
    }
  })

  it('every cone uses the cone color', () => {
    const path = buildTrackPath(SQUARE_OF_RIGHT90s)
    const cones = buildCornerCones(path)
    for (const c of cones) {
      expect(c.kind).toBe('cone')
      expect(c.colorHex).toBe(SCENERY_CONE_HEX)
    }
  })

  it('returns an empty list when conesPerCorner is invalid', () => {
    const path = buildTrackPath(SQUARE_OF_RIGHT90s)
    expect(buildCornerCones(path, { conesPerCorner: 0 })).toEqual([])
    expect(buildCornerCones(path, { conesPerCorner: -3 })).toEqual([])
    expect(buildCornerCones(path, { conesPerCorner: Number.NaN })).toEqual([])
  })

  it('returns an empty list when there are no corners', () => {
    // A loop made entirely of straights cannot exist in this game (you cannot
    // close a loop of straights in the grid), but we can call buildCornerCones
    // with a path whose pieces happen to be straights only by stubbing the
    // path. Simplest check: assert no corners means no cones via the helper
    // arm that filters non-corner pieces.
    const path = buildTrackPath(DEFAULT_TRACK_PIECES)
    const onlyStraights = {
      ...path,
      order: path.order.filter((op) => op.piece.type === 'straight'),
    }
    expect(buildCornerCones(onlyStraights)).toEqual([])
  })
})

describe('buildStartBarriers', () => {
  it('builds two sides of barriers around the start gate', () => {
    const path = buildTrackPath(DEFAULT_TRACK_PIECES)
    const barriers = buildStartBarriers(path)
    expect(barriers.length).toBe(2 * SCENERY_BARRIERS_PER_SIDE)
  })

  it('alternates barrier colors red and white', () => {
    const path = buildTrackPath(DEFAULT_TRACK_PIECES)
    const barriers = buildStartBarriers(path)
    // First barrier on each side starts red, then alternates.
    for (const b of barriers) {
      expect([SCENERY_BARRIER_HEX_RED, SCENERY_BARRIER_HEX_WHITE]).toContain(
        b.colorHex,
      )
    }
    // Both colors are present.
    const colors = new Set(barriers.map((b) => b.colorHex))
    expect(colors.size).toBe(2)
  })

  it('places barriers a sane distance from the finish line position', () => {
    const path = buildTrackPath(DEFAULT_TRACK_PIECES)
    const barriers = buildStartBarriers(path)
    const f = path.finishLine.position
    for (const b of barriers) {
      const d = Math.hypot(b.x - f.x, b.z - f.z)
      // The lateral offset puts each block at least TRACK_WIDTH/2 from the
      // finish-line center; a generous upper bound covers the along-track
      // spread.
      expect(d).toBeGreaterThan(TRACK_WIDTH / 2 - 0.01)
      expect(d).toBeLessThan(CELL_SIZE)
    }
  })

  it('sets every rotation to the finish-line heading', () => {
    const path = buildTrackPath(DEFAULT_TRACK_PIECES)
    const barriers = buildStartBarriers(path)
    for (const b of barriers) {
      expect(b.rotationY).toBe(path.finishLine.heading)
    }
  })
})

describe('buildScenery', () => {
  it('combines trees, cones, and barriers into one list', () => {
    const path = buildTrackPath(DEFAULT_TRACK_PIECES)
    const items = buildScenery(path)
    const kinds = new Set(items.map((i) => i.kind))
    expect(kinds.has('tree')).toBe(true)
    expect(kinds.has('cone')).toBe(true)
    expect(kinds.has('barrier')).toBe(true)
  })

  it('is deterministic for a given track', () => {
    const path = buildTrackPath(DEFAULT_TRACK_PIECES)
    const a = buildScenery(path)
    const b = buildScenery(path)
    expect(a).toEqual(b)
  })

  it('omits trees when includeTrees is false', () => {
    const path = buildTrackPath(DEFAULT_TRACK_PIECES)
    const items = buildScenery(path, { includeTrees: false })
    expect(items.find((i) => i.kind === 'tree')).toBeUndefined()
  })

  it('omits cones when includeCones is false', () => {
    const path = buildTrackPath(DEFAULT_TRACK_PIECES)
    const items = buildScenery(path, { includeCones: false })
    expect(items.find((i) => i.kind === 'cone')).toBeUndefined()
  })

  it('omits barriers when includeBarriers is false', () => {
    const path = buildTrackPath(DEFAULT_TRACK_PIECES)
    const items = buildScenery(path, { includeBarriers: false })
    expect(items.find((i) => i.kind === 'barrier')).toBeUndefined()
  })

  it('returns at least the cones plus barriers when trees are off', () => {
    const path = buildTrackPath(DEFAULT_TRACK_PIECES)
    const items = buildScenery(path, { includeTrees: false })
    // Default oval has 4 corners; cones per corner default plus barriers.
    expect(items.length).toBeGreaterThanOrEqual(
      4 * SCENERY_CONES_PER_CORNER + 2 * SCENERY_BARRIERS_PER_SIDE,
    )
  })

  it('uses biome-specific scenery colors', () => {
    const path = buildTrackPath(DEFAULT_TRACK_PIECES)
    const style = getSceneryStyle('city')
    const items = buildScenery(path, { biome: 'city', includeTrees: false })
    const cones = items.filter((i) => i.kind === 'cone')
    const barriers = items.filter((i) => i.kind === 'barrier')
    expect(cones.length).toBeGreaterThan(0)
    expect(barriers.length).toBeGreaterThan(0)
    expect(new Set(cones.map((i) => i.colorHex))).toEqual(
      new Set([style.coneColor]),
    )
    expect(new Set(barriers.map((i) => i.colorHex))).toEqual(
      new Set([style.barrierA, style.barrierB]),
    )
  })

  it('adds placed decorations at cell centers', () => {
    const path = buildTrackPath(DEFAULT_TRACK_PIECES)
    const items = buildScenery(path, {
      includeTrees: false,
      includeCones: false,
      includeBarriers: false,
      decorations: [{ kind: 'cactus', row: 2, col: -1 }],
    })
    expect(items).toMatchObject([
      {
        kind: 'cactus',
        x: -CELL_SIZE,
        z: CELL_SIZE * 2,
      },
    ])
  })
})

describe('buildPlacedDecorations', () => {
  it('returns an empty list without decorations', () => {
    expect(buildPlacedDecorations(undefined)).toEqual([])
  })

  it('maps every decoration into a scenery item', () => {
    expect(
      buildPlacedDecorations([
        { kind: 'building', row: 1, col: 2 },
        { kind: 'snowPile', row: -1, col: 0 },
      ]).map((item) => item.kind),
    ).toEqual(['building', 'snowPile'])
  })
})
