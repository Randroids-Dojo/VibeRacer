import { describe, expect, it } from 'vitest'
import {
  FOUL_THROTTLE_THRESHOLD,
  dragTick,
  handlePreCountdownInput,
  initDragGameState,
  startDragRace,
  type DragTickConfig,
} from '@/game/dragTick'
import { buildTrackPath } from '@/game/trackPath'
import {
  DRAG_STRIPS,
  dragStripCheckpoints,
  dragStripPieces,
} from '@/lib/dragStrips'
import {
  DEFAULT_DRAG_LOADOUT,
  type DragLoadout,
} from '@/lib/dragParts'
import { deriveDragCarParams } from '@/game/dragTuning'
import {
  FLAT_PROFILE,
  verticalProfileFromNormalized,
} from '@/game/dragVerticalProfile'

function buildPath(slug: keyof typeof DRAG_STRIPS) {
  const strip = DRAG_STRIPS[slug]
  return buildTrackPath(dragStripPieces(strip), undefined, dragStripCheckpoints(strip))
}

function setupRace(
  slug: keyof typeof DRAG_STRIPS,
  loadout: DragLoadout = DEFAULT_DRAG_LOADOUT,
) {
  const strip = DRAG_STRIPS[slug]
  const path = buildPath(slug)
  const derived = deriveDragCarParams(loadout, strip)
  const config: DragTickConfig = {
    totalWeight: derived.derivation.totalWeight,
    launch: derived.launch,
    verticalProfile: strip.verticalProfile,
  }
  let state = initDragGameState(path)
  state = startDragRace(state, 0)
  return { strip, path, derived, config, state }
}

describe('handlePreCountdownInput', () => {
  it('flips fouled and seeds the dampening factor on the first throttle press', () => {
    const { config } = setupRace('salt-flats')
    const initial = initDragGameState(buildPath('salt-flats'))
    const after = handlePreCountdownInput(
      initial,
      { throttle: 1, steer: 0, handbrake: false },
      config,
    )
    expect(after.fouled).toBe(true)
    expect(after.foulPenaltyAccelFactor).toBe(config.launch.jumpStartAccelFactor)
    expect(after.preGoThrottleSeen).toBe(true)
  })

  it('does nothing on a sub-threshold throttle press', () => {
    const { config } = setupRace('salt-flats')
    const initial = initDragGameState(buildPath('salt-flats'))
    const after = handlePreCountdownInput(
      initial,
      { throttle: FOUL_THROTTLE_THRESHOLD * 0.5, steer: 0, handbrake: false },
      config,
    )
    expect(after.fouled).toBe(false)
    expect(after.preGoThrottleSeen).toBe(false)
  })

  it('cannot re-foul once fouled', () => {
    const { config } = setupRace('salt-flats')
    let s = initDragGameState(buildPath('salt-flats'))
    s = handlePreCountdownInput(
      s,
      { throttle: 1, steer: 0, handbrake: false },
      config,
    )
    const before = s.foulPenaltyAccelFactor
    s = handlePreCountdownInput(
      s,
      { throttle: 1, steer: 0, handbrake: false },
      config,
    )
    expect(s.foulPenaltyAccelFactor).toBe(before)
  })
})

