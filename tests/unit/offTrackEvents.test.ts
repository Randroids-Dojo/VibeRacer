import { describe, it, expect } from 'vitest'
import {
  flushOffTrackTracker,
  initOffTrackTracker,
  LapTelemetrySchema,
  OffTrackEventSchema,
  stepOffTrackTracker,
  type OffTrackStepInput,
  type OffTrackTrackerState,
} from '@/game/offTrackEvents'

function step(
  prev: OffTrackTrackerState,
  overrides: Partial<OffTrackStepInput>,
) {
  return stepOffTrackTracker(prev, {
    onTrack: overrides.onTrack ?? true,
    lapMs: overrides.lapMs ?? 0,
    x: overrides.x ?? 0,
    z: overrides.z ?? 0,
    heading: overrides.heading ?? 0,
    speed: overrides.speed ?? 0,
    steer: overrides.steer ?? 0,
    throttle: overrides.throttle ?? 0,
    handbrake: overrides.handbrake ?? false,
    distanceFromCenter: overrides.distanceFromCenter ?? 0,
  })
}

describe('initOffTrackTracker', () => {
  it('returns an inactive tracker with no current excursion', () => {
    const s = initOffTrackTracker()
    expect(s.active).toBe(false)
    expect(s.current).toBeNull()
  })

  it('returns a fresh object each call (no shared reference)', () => {
    const a = initOffTrackTracker()
    const b = initOffTrackTracker()
    expect(a).not.toBe(b)
  })
})

