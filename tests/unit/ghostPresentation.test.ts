import { describe, expect, it, vi } from 'vitest'
import { Group } from 'three'
import {
  applyGhostPresentation,
  initGhostPresentation,
} from '@/game/ghostPresentation'
import type { Replay } from '@/lib/replay'
import {
  NAMEPLATE_CLOSE_FULL_DISTANCE,
  NAMEPLATE_CLOSE_HIDE_DISTANCE,
  type GhostMeta,
} from '@/game/ghostNameplate'

// Minimal stand-in for the GhostNameplate object the helper drives.
// `apply` records the (meta, source) tuple it last received, so tests can
// assert the cache-key short-circuit. The concrete renderer attaches a
// real Sprite + CanvasTexture; the helper itself never reaches into them.
function makeNameplate() {
  return {
    group: new Group(),
    apply: vi.fn(),
    setOpacity: vi.fn(),
    setVisible: vi.fn(),
    dispose: vi.fn(),
  }
}

// Build a deterministic 3-sample replay. The helper relies on
// `interpolateGhostPose` so we just need real samples spanning 66ms.
function makeReplay(): Replay {
  return {
    lapTimeMs: 66,
    samples: [
      [0, 0, 0],
      [10, 5, 0.5],
      [20, 10, 1.0],
    ],
  }
}

const META: GhostMeta = { initials: 'AAA', lapTimeMs: 12345 }
const META_OTHER: GhostMeta = { initials: 'BBB', lapTimeMs: 23456 }

// The plate's hide-fade endpoints frame the test distances. Anything
// >= NAMEPLATE_CLOSE_FULL_DISTANCE is full opacity; anything <=
// NAMEPLATE_CLOSE_HIDE_DISTANCE collapses to zero and hides.
const FAR_PLAYER_X = NAMEPLATE_CLOSE_FULL_DISTANCE + 50
const NEAR_PLAYER_X = -1 // distance < CLOSE_HIDE_DISTANCE from sample 0

