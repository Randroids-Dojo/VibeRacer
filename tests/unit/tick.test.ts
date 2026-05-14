import { describe, it, expect } from 'vitest'
import { buildTrackPath } from '@/game/trackPath'
import { DEFAULT_CAR_PARAMS } from '@/game/physics'
import { DEFAULT_TRACK_PIECES } from '@/lib/defaultTrack'
import { initGameState, startRace, tick } from '@/game/tick'

const path = buildTrackPath(DEFAULT_TRACK_PIECES)

describe('tick', () => {
  it('initGameState places car at spawn and on-track', () => {
    const s = initGameState(path)
    expect(s.x).toBeCloseTo(path.spawn.position.x, 6)
    expect(s.z).toBeCloseTo(path.spawn.position.z, 6)
    expect(s.heading).toBeCloseTo(path.spawn.heading, 6)
    expect(s.angularVelocity).toBe(0)
    expect(s.raceStartMs).toBeNull()
    expect(s.nextCpId).toBe(0)
    expect(s.gear).toBe(1)
  })

  it('before startRace, physics does not progress', () => {
    const s = initGameState(path)
    const r = tick(s, { throttle: 1, steer: 0, handbrake: false }, 16, 1000, path)
    expect(r.state.x).toBeCloseTo(s.x, 6)
    expect(r.state.speed).toBe(0)
    expect(r.state.angularVelocity).toBe(0)
  })

  it('keeps angular velocity in game state while racing', () => {
    const s = { ...startRace(initGameState(path), 0), speed: 12 }
    const r = tick(
      s,
      { throttle: 0, steer: 1, handbrake: false },
      100,
      100,
      path,
    )
    expect(r.state.angularVelocity).toBeGreaterThan(0)
    expect(r.state.heading).not.toBeCloseTo(s.heading, 6)
  })

  it('shifts gears only when manual transmission is active', () => {
    const s = startRace(initGameState(path), 0)
    const automatic = tick(
      s,
      { throttle: 0, steer: 0, handbrake: false, shiftUp: true },
      16,
      16,
      path,
    )
    expect(automatic.state.gear).toBe(1)

    const manual = tick(
      s,
      { throttle: 0, steer: 0, handbrake: false, shiftUp: true },
      16,
      16,
      path,
      undefined,
      'manual',
    )
    expect(manual.state.gear).toBe(2)
  })

  it('emits a shiftEvent when the player upshifts in manual (enhanced)', () => {
    const s = startRace(initGameState(path), 0)
    const r = tick(
      s,
      { throttle: 0, steer: 0, handbrake: false, shiftUp: true },
      16,
      16,
      path,
      undefined,
      'manual',
      true,
    )
    expect(r.shiftEvent).toBe('up')
    expect(r.state.gear).toBe(2)
    expect(r.state.torqueCutSec).toBeGreaterThan(0)
  })

  it('does not emit a shiftEvent in legacy (enhanced=false) manual upshifts', () => {
    // Legacy behavior: shift inputs change gear but produce no shiftEvent and
    // no torque cut. This is the pre-rework feel.
    const s = startRace(initGameState(path), 0)
    const r = tick(
      s,
      { throttle: 0, steer: 0, handbrake: false, shiftUp: true },
      16,
      16,
      path,
      undefined,
      'manual',
      false,
    )
    expect(r.shiftEvent).toBeNull()
    expect(r.state.gear).toBe(2)
    expect(r.state.torqueCutSec).toBe(0)
  })

  it('emits a shiftEvent when enhanced auto-mode crosses a gear boundary', () => {
    const s = {
      ...startRace(initGameState(path), 0),
      // Speed just past dynamic gear 1's cap (0.28 * 26 = 7.28) so auto wants gear 2.
      speed: DEFAULT_CAR_PARAMS.maxSpeed * 0.3,
    }
    const r = tick(
      s,
      { throttle: 1, steer: 0, handbrake: false },
      16,
      16,
      path,
      undefined,
      'automatic',
      true,
    )
    expect(r.shiftEvent).toBe('up')
    expect(r.state.gear).toBeGreaterThan(1)
  })

  it('enhanced auto applies gear maxSpeedFactor so accel tapers within each gear', () => {
    // Hold the car at speed 5 in gear 1 - below the 95% upshift trigger
    // (0.28 * 0.95 = 0.266 → trigger at speed 6.92, ratio 0.192 here). One
    // tick at full throttle. With the gear cap applied the quartic taper
    // bites hard against the 7.28 cap and the per-tick gain is small;
    // without the cap the taper would be computed against base maxSpeed 26
    // and the gain would be nearly the full accel * dt.
    const s = { ...startRace(initGameState(path), 0), gear: 1, speed: 5 }
    const r = tick(
      s,
      { throttle: 1, steer: 0, handbrake: false },
      16,
      16,
      path,
      undefined,
      'automatic',
      true,
    )
    // autoShiftGear must NOT upshift at this speed (ratio 0.192 < 0.266).
    expect(r.state.gear).toBe(1)
    // Expected per-tick gain with cap applied (taper against 7.28):
    //   accel * (1 - (5/7.28)^4) * dt = 29.7 * 0.778 * 0.016 = ~0.37 m/s.
    // Without the cap (the old buggy path, taper against 26):
    //   accel * (1 - (5/26)^4) * dt = 29.7 * 0.999 * 0.016 = ~0.475 m/s.
    // The 0.42 upper bound passes only when the cap is engaged.
    const gain = r.state.speed - 5
    expect(gain).toBeGreaterThan(0.3)
    expect(gain).toBeLessThan(0.42)
  })

  it('extendedTopSpeed doubles the effective speed cap', () => {
    // Pre-rev the car well past the legacy maxSpeed and clear race state to
    // isolate the cap: no throttle, no auto-shift considerations beyond gear
    // 1, no shifts in legacy mode anyway.
    const baseState = {
      ...startRace(initGameState(path), 0),
      speed: 100,
    }
    const baseline = tick(
      baseState,
      { throttle: 0, steer: 0, handbrake: false },
      16,
      16,
      path,
      undefined,
      'automatic',
      false,
      false,
    )
    const extended = tick(
      baseState,
      { throttle: 0, steer: 0, handbrake: false },
      16,
      16,
      path,
      undefined,
      'automatic',
      false,
      true,
    )
    // Baseline clamps to 26 (DEFAULT_CAR_PARAMS.maxSpeed); extended clamps
    // to 52 (2x). Both apply rolling friction over the tick. Bounds wide
    // enough to tolerate future friction tuning while still asserting
    // "near 52, not near 26."
    expect(baseline.state.speed).toBeLessThan(27)
    expect(extended.state.speed).toBeGreaterThan(48)
    expect(extended.state.speed).toBeLessThanOrEqual(52)
  })

  it('extendedTopSpeed forces the quartic taper so the long pull is asymptotic', () => {
    // Compare two single-tick runs at v=20 (under both caps, no clamp).
    // Legacy linear pull: gain = accel * dt = 18 * 0.016 = 0.288 m/s.
    // Extended (cap 52, taper): gain = 18 * (1 - (20/52)^4) * 0.016 =
    //   18 * 0.978 * 0.016 = ~0.282 m/s.
    // Compare two single-tick runs at v=40 (above legacy cap of 26, in
    // the extended-only tapered band):
    //   Baseline clamps to 26 then friction acts - speed drops to ~26.
    //   Extended is uncapped and tapered: gain at 40 = 18*(1-(40/52)^4)*
    //   0.016 = 18 * 0.65 * 0.016 = ~0.187 m/s, new speed ~40.19.
    // The divergence at v=40 unambiguously demonstrates both effects of
    // the flag (higher cap AND taper).
    const baseState = {
      ...startRace(initGameState(path), 0),
      speed: 40,
    }
    const baseline = tick(
      baseState,
      { throttle: 1, steer: 0, handbrake: false },
      16,
      16,
      path,
      undefined,
      'automatic',
      false,
      false,
    )
    const extended = tick(
      baseState,
      { throttle: 1, steer: 0, handbrake: false },
      16,
      16,
      path,
      undefined,
      'automatic',
      false,
      true,
    )
    // Baseline must clamp back down (or be in the process of clamping)
    // because the legacy cap is 26 and speed=40 starts above it.
    expect(baseline.state.speed).toBeLessThan(27)
    // Extended must continue rising but only slightly - the quartic taper
    // is pulling accel down hard at 77% of cap.
    expect(extended.state.speed).toBeGreaterThan(40)
    expect(extended.state.speed).toBeLessThan(40.4)
  })

  it('extendedTopSpeed off leaves baseline behavior identical', () => {
    // A regression guard: with extendedTopSpeed=false (default) the speed
    // cap stays at the original maxSpeed regardless of the flag plumbing.
    const baseState = {
      ...startRace(initGameState(path), 0),
      speed: 100,
    }
    const result = tick(
      baseState,
      { throttle: 1, steer: 0, handbrake: false },
      16,
      16,
      path,
      undefined,
      'automatic',
      false,
      false,
    )
    expect(result.state.speed).toBeLessThanOrEqual(DEFAULT_CAR_PARAMS.maxSpeed)
  })

  it('enhanced auto downshifts at 70% of prev gear cap without arming a torque cut', () => {
    // Set gear=3 with a speed that has fallen well into gear 2's interior.
    // Gear 2 cap = 0.40 * 26 = 10.4; the downshift hysteresis says drop to
    // gear 2 when ratio falls below gear-2-cap * 0.7 = 7.28 (ratio 0.28).
    // Pin speed at 6.5 (ratio 0.25) so a downshift is unambiguously due.
    const s = {
      ...startRace(initGameState(path), 0),
      gear: 3,
      speed: 6.5,
    }
    const r = tick(
      s,
      { throttle: 0, steer: 0, handbrake: false },
      16,
      16,
      path,
      undefined,
      'automatic',
      true,
    )
    expect(r.state.gear).toBeLessThan(3)
    expect(r.shiftEvent).toBe('down')
    // Auto downshifts share the same "no cut" rule as auto upshifts.
    expect(r.state.torqueCutSec).toBe(0)
  })

  it('legacy auto stays in gear 1 regardless of speed', () => {
    const s = {
      ...startRace(initGameState(path), 0),
      speed: DEFAULT_CAR_PARAMS.maxSpeed,
    }
    const r = tick(
      s,
      { throttle: 1, steer: 0, handbrake: false },
      16,
      16,
      path,
      undefined,
      'automatic',
      false,
    )
    expect(r.state.gear).toBe(1)
    expect(r.shiftEvent).toBeNull()
  })

  it('does not arm a torque cut in enhanced auto upshifts', () => {
    // Dynamic gear 2 cap is 0.40 * 26 = 10.4; pin speed past the 95% trigger.
    const baseState = {
      ...startRace(initGameState(path), 0),
      gear: 2,
      speed: DEFAULT_CAR_PARAMS.maxSpeed * 0.41,
    }
    const r = tick(
      baseState,
      { throttle: 1, steer: 0, handbrake: false },
      16,
      16,
      path,
      undefined,
      'automatic',
      true,
    )
    expect(r.state.gear).toBe(3)
    expect(r.shiftEvent).toBe('up')
    // Auto shifts emit audio+visual events but skip the physics cut. The
    // shift happens at low accel (gear-relative taper) so the half-thrust
    // window would compound into early-gear jank during chained shifts.
    expect(r.state.torqueCutSec).toBe(0)
  })

  it('drains a pre-existing torque cut in auto without re-arming it', () => {
    const baseState = {
      ...startRace(initGameState(path), 0),
      gear: 2,
      torqueCutSec: 0.05,
      speed: DEFAULT_CAR_PARAMS.maxSpeed * 0.41,
    }
    const r = tick(
      baseState,
      { throttle: 1, steer: 0, handbrake: false },
      16,
      16,
      path,
      undefined,
      'automatic',
      true,
    )
    // Cut counter drains from 0.05 by dtSec(0.016); no re-arm in auto.
    expect(r.state.torqueCutSec).toBeLessThan(0.05)
    expect(r.state.torqueCutSec).toBeGreaterThan(0)
  })

  it('snaps gear silently on a multi-band cascade (transmission toggle, enhanced)', () => {
    // Player is coasting in gear 5 at low speed when they flip the setting
    // from manual to automatic. Gear should snap down without a downshift
    // blip or unrequested torque cut.
    const baseState = {
      ...startRace(initGameState(path), 0),
      gear: 5,
      speed: DEFAULT_CAR_PARAMS.maxSpeed * 0.1,
    }
    const r = tick(
      baseState,
      { throttle: 0, steer: 0, handbrake: false },
      16,
      16,
      path,
      undefined,
      'automatic',
      true,
    )
    expect(r.state.gear).toBeLessThan(5)
    expect(r.shiftEvent).toBeNull()
    expect(r.state.torqueCutSec).toBe(0)
  })

  it('torque cut reduces effective acceleration on the shift frame (enhanced)', () => {
    const baseState = startRace(initGameState(path), 0)
    const dtMs = 16
    // Frame A: shift up (torque cut starts).
    const cut = tick(
      baseState,
      { throttle: 1, steer: 0, handbrake: false, shiftUp: true },
      dtMs,
      dtMs,
      path,
      undefined,
      'manual',
      true,
    )
    // Frame B: same input but no shift, baseState already in target gear so
    // no shift event fires (no cut).
    const noCut = tick(
      { ...baseState, gear: 2 },
      { throttle: 1, steer: 0, handbrake: false },
      dtMs,
      dtMs,
      path,
      undefined,
      'manual',
      true,
    )
    // The cut frame must accelerate less than the same gear without a cut.
    expect(cut.state.speed).toBeLessThan(noCut.state.speed)
  })

  it('manual low gear limits top speed below high gear', () => {
    const s = {
      ...startRace(initGameState(path), 0),
      gear: 1,
      speed: 100,
    }
    const low = tick(
      s,
      { throttle: 1, steer: 0, handbrake: false },
      16,
      16,
      path,
      undefined,
      'manual',
    )
    const high = tick(
      { ...s, gear: 5 },
      { throttle: 1, steer: 0, handbrake: false },
      16,
      16,
      path,
      undefined,
      'manual',
    )
    expect(low.state.speed).toBeLessThan(high.state.speed)
  })

  it('teleporting through checkpoints records hits in order and fires lap complete', () => {
    let s = startRace(initGameState(path), 0)
    let now = 0
    const N = path.order.length

    // Teleport through each expected cell to sidestep physics.
    for (let i = 0; i < N; i++) {
      now += 300
      const nextCell = path.order[(i + 1) % N].center
      s = { ...s, x: nextCell.x, z: nextCell.z }
      const r = tick(s, { throttle: 0, steer: 0, handbrake: false }, 16, now, path)
      s = r.state
      if (i < N - 1) {
        expect(r.lapComplete).toBeNull()
        expect(s.nextCpId).toBe(i + 1)
      } else {
        expect(r.lapComplete).not.toBeNull()
        expect(r.lapComplete!.hits.length).toBe(N)
        expect(r.lapComplete!.hits[0].cpId).toBe(0)
        expect(r.lapComplete!.hits[N - 1].cpId).toBe(N - 1)
        expect(s.lapCount).toBe(1)
        expect(s.nextCpId).toBe(0)
      }
    }
  })

  it('visiting an unexpected cell does not advance the checkpoint counter', () => {
    let s = startRace(initGameState(path), 0)
    // Jump the car far off track into a cell that is not the next expected piece.
    s = { ...s, x: 1000, z: 1000 }
    const r = tick(s, { throttle: 0, steer: 0, handbrake: false }, 16, 100, path)
    expect(r.state.nextCpId).toBe(0)
    expect(r.state.onTrack).toBe(false)
  })

  it('applies off-track drag when the car leaves the track area', () => {
    const s = {
      ...startRace(initGameState(path), 0),
      x: 1000,
      z: 1000,
      heading: Math.PI / 2,
      speed: 20,
    }
    const r = tick(
      s,
      { throttle: 1, steer: 0, handbrake: false },
      100,
      100,
      path,
    )
    expect(r.state.onTrack).toBe(false)
    expect(r.state.speed).toBeLessThanOrEqual(
      DEFAULT_CAR_PARAMS.offTrackMaxSpeed + 1e-6,
    )
  })

  it('re-entering start piece mid-lap invalidates hits and restarts the timer', () => {
    let s = startRace(initGameState(path), 0)
    // Hit CP 0 by entering piece 1.
    const piece1 = path.order[1].center
    s = { ...s, x: piece1.x, z: piece1.z }
    let r = tick(s, { throttle: 0, steer: 0, handbrake: false }, 16, 300, path)
    expect(r.state.nextCpId).toBe(1)
    expect(r.state.hits.length).toBe(1)
    s = r.state

    // Now jump back to the start piece without completing the loop.
    const start = path.order[0].center
    s = { ...s, x: start.x, z: start.z }
    r = tick(s, { throttle: 0, steer: 0, handbrake: false }, 16, 900, path)

    expect(r.lapComplete).toBeNull()
    expect(r.state.nextCpId).toBe(0)
    expect(r.state.hits.length).toBe(0)
    expect(r.state.raceStartMs).toBe(900)
    expect(r.state.lapCount).toBe(0)
  })
})