describe('stepOffTrackTracker', () => {
  it('on-track to on-track is a no-op', () => {
    const r = step(initOffTrackTracker(), { onTrack: true, lapMs: 100 })
    expect(r.emitted).toBeNull()
    expect(r.state.active).toBe(false)
    expect(r.state.current).toBeNull()
  })

  it('on-track to off-track activates and captures entry snapshot', () => {
    const r = step(initOffTrackTracker(), {
      onTrack: false,
      lapMs: 1234,
      x: 7,
      z: -3,
      heading: 1.2,
      speed: 18,
      steer: 0.6,
      throttle: 0.4,
      handbrake: false,
      distanceFromCenter: 4.1,
    })
    expect(r.emitted).toBeNull()
    expect(r.state.active).toBe(true)
    expect(r.state.current).not.toBeNull()
    expect(r.state.current?.entry.lapMs).toBe(1234)
    expect(r.state.current?.entry.x).toBe(7)
    expect(r.state.current?.entry.z).toBe(-3)
    expect(r.state.current?.entry.speed).toBe(18)
    expect(r.state.current?.entry.steer).toBe(0.6)
    expect(r.state.current?.peakSpeed).toBe(18)
    expect(r.state.current?.peakDistance).toBe(4.1)
  })

  it('updates peakSpeed and peakDistance monotonically across off-track frames', () => {
    let s = initOffTrackTracker()
    s = step(s, { onTrack: false, lapMs: 100, speed: 10, distanceFromCenter: 5 }).state
    s = step(s, { onTrack: false, lapMs: 116, speed: 14, distanceFromCenter: 6 }).state
    s = step(s, { onTrack: false, lapMs: 132, speed: 9, distanceFromCenter: 6.5 }).state
    s = step(s, { onTrack: false, lapMs: 148, speed: -16, distanceFromCenter: 4 }).state
    expect(s.current?.peakSpeed).toBe(16)
    expect(s.current?.peakDistance).toBe(6.5)
    expect(s.current?.entry.speed).toBe(10)
  })

  it('preserves the entry speed verbatim across subsequent off-track frames', () => {
    // The entry frame carries the player's approach speed (pre-step value the
    // caller passes). Later frames in the same excursion deliver post-clamp
    // values; the entry snapshot must not be rewritten by them. This is the
    // contract that lets the player see "I went off at 22 m/s" even though
    // the off-track speed cap pins later frames to offTrackMaxSpeed.
    let s = initOffTrackTracker()
    s = step(s, { onTrack: false, lapMs: 1000, speed: 22, distanceFromCenter: 5 }).state
    s = step(s, { onTrack: false, lapMs: 1033, speed: 13.4, distanceFromCenter: 6 }).state
    s = step(s, { onTrack: false, lapMs: 1066, speed: 13.4, distanceFromCenter: 6 }).state
    expect(s.current?.entry.speed).toBe(22)
    const r = step(s, { onTrack: true, lapMs: 1099 })
    expect(r.emitted?.speed).toBe(22)
    expect(r.emitted?.peakSpeed).toBe(22)
  })

  it('off-track to on-track emits an event with duration, peaks, and exit time', () => {
    let s = initOffTrackTracker()
    s = step(s, {
      onTrack: false,
      lapMs: 1000,
      speed: 20,
      distanceFromCenter: 5,
      steer: 0.8,
      throttle: 1,
    }).state
    s = step(s, { onTrack: false, lapMs: 1100, speed: 22, distanceFromCenter: 7 }).state
    const r = step(s, { onTrack: true, lapMs: 1420 })
    expect(r.emitted).not.toBeNull()
    expect(r.emitted?.lapMs).toBe(1000)
    expect(r.emitted?.durationMs).toBe(420)
    expect(r.emitted?.exitLapMs).toBe(1420)
    expect(r.emitted?.peakSpeed).toBe(22)
    expect(r.emitted?.peakDistanceFromCenter).toBe(7)
    expect(r.emitted?.steer).toBe(0.8)
    expect(r.emitted?.throttle).toBe(1)
    expect(r.state.active).toBe(false)
    expect(r.state.current).toBeNull()
  })

  it('emits two independent events for two excursions in the same lap', () => {
    let s = initOffTrackTracker()
    s = step(s, { onTrack: false, lapMs: 200, speed: 12, distanceFromCenter: 5 }).state
    const r1 = step(s, { onTrack: true, lapMs: 350 })
    s = r1.state
    expect(r1.emitted?.durationMs).toBe(150)

    s = step(s, { onTrack: false, lapMs: 800, speed: 18, distanceFromCenter: 6 }).state
    const r2 = step(s, { onTrack: true, lapMs: 1100 })
    expect(r2.emitted?.lapMs).toBe(800)
    expect(r2.emitted?.durationMs).toBe(300)
    expect(r2.emitted?.peakSpeed).toBe(18)
  })

  it('clamps a negative duration to zero (defends against a clock-rewind frame)', () => {
    let s = initOffTrackTracker()
    s = step(s, { onTrack: false, lapMs: 500, speed: 10 }).state
    const r = step(s, { onTrack: true, lapMs: 400 })
    expect(r.emitted?.durationMs).toBe(0)
    expect(r.emitted?.exitLapMs).toBe(400)
  })

  it('non-finite inputs do not crash and do not emit phantom events', () => {
    let s = initOffTrackTracker()
    const r1 = step(s, { onTrack: false, lapMs: Number.NaN })
    expect(r1.emitted).toBeNull()
    expect(r1.state.active).toBe(false)

    s = step(s, { onTrack: false, lapMs: 100, speed: 12 }).state
    const r2 = step(s, { onTrack: false, lapMs: Number.POSITIVE_INFINITY })
    expect(r2.emitted).toBeNull()

    const r3 = step(s, { onTrack: true, lapMs: Number.NaN })
    expect(r3.emitted).toBeNull()
    expect(r3.state.active).toBe(true)
  })

  it('coerces non-boolean handbrake values defensively to a boolean snapshot', () => {
    const r = step(initOffTrackTracker(), {
      onTrack: false,
      lapMs: 100,
      handbrake: true,
    })
    expect(r.state.current?.entry.handbrake).toBe(true)
  })
})

describe('flushOffTrackTracker', () => {
  it('returns null when the tracker is idle', () => {
    expect(flushOffTrackTracker(initOffTrackTracker())).toBeNull()
  })

  it('emits an event with exitLapMs null when the lap ends mid-excursion', () => {
    let s = initOffTrackTracker()
    s = step(s, { onTrack: false, lapMs: 2000, speed: 8, distanceFromCenter: 5 }).state
    s = step(s, { onTrack: false, lapMs: 2200, speed: 12, distanceFromCenter: 6 }).state
    const flushed = flushOffTrackTracker(s)
    expect(flushed).not.toBeNull()
    expect(flushed?.exitLapMs).toBeNull()
    expect(flushed?.lapMs).toBe(2000)
    expect(flushed?.durationMs).toBe(200)
    expect(flushed?.peakSpeed).toBe(12)
  })
})