describe('applyGhostPresentation', () => {
  it('hides ghost when active=false even with a valid replay', () => {
    const car = new Group()
    car.visible = true
    const plate = makeNameplate()
    const state = initGhostPresentation()

    const out = applyGhostPresentation(state, {
      ghostCar: car,
      ghostPlate: plate,
      replay: makeReplay(),
      raceStartMs: 0,
      nowMs: 100,
      active: false,
      showNameplate: true,
      meta: META,
      source: 'top',
      playerX: 0,
      playerZ: 0,
    })

    expect(car.visible).toBe(false)
    expect(out.visible).toBe(false)
    expect(out.pose).toBeNull()
    expect(plate.apply).not.toHaveBeenCalled()
  })

  it('hides ghost when replay is null', () => {
    const car = new Group()
    car.visible = true
    const plate = makeNameplate()
    const state = initGhostPresentation()

    applyGhostPresentation(state, {
      ghostCar: car,
      ghostPlate: plate,
      replay: null,
      raceStartMs: 0,
      nowMs: 100,
      active: true,
      showNameplate: true,
      meta: META,
      source: 'top',
      playerX: 0,
      playerZ: 0,
    })

    expect(car.visible).toBe(false)
    expect(plate.apply).not.toHaveBeenCalled()
  })

  it('hides ghost when raceStartMs is null (race has not started)', () => {
    const car = new Group()
    car.visible = true
    const plate = makeNameplate()
    const state = initGhostPresentation()

    applyGhostPresentation(state, {
      ghostCar: car,
      ghostPlate: plate,
      replay: makeReplay(),
      raceStartMs: null,
      nowMs: 100,
      active: true,
      showNameplate: true,
      meta: META,
      source: 'top',
      playerX: 0,
      playerZ: 0,
    })

    expect(car.visible).toBe(false)
  })

  it('places ghost at the sampled pose with y=0 by default', () => {
    const car = new Group()
    const plate = makeNameplate()
    const state = initGhostPresentation()

    const out = applyGhostPresentation(state, {
      ghostCar: car,
      ghostPlate: plate,
      replay: makeReplay(),
      raceStartMs: 0,
      // 33 ms = exactly sample index 1 -> (10, 5, 0.5).
      nowMs: 33,
      active: true,
      showNameplate: true,
      meta: META,
      source: 'top',
      playerX: FAR_PLAYER_X,
      playerZ: 0,
    })

    expect(car.visible).toBe(true)
    expect(out.visible).toBe(true)
    expect(car.position.x).toBeCloseTo(10, 5)
    expect(car.position.y).toBe(0)
    expect(car.position.z).toBeCloseTo(5, 5)
    expect(car.rotation.x).toBeCloseTo(0, 10) // no terrain pitch (-0 ok)
    expect(car.rotation.y).toBeCloseTo(0.5, 5)
    expect(out.pose).toEqual({ x: 10, z: 5, heading: 0.5 })
  })

  it('honors resolveTerrain to lift the ghost onto a hilly strip', () => {
    const car = new Group()
    const plate = makeNameplate()
    const state = initGhostPresentation()
    const resolveTerrain = vi.fn((x: number, _z: number) => ({
      y: x * 0.1,
      pitch: 0.2,
    }))

    applyGhostPresentation(state, {
      ghostCar: car,
      ghostPlate: plate,
      replay: makeReplay(),
      raceStartMs: 0,
      nowMs: 33, // sample 1: x=10, z=5
      active: true,
      showNameplate: true,
      meta: META,
      source: 'top',
      playerX: FAR_PLAYER_X,
      playerZ: 0,
      resolveTerrain,
    })

    expect(resolveTerrain).toHaveBeenCalledWith(10, 5)
    expect(car.position.y).toBeCloseTo(1.0, 5)
    expect(car.rotation.x).toBeCloseTo(-0.2, 5) // pitch is negated
  })

  it('applies the nameplate on first show and skips redraw when key stays', () => {
    const car = new Group()
    const plate = makeNameplate()
    const state = initGhostPresentation()

    // Frame 1: visible at far distance, full opacity.
    applyGhostPresentation(state, {
      ghostCar: car,
      ghostPlate: plate,
      replay: makeReplay(),
      raceStartMs: 0,
      nowMs: 33,
      active: true,
      showNameplate: true,
      meta: META,
      source: 'top',
      playerX: FAR_PLAYER_X,
      playerZ: 0,
    })
    expect(plate.apply).toHaveBeenCalledTimes(1)
    expect(plate.apply).toHaveBeenLastCalledWith(META, 'top')

    // Frame 2: same meta and source -> no redraw, but opacity still set.
    applyGhostPresentation(state, {
      ghostCar: car,
      ghostPlate: plate,
      replay: makeReplay(),
      raceStartMs: 0,
      nowMs: 66,
      active: true,
      showNameplate: true,
      meta: META,
      source: 'top',
      playerX: FAR_PLAYER_X,
      playerZ: 0,
    })
    expect(plate.apply).toHaveBeenCalledTimes(1)
    expect(plate.setOpacity).toHaveBeenCalled()
  })

  it('redraws the nameplate when meta changes', () => {
    const car = new Group()
    const plate = makeNameplate()
    const state = initGhostPresentation()
    const base = {
      ghostCar: car,
      ghostPlate: plate,
      replay: makeReplay(),
      raceStartMs: 0,
      nowMs: 33,
      active: true,
      showNameplate: true,
      source: 'top' as const,
      playerX: FAR_PLAYER_X,
      playerZ: 0,
    }

    applyGhostPresentation(state, { ...base, meta: META })
    applyGhostPresentation(state, { ...base, meta: META_OTHER })

    expect(plate.apply).toHaveBeenCalledTimes(2)
    expect(plate.apply).toHaveBeenLastCalledWith(META_OTHER, 'top')
  })

  it('hides the nameplate when the player is too close', () => {
    const car = new Group()
    const plate = makeNameplate()
    const state = initGhostPresentation()

    const out = applyGhostPresentation(state, {
      ghostCar: car,
      ghostPlate: plate,
      replay: makeReplay(),
      raceStartMs: 0,
      nowMs: 0, // sample 0: x=0, z=0 -> distance = |NEAR_PLAYER_X|
      active: true,
      showNameplate: true,
      meta: META,
      source: 'top',
      playerX: NEAR_PLAYER_X,
      playerZ: 0,
    })

    expect(out.visible).toBe(true)
    expect(out.distance).toBeLessThan(NAMEPLATE_CLOSE_HIDE_DISTANCE)
    expect(plate.apply).not.toHaveBeenCalled()
  })

  it('hides the nameplate when showNameplate is false', () => {
    const car = new Group()
    const plate = makeNameplate()
    const state = initGhostPresentation()

    applyGhostPresentation(state, {
      ghostCar: car,
      ghostPlate: plate,
      replay: makeReplay(),
      raceStartMs: 0,
      nowMs: 33,
      active: true,
      showNameplate: false,
      meta: META,
      source: 'top',
      playerX: FAR_PLAYER_X,
      playerZ: 0,
    })

    expect(plate.apply).not.toHaveBeenCalled()
  })

  it('flips nameplate visibility off on the first hidden frame after a visible one', () => {
    const car = new Group()
    const plate = makeNameplate()
    const state = initGhostPresentation()

    // Frame 1: visible.
    applyGhostPresentation(state, {
      ghostCar: car,
      ghostPlate: plate,
      replay: makeReplay(),
      raceStartMs: 0,
      nowMs: 33,
      active: true,
      showNameplate: true,
      meta: META,
      source: 'top',
      playerX: FAR_PLAYER_X,
      playerZ: 0,
    })
    expect(plate.setVisible).not.toHaveBeenCalled()

    // Frame 2: showNameplate flips off -> setVisible(false) fires once.
    applyGhostPresentation(state, {
      ghostCar: car,
      ghostPlate: plate,
      replay: makeReplay(),
      raceStartMs: 0,
      nowMs: 66,
      active: true,
      showNameplate: false,
      meta: META,
      source: 'top',
      playerX: FAR_PLAYER_X,
      playerZ: 0,
    })
    expect(plate.setVisible).toHaveBeenCalledWith(false)

    // Frame 3: still hidden. The helper does not re-call setVisible(false).
    plate.setVisible.mockClear()
    applyGhostPresentation(state, {
      ghostCar: car,
      ghostPlate: plate,
      replay: makeReplay(),
      raceStartMs: 0,
      nowMs: 99,
      active: true,
      showNameplate: false,
      meta: META,
      source: 'top',
      playerX: FAR_PLAYER_X,
      playerZ: 0,
    })
    expect(plate.setVisible).not.toHaveBeenCalled()
  })

  it('returns Number.POSITIVE_INFINITY distance when the ghost is hidden', () => {
    const out = applyGhostPresentation(initGhostPresentation(), {
      ghostCar: new Group(),
      ghostPlate: makeNameplate(),
      replay: null,
      raceStartMs: 0,
      nowMs: 0,
      active: true,
      showNameplate: true,
      meta: META,
      source: 'top',
      playerX: 0,
      playerZ: 0,
    })
    expect(out.distance).toBe(Number.POSITIVE_INFINITY)
  })
})