describe('dragTick', () => {
  it('does not move the car before raceStartMs is set', () => {
    const setup = setupRace('salt-flats')
    let state = initDragGameState(setup.path)
    // raceStartMs is null
    const result = dragTick(
      state,
      { throttle: 1, steer: 0, handbrake: false },
      16,
      0,
      setup.path,
      setup.derived.params,
      setup.config,
    )
    expect(result.state.x).toBe(state.x)
    expect(result.state.z).toBe(state.z)
    expect(result.state.speed).toBe(0)
    expect(result.finished).toBeNull()
  })

  it('moves the car forward after race start with throttle', () => {
    const setup = setupRace('salt-flats')
    const result = dragTick(
      setup.state,
      { throttle: 1, steer: 0, handbrake: false },
      16,
      16,
      setup.path,
      setup.derived.params,
      setup.config,
    )
    expect(Math.abs(result.state.speed)).toBeGreaterThan(0)
  })

  it('exponentially decays the foul penalty toward 1.0 over time', () => {
    const setup = setupRace('salt-flats')
    let state: typeof setup.state = {
      ...setup.state,
      fouled: true,
      foulPenaltyAccelFactor: 0.15,
    }
    let nowMs = 0
    for (let i = 0; i < 200; i++) {
      const result = dragTick(
        state,
        { throttle: 0, steer: 0, handbrake: false },
        16,
        nowMs,
        setup.path,
        setup.derived.params,
        setup.config,
      )
      state = result.state
      nowMs += 16
    }
    expect(state.foulPenaltyAccelFactor).toBeGreaterThan(0.95)
    expect(state.foulPenaltyAccelFactor).toBeLessThanOrEqual(1)
  })

  it('records reaction time on the first post-GO throttle press', () => {
    const setup = setupRace('salt-flats')
    let state = setup.state
    // No throttle for the first 200 ms.
    for (let i = 0; i < 12; i++) {
      const result = dragTick(
        state,
        { throttle: 0, steer: 0, handbrake: false },
        16,
        i * 16,
        setup.path,
        setup.derived.params,
        setup.config,
      )
      state = result.state
    }
    const result = dragTick(
      state,
      { throttle: 1, steer: 0, handbrake: false },
      16,
      200,
      setup.path,
      setup.derived.params,
      setup.config,
    )
    expect(result.state.reactionTimeMs).toBeGreaterThanOrEqual(190)
    expect(result.state.reactionTimeMs).toBeLessThanOrEqual(220)
  })

  it('downhill accelerates a coasting car (no throttle)', () => {
    const downhillProfile = verticalProfileFromNormalized(800, [
      { sFrac: 0, height: 0 },
      { sFrac: 1, height: -40 },
    ])
    const setup = setupRace('salt-flats')
    const config: DragTickConfig = {
      ...setup.config,
      verticalProfile: downhillProfile,
    }
    // Start with a small forward speed and coast (no throttle).
    let state: typeof setup.state = { ...setup.state, speed: 1, heading: setup.path.spawn.heading }
    // Move car a few units forward into the slope so slopeAt is non-zero.
    state = { ...state, x: state.x + Math.cos(state.heading) * 50, z: state.z - Math.sin(state.heading) * 50 }
    let nowMs = 16
    for (let i = 0; i < 120; i++) {
      const result = dragTick(
        state,
        { throttle: 0, steer: 0, handbrake: false },
        16,
        nowMs,
        setup.path,
        setup.derived.params,
        config,
      )
      state = result.state
      nowMs += 16
    }
    // Coasting on a downhill, the car should retain or gain speed despite
    // rolling friction.
    expect(state.speed).toBeGreaterThan(0)
  })

  it('uphill bleeds speed off a coasting car compared to flat', () => {
    const uphillProfile = verticalProfileFromNormalized(800, [
      { sFrac: 0, height: 0 },
      { sFrac: 1, height: 60 },
    ])
    const baseSetup = setupRace('salt-flats')
    let flatState: typeof baseSetup.state = { ...baseSetup.state, speed: 10 }
    flatState = {
      ...flatState,
      x: flatState.x + Math.cos(flatState.heading) * 50,
      z: flatState.z - Math.sin(flatState.heading) * 50,
    }
    let upState: typeof baseSetup.state = { ...flatState }

    let nowMs = 16
    for (let i = 0; i < 60; i++) {
      flatState = dragTick(
        flatState,
        { throttle: 0, steer: 0, handbrake: false },
        16,
        nowMs,
        baseSetup.path,
        baseSetup.derived.params,
        { ...baseSetup.config, verticalProfile: FLAT_PROFILE },
      ).state
      upState = dragTick(
        upState,
        { throttle: 0, steer: 0, handbrake: false },
        16,
        nowMs,
        baseSetup.path,
        baseSetup.derived.params,
        { ...baseSetup.config, verticalProfile: uphillProfile },
      ).state
      nowMs += 16
    }

    expect(upState.speed).toBeLessThan(flatState.speed)
  })

  it('finishes when the car reaches the final checkpoint cell and freezes the timer', () => {
    const setup = setupRace('salt-flats')
    const last = setup.strip.lengthCells - 1
    // Walk the car cell by cell along the strip so the cell-walk picks up
    // every checkpoint in order. The third checkpoint (at row -last) must
    // trigger a finish event. Without the K = length - 1 fix, drag inherited
    // the closed-loop "wrap back to start" entry and the race never ended.
    let state = setup.state
    let nowMs = 16
    let finished: ReturnType<typeof dragTick>['finished'] = null
    for (let row = 1; row <= last; row++) {
      state = { ...state, x: 0, z: -row * 20 }
      const result = dragTick(
        state,
        { throttle: 0, steer: 0, handbrake: false },
        16,
        nowMs,
        setup.path,
        setup.derived.params,
        setup.config,
      )
      state = result.state
      if (result.finished) {
        finished = result.finished
        break
      }
      nowMs += 16
    }
    expect(finished).not.toBeNull()
    expect(finished?.hits).toHaveLength(3)
    expect(state.finishedAtMs).not.toBeNull()
  })

  it('does not record additional checkpoints once finished', () => {
    const setup = setupRace('salt-flats')
    const last = setup.strip.lengthCells - 1
    let state: typeof setup.state = {
      ...setup.state,
      finishedAtMs: 1234,
      hits: [
        { cpId: 0, tMs: 100 },
        { cpId: 1, tMs: 600 },
        { cpId: 2, tMs: 1234 },
      ],
      nextCpId: 3,
    }
    const finishX = setup.path.order[last].piece.col * 20
    const finishZ = -last * 20
    state = { ...state, x: finishX, z: finishZ }
    const result = dragTick(
      state,
      { throttle: 1, steer: 0, handbrake: false },
      16,
      9999,
      setup.path,
      setup.derived.params,
      setup.config,
    )
    expect(result.state.finishedAtMs).toBe(1234)
    expect(result.state.hits).toHaveLength(3)
    expect(result.finished).toBeNull()
  })
})