describe('tick with reduced checkpointCount', () => {
  const sparsePath = buildTrackPath(DEFAULT_TRACK_PIECES, 4)

  it('completes the lap after K hits at the K trigger pieces', () => {
    let s = startRace(initGameState(sparsePath), 0)
    let now = 0
    const triggers = sparsePath.cpTriggerPieceIdx
    expect(triggers).toEqual([2, 4, 6, 0])

    for (let k = 0; k < triggers.length; k++) {
      now += 600
      const cell = sparsePath.order[triggers[k]].center
      s = { ...s, x: cell.x, z: cell.z }
      const r = tick(s, { throttle: 0, steer: 0, handbrake: false }, 16, now, sparsePath)
      s = r.state
      if (k < triggers.length - 1) {
        expect(r.lapComplete).toBeNull()
        expect(s.nextCpId).toBe(k + 1)
      } else {
        expect(r.lapComplete).not.toBeNull()
        expect(r.lapComplete!.hits.length).toBe(triggers.length)
        expect(s.lapCount).toBe(1)
        expect(s.nextCpId).toBe(0)
      }
    }
  })

  it('still resets when the car re-enters start before the final CP', () => {
    let s = startRace(initGameState(sparsePath), 0)
    // Hit CP 0 at piece 2.
    const cp0 = sparsePath.order[2].center
    s = { ...s, x: cp0.x, z: cp0.z }
    let r = tick(s, { throttle: 0, steer: 0, handbrake: false }, 16, 500, sparsePath)
    expect(r.state.nextCpId).toBe(1)
    s = r.state

    // Bail back to piece 0 instead of continuing.
    const start = sparsePath.order[0].center
    s = { ...s, x: start.x, z: start.z }
    r = tick(s, { throttle: 0, steer: 0, handbrake: false }, 16, 900, sparsePath)
    expect(r.lapComplete).toBeNull()
    expect(r.state.nextCpId).toBe(0)
    expect(r.state.hits.length).toBe(0)
  })
})

describe('tick with custom checkpoints', () => {
  const customPath = buildTrackPath(DEFAULT_TRACK_PIECES, undefined, [
    DEFAULT_TRACK_PIECES[5],
    DEFAULT_TRACK_PIECES[2],
    DEFAULT_TRACK_PIECES[6],
  ])

  it('completes the lap after custom checkpoints and the finish line', () => {
    let s = startRace(initGameState(customPath), 0)
    let now = 0
    const triggers = customPath.cpTriggerPieceIdx
    expect(triggers).toEqual([2, 5, 6, 0])

    for (let k = 0; k < triggers.length; k++) {
      now += 600
      const cell = customPath.order[triggers[k]].center
      s = { ...s, x: cell.x, z: cell.z }
      const r = tick(s, { throttle: 0, steer: 0, handbrake: false }, 16, now, customPath)
      s = r.state
      if (k < triggers.length - 1) {
        expect(r.lapComplete).toBeNull()
        expect(s.nextCpId).toBe(k + 1)
      } else {
        expect(r.lapComplete).not.toBeNull()
        expect(r.lapComplete!.hits.map((hit) => hit.cpId)).toEqual([0, 1, 2, 3])
        expect(s.lapCount).toBe(1)
      }
    }
  })
})
