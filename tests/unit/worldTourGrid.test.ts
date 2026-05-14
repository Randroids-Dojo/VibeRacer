import { describe, it, expect } from 'vitest'
import {
  DEFAULT_ROW_SPACING_METERS,
  spawnGrid,
  type GridDriver,
} from '@/game/worldTourGrid'
import { DEFAULT_TRACK_WIDTH } from '@/game/trackWidth'

const ROSTER: GridDriver[] = [
  { id: 'a' },
  { id: 'b' },
  { id: 'c' },
]

describe('spawnGrid', () => {
  it('returns exactly slotCount entries with player on the pole', () => {
    const grid = spawnGrid({
      slotCount: 4,
      laneCount: 2,
      aiDrivers: ROSTER,
      seed: 1,
    })
    expect(grid).toHaveLength(4)
    expect(grid[0]!.gridSlot).toBe(0)
    expect(grid[0]!.driverId).toBeNull()
    expect(grid[0]!.row).toBe(0)
    expect(grid[0]!.lane).toBe(0)
    expect(grid[0]!.startZ).toBeCloseTo(0)
  })

  it('places AI drivers in slots 1..n with no null driver ids', () => {
    const grid = spawnGrid({
      slotCount: 4,
      laneCount: 2,
      aiDrivers: ROSTER,
      seed: 7,
    })
    for (let i = 1; i < grid.length; i++) {
      expect(grid[i]!.driverId).not.toBeNull()
    }
    const ids = new Set(grid.slice(1).map((s) => s.driverId))
    expect(ids.size).toBe(3)
    for (const id of ids) {
      expect(['a', 'b', 'c']).toContain(id)
    }
  })

  it('is deterministic under the same seed', () => {
    const a = spawnGrid({ slotCount: 4, laneCount: 2, aiDrivers: ROSTER, seed: 42 })
    const b = spawnGrid({ slotCount: 4, laneCount: 2, aiDrivers: ROSTER, seed: 42 })
    expect(a).toEqual(b)
  })

  it('produces different driver assignments under different seeds', () => {
    const a = spawnGrid({ slotCount: 4, laneCount: 2, aiDrivers: ROSTER, seed: 1 })
    const b = spawnGrid({ slotCount: 4, laneCount: 2, aiDrivers: ROSTER, seed: 99999 })
    const idsA = a.slice(1).map((s) => s.driverId).join(',')
    const idsB = b.slice(1).map((s) => s.driverId).join(',')
    // At least one of the seeds must place the drivers in a different
    // order; if not, the shuffle is degenerate.
    expect(idsA).not.toBe(idsB)
  })

  it('places lanes inside the road bounds', () => {
    const half = DEFAULT_TRACK_WIDTH / 2
    const grid = spawnGrid({
      slotCount: 4,
      laneCount: 2,
      aiDrivers: ROSTER,
      seed: 1,
    })
    for (const slot of grid) {
      expect(slot.startX).toBeGreaterThanOrEqual(-half)
      expect(slot.startX).toBeLessThanOrEqual(half)
    }
  })

  it('walks rows backward from the start line with DEFAULT_ROW_SPACING_METERS', () => {
    const grid = spawnGrid({
      slotCount: 4,
      laneCount: 2,
      aiDrivers: ROSTER,
      seed: 1,
    })
    // 4 cars in 2 lanes = 2 rows. Row 0 at z = 0; row 1 at z = -spacing.
    expect(grid[0]!.row).toBe(0)
    expect(grid[1]!.row).toBe(0)
    expect(grid[2]!.row).toBe(1)
    expect(grid[3]!.row).toBe(1)
    expect(grid[2]!.startZ).toBe(-DEFAULT_ROW_SPACING_METERS)
    expect(grid[3]!.startZ).toBe(-DEFAULT_ROW_SPACING_METERS)
  })

  it('respects a single lane by stacking every slot in lane 0', () => {
    const grid = spawnGrid({
      slotCount: 3,
      laneCount: 1,
      aiDrivers: ROSTER,
      seed: 1,
    })
    expect(grid.map((s) => s.lane)).toEqual([0, 0, 0])
    expect(grid.map((s) => s.row)).toEqual([0, 1, 2])
    expect(grid[0]!.startX).toBe(0)
  })

  it('produces distinct per-slot seeds', () => {
    const grid = spawnGrid({
      slotCount: 4,
      laneCount: 2,
      aiDrivers: ROSTER,
      seed: 1,
    })
    const seeds = new Set(grid.map((s) => s.seed))
    expect(seeds.size).toBe(grid.length)
  })

  it('emits a null driver when the roster is too short', () => {
    const grid = spawnGrid({
      slotCount: 4,
      laneCount: 2,
      aiDrivers: [{ id: 'only' }],
      seed: 1,
    })
    // Slots 0 (player) and 1 (the single AI) are filled. Slots 2 and 3
    // emit but have no driverId.
    expect(grid[0]!.driverId).toBeNull()
    expect(grid[1]!.driverId).toBe('only')
    expect(grid[2]!.driverId).toBeNull()
    expect(grid[3]!.driverId).toBeNull()
  })

  it('clamps slotCount to at least 1', () => {
    const grid = spawnGrid({
      slotCount: 0,
      laneCount: 2,
      aiDrivers: ROSTER,
      seed: 1,
    })
    expect(grid).toHaveLength(1)
    expect(grid[0]!.gridSlot).toBe(0)
  })

  it('separates the two lanes across the track', () => {
    const grid = spawnGrid({
      slotCount: 2,
      laneCount: 2,
      aiDrivers: ROSTER,
      seed: 1,
    })
    expect(grid[0]!.lane).not.toBe(grid[1]!.lane)
    expect(grid[0]!.startX).not.toBe(grid[1]!.startX)
  })
})