describe('OffTrackEventSchema', () => {
  it('round-trips a valid event', () => {
    const event = {
      lapMs: 100,
      x: 1,
      z: 2,
      heading: 0.5,
      speed: 18,
      steer: 0.4,
      throttle: 1,
      handbrake: false,
      distanceFromCenter: 5,
      durationMs: 200,
      peakSpeed: 20,
      peakDistanceFromCenter: 6,
      exitLapMs: 300,
    }
    expect(OffTrackEventSchema.parse(event)).toEqual(event)
  })

  it('accepts a null exitLapMs (lap-end flush case)', () => {
    const r = OffTrackEventSchema.safeParse({
      lapMs: 100,
      x: 0,
      z: 0,
      heading: 0,
      speed: 10,
      steer: 0,
      throttle: 0,
      handbrake: false,
      distanceFromCenter: 4,
      durationMs: 100,
      peakSpeed: 10,
      peakDistanceFromCenter: 4,
      exitLapMs: null,
    })
    expect(r.success).toBe(true)
  })

  it('rejects a negative distanceFromCenter (invariant: it is a magnitude)', () => {
    const r = OffTrackEventSchema.safeParse({
      lapMs: 100,
      x: 0,
      z: 0,
      heading: 0,
      speed: 10,
      steer: 0,
      throttle: 0,
      handbrake: false,
      distanceFromCenter: -1,
      durationMs: 100,
      peakSpeed: 10,
      peakDistanceFromCenter: 4,
      exitLapMs: 200,
    })
    expect(r.success).toBe(false)
  })

  it('rejects non-finite numerics and negative duration', () => {
    expect(
      OffTrackEventSchema.safeParse({
        lapMs: Number.NaN,
        x: 0,
        z: 0,
        heading: 0,
        speed: 0,
        steer: 0,
        throttle: 0,
        handbrake: false,
        distanceFromCenter: 0,
        durationMs: 0,
        peakSpeed: 0,
        peakDistanceFromCenter: 0,
        exitLapMs: null,
      }).success,
    ).toBe(false)
    expect(
      OffTrackEventSchema.safeParse({
        lapMs: 0,
        x: 0,
        z: 0,
        heading: 0,
        speed: 0,
        steer: 0,
        throttle: 0,
        handbrake: false,
        distanceFromCenter: 0,
        durationMs: -1,
        peakSpeed: 0,
        peakDistanceFromCenter: 0,
        exitLapMs: null,
      }).success,
    ).toBe(false)
  })
})

describe('LapTelemetrySchema', () => {
  it('round-trips a valid telemetry payload', () => {
    const t = {
      sampleMs: 33,
      positions: [
        [0, 0],
        [1, 0],
        [2, 0],
      ] as [number, number][],
      speeds: [0, 5, 10],
      lapTimeMs: 12000,
      offTrackEvents: [],
    }
    expect(LapTelemetrySchema.parse(t)).toEqual(t)
  })

  it('rejects mismatched positions and speeds lengths', () => {
    const r = LapTelemetrySchema.safeParse({
      sampleMs: 33,
      positions: [[0, 0]] as [number, number][],
      speeds: [0, 5],
      lapTimeMs: null,
      offTrackEvents: [],
    })
    expect(r.success).toBe(false)
  })

  it('rejects non-positive sampleMs and non-finite speeds', () => {
    expect(
      LapTelemetrySchema.safeParse({
        sampleMs: 0,
        positions: [],
        speeds: [],
        lapTimeMs: null,
        offTrackEvents: [],
      }).success,
    ).toBe(false)
    expect(
      LapTelemetrySchema.safeParse({
        sampleMs: 33,
        positions: [[0, 0]] as [number, number][],
        speeds: [Number.NaN],
        lapTimeMs: null,
        offTrackEvents: [],
      }).success,
    ).toBe(false)
  })

  it('accepts a null lapTimeMs (aborted run with partial telemetry)', () => {
    const r = LapTelemetrySchema.safeParse({
      sampleMs: 33,
      positions: [[0, 0], [1, 1]] as [number, number][],
      speeds: [0, 1],
      lapTimeMs: null,
      offTrackEvents: [],
    })
    expect(r.success).toBe(true)
  })
})