describe('dragTick shift quality', () => {
  // Gear-1 max-speed factor from MANUAL_GEAR_SPECS. Pinned here so the
  // tests can compute a target gear cap (params.maxSpeed * factor)
  // without re-importing the table.
  const GEAR_1_MAX_FACTOR = 0.34

  it("classifies an upshift well below the gear cap as 'early'", () => {
    const setup = setupRace('salt-flats')
    // Gear 1 cap = params.maxSpeed * 0.34. We sit at ~40% of that, well
    // below the 0.85 perfect threshold.
    const earlySpeed = setup.derived.params.maxSpeed * GEAR_1_MAX_FACTOR * 0.4
    const state = { ...setup.state, speed: earlySpeed, gear: 1, gearPeakHoldSec: 0 }
    const result = dragTick(
      state,
      { throttle: 1, steer: 0, handbrake: false, shiftUp: true },
      16,
      16,
      setup.path,
      setup.derived.params,
      setup.config,
    )
    expect(result.shiftEvent).toBe('up')
    expect(result.shiftQuality).toBe('early')
  })

  it("classifies an upshift near the cap with no bog as 'perfect'", () => {
    const setup = setupRace('salt-flats')
    const perfectSpeed = setup.derived.params.maxSpeed * GEAR_1_MAX_FACTOR * 0.95
    const state = { ...setup.state, speed: perfectSpeed, gear: 1, gearPeakHoldSec: 0 }
    const result = dragTick(
      state,
      { throttle: 1, steer: 0, handbrake: false, shiftUp: true },
      16,
      16,
      setup.path,
      setup.derived.params,
      setup.config,
    )
    expect(result.shiftEvent).toBe('up')
    expect(result.shiftQuality).toBe('perfect')
  })

  it("classifies an upshift after bogging at the cap as 'late'", () => {
    const setup = setupRace('salt-flats')
    const atCapSpeed = setup.derived.params.maxSpeed * GEAR_1_MAX_FACTOR
    const state = {
      ...setup.state,
      speed: atCapSpeed,
      gear: 1,
      gearPeakHoldSec: 0.5,
    }
    const result = dragTick(
      state,
      { throttle: 1, steer: 0, handbrake: false, shiftUp: true },
      16,
      16,
      setup.path,
      setup.derived.params,
      setup.config,
    )
    expect(result.shiftEvent).toBe('up')
    expect(result.shiftQuality).toBe('late')
  })

  it('produces no quality on a downshift', () => {
    const setup = setupRace('salt-flats')
    const state = { ...setup.state, speed: 5, gear: 3, gearPeakHoldSec: 0 }
    const result = dragTick(
      state,
      { throttle: 1, steer: 0, handbrake: false, shiftDown: true },
      16,
      16,
      setup.path,
      setup.derived.params,
      setup.config,
    )
    expect(result.shiftEvent).toBe('down')
    expect(result.shiftQuality).toBeNull()
  })

  it('clears gearPeakHoldSec on a shift even if speed is still at the cap', () => {
    const setup = setupRace('salt-flats')
    const atCap = setup.derived.params.maxSpeed * GEAR_1_MAX_FACTOR
    const state = {
      ...setup.state,
      speed: atCap,
      gear: 1,
      gearPeakHoldSec: 0.6,
    }
    const result = dragTick(
      state,
      { throttle: 1, steer: 0, handbrake: false, shiftUp: true },
      16,
      16,
      setup.path,
      setup.derived.params,
      setup.config,
    )
    expect(result.state.gearPeakHoldSec).toBe(0)
  })

  it('accumulates gearPeakHoldSec while the player bogs at the cap', () => {
    const setup = setupRace('salt-flats')
    // Pre-load the car near the gear 1 cap so we don't have to integrate
    // up to it before the hold counter starts ticking. Anything >= 0.95
    // of the cap is "in the redline" per DRAG_REDLINE_RATIO.
    const atCap = setup.derived.params.maxSpeed * GEAR_1_MAX_FACTOR
    let state = { ...setup.state, speed: atCap }
    let nowMs = 16
    for (let i = 0; i < 40; i++) {
      const result = dragTick(
        state,
        { throttle: 1, steer: 0, handbrake: false },
        16,
        nowMs,
        setup.path,
        setup.derived.params,
        setup.config,
      )
      state = result.state
      nowMs += 16
    }
    expect(state.gearPeakHoldSec).toBeGreaterThan(0.4)
  })
})
