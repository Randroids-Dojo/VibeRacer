import { describe, expect, it } from 'vitest'
import {
  CONTINUOUS_TUNING_MAX_SUGGESTIONS,
  applyContinuousSuggestion,
  suggestContinuousTuningTweaks,
  type ContinuousSuggestionInput,
} from '@/lib/continuousTuning'
import { DEFAULT_CAR_PARAMS } from '@/game/physics'
import type { LapTelemetry, OffTrackEvent } from '@/game/offTrackEvents'
import { TUNING_BOUNDS, cloneDefaultParams } from '@/lib/tuningSettings'

function makeOffTrackEvent(overrides: Partial<OffTrackEvent> = {}): OffTrackEvent {
  return {
    lapMs: 10_000,
    x: 0,
    z: 0,
    heading: 0,
    speed: 5,
    steer: 0,
    throttle: 1,
    handbrake: false,
    distanceFromCenter: 5,
    durationMs: 800,
    exitSpeed: 3,
    peakDistanceFromCenter: 6,
    exitLapMs: 10_800,
    ...overrides,
  }
}

function makeTelemetry(speeds: number[]): LapTelemetry {
  return {
    sampleMs: 33,
    positions: speeds.map((_, i) => [i, 0] as [number, number]),
    speeds,
    lapTimeMs: speeds.length * 33,
    offTrackEvents: [],
  }
}

function baseInput(): ContinuousSuggestionInput {
  // The "default driver": full top-speed share with no off-track events.
  // Individual tests override only what they need.
  const params = cloneDefaultParams()
  const speeds = Array.from({ length: 200 }, () => params.maxSpeed * 0.92)
  return {
    params,
    lapTimeMs: speeds.length * 33,
    offTrackEvents: [],
    telemetry: makeTelemetry(speeds),
  }
}

describe('suggestContinuousTuningTweaks', () => {
  it('returns no suggestions on a clean lap that already used most of the top end', () => {
    const input = baseInput()
    // Bump the samples just above the 95% threshold so no shortfall heuristic
    // and no top-end overshoot heuristic fires.
    input.telemetry = makeTelemetry(
      Array.from({ length: 200 }, () => input.params.maxSpeed * 0.9),
    )
    const out = suggestContinuousTuningTweaks(input)
    expect(out).toEqual([])
  })

  it('flags low-speed off-track entries with a sharper low-speed steer rate when steer was modest', () => {
    const input = baseInput()
    input.offTrackEvents = [
      makeOffTrackEvent({ speed: 3, steer: 0.3 }),
      makeOffTrackEvent({ speed: 4, steer: -0.4 }),
    ]
    const out = suggestContinuousTuningTweaks(input)
    const titles = out.map((s) => s.id)
    expect(titles).toContain('turnFasterLowSpeed')
    const top = out.find((s) => s.id === 'turnFasterLowSpeed')!
    expect(top.delta.steerRateLow).toBeGreaterThan(0)
  })

  it('flags low-speed off-track entries with a softer low-speed steer rate when the wheel was at full lock', () => {
    const input = baseInput()
    input.offTrackEvents = [
      makeOffTrackEvent({ speed: 3, steer: 0.95 }),
      makeOffTrackEvent({ speed: 4, steer: -0.9 }),
      makeOffTrackEvent({ speed: 4, steer: 0.85 }),
    ]
    const out = suggestContinuousTuningTweaks(input)
    const ids = out.map((s) => s.id)
    expect(ids).toContain('dullLowSpeedSteer')
    const top = out.find((s) => s.id === 'dullLowSpeedSteer')!
    expect(top.delta.steerRateLow).toBeLessThan(0)
    // The opposite-pair suppression should keep "turn faster" out when the
    // softer pick scores higher.
    expect(ids).not.toContain('turnFasterLowSpeed')
  })

  it('detects swervy / oscillating low-speed driving from the position trace', () => {
    const input = baseInput()
    // Build a synthetic low-speed path that snakes side to side at 33 ms
    // cadence. Each sample steps forward 0.3 units and to alternating
    // sides so the cross-product sign flips on every other sample.
    const positions: Array<[number, number]> = []
    const speeds: number[] = []
    for (let i = 0; i < 200; i += 1) {
      const sideways = i % 2 === 0 ? 0.25 : -0.25
      positions.push([i * 0.3, sideways])
      speeds.push(2)
    }
    input.telemetry = {
      sampleMs: 33,
      positions,
      speeds,
      lapTimeMs: speeds.length * 33,
      offTrackEvents: [],
    }
    input.offTrackEvents = []
    const out = suggestContinuousTuningTweaks(input)
    expect(out.some((s) => s.id === 'dullLowSpeedSteer')).toBe(true)
  })

  it('does not flag a clean low-speed corner as swervy', () => {
    const input = baseInput()
    // Quarter circle at low speed: steady left turn, no direction
    // reversals.
    const positions: Array<[number, number]> = []
    const speeds: number[] = []
    const radius = 8
    for (let i = 0; i < 200; i += 1) {
      const t = (i / 200) * (Math.PI / 2)
      positions.push([radius * Math.sin(t), radius * (1 - Math.cos(t))])
      speeds.push(3)
    }
    input.telemetry = {
      sampleMs: 33,
      positions,
      speeds,
      lapTimeMs: speeds.length * 33,
      offTrackEvents: [],
    }
    input.offTrackEvents = []
    const out = suggestContinuousTuningTweaks(input)
    expect(out.some((s) => s.id === 'dullLowSpeedSteer')).toBe(false)
  })

  it('flags modest-steer high-speed off-track entries with sharper high-speed steering and a lower cap', () => {
    const input = baseInput()
    const fast = input.params.maxSpeed * 0.85
    input.offTrackEvents = [
      makeOffTrackEvent({ speed: fast, steer: 0.3 }),
      makeOffTrackEvent({ speed: fast, steer: -0.4 }),
    ]
    const out = suggestContinuousTuningTweaks(input)
    const ids = out.map((s) => s.id)
    expect(ids).toContain('sharperHighSpeedSteer')
    // Both the lower-cap and stronger-brakes options should also be in the
    // pool (top 3); ordering depends on score.
    expect(ids).toContain('lowerTopSpeed')
  })

  it('flags full-lock high-speed off-track entries with calmer high-speed steering', () => {
    const input = baseInput()
    const fast = input.params.maxSpeed * 0.85
    input.offTrackEvents = [
      makeOffTrackEvent({ speed: fast, steer: 0.95 }),
      makeOffTrackEvent({ speed: fast, steer: -0.9 }),
    ]
    const out = suggestContinuousTuningTweaks(input)
    const ids = out.map((s) => s.id)
    expect(ids).toContain('dullHighSpeedSteer')
    const dull = out.find((s) => s.id === 'dullHighSpeedSteer')!
    expect(dull.delta.steerRateHigh).toBeLessThan(0)
    expect(ids).not.toContain('sharperHighSpeedSteer')
  })

  it('detects swervy / oscillating high-speed driving from the position trace, no off-track required', () => {
    const input = baseInput()
    // High-speed sawtooth: 0.8 u forward per sample, lateral flips sign
    // every sample. Consecutive velocity vectors are (0.8, +0.3) then
    // (0.8, -0.3), so every sample produces a sign flip well above the
    // 0.025 normalised-cross deadband.
    const positions: Array<[number, number]> = []
    const speeds: number[] = []
    for (let i = 0; i < 200; i += 1) {
      const sideways = i % 2 === 0 ? 0.15 : -0.15
      positions.push([i * 0.8, sideways])
      speeds.push(input.params.maxSpeed * 0.85)
    }
    input.telemetry = {
      sampleMs: 33,
      positions,
      speeds,
      lapTimeMs: speeds.length * 33,
      offTrackEvents: [],
    }
    input.offTrackEvents = []
    const out = suggestContinuousTuningTweaks(input)
    expect(out.some((s) => s.id === 'dullHighSpeedSteer')).toBe(true)
  })

  it('does not flag a clean high-speed straight as swervy', () => {
    const input = baseInput()
    const positions: Array<[number, number]> = []
    const speeds: number[] = []
    for (let i = 0; i < 200; i += 1) {
      positions.push([i * 0.8, 0])
      speeds.push(input.params.maxSpeed * 0.92)
    }
    input.telemetry = {
      sampleMs: 33,
      positions,
      speeds,
      lapTimeMs: speeds.length * 33,
      offTrackEvents: [],
    }
    input.offTrackEvents = []
    const out = suggestContinuousTuningTweaks(input)
    expect(out.some((s) => s.id === 'dullHighSpeedSteer')).toBe(false)
  })

  it('proposes faster pickup when the player never came close to the top end', () => {
    const input = baseInput()
    input.telemetry = makeTelemetry(
      Array.from({ length: 200 }, () => input.params.maxSpeed * 0.4),
    )
    const out = suggestContinuousTuningTweaks(input)
    expect(out.some((s) => s.id === 'fasterPickup')).toBe(true)
  })

  it('proposes a higher top speed when the player sat near the cap for most of the lap', () => {
    const input = baseInput()
    // Default base already runs at 92% top; bump it firmly above 95% so the
    // top-share threshold trips.
    input.telemetry = makeTelemetry(
      Array.from({ length: 200 }, () => input.params.maxSpeed * 0.98),
    )
    input.offTrackEvents = []
    const out = suggestContinuousTuningTweaks(input)
    expect(out.some((s) => s.id === 'higherTopSpeed')).toBe(true)
  })

  it('does not suggest raising top speed if the player was also flying off at speed', () => {
    const input = baseInput()
    input.telemetry = makeTelemetry(
      Array.from({ length: 200 }, () => input.params.maxSpeed * 0.98),
    )
    input.offTrackEvents = [
      makeOffTrackEvent({ speed: input.params.maxSpeed * 0.85 }),
    ]
    const out = suggestContinuousTuningTweaks(input)
    expect(out.some((s) => s.id === 'higherTopSpeed')).toBe(false)
  })

  it('flags long off-track durations with off-track recovery options', () => {
    const input = baseInput()
    input.offTrackEvents = [
      makeOffTrackEvent({ durationMs: 2500, speed: 5 }),
      makeOffTrackEvent({ durationMs: 2200, speed: 5 }),
    ]
    const out = suggestContinuousTuningTweaks(input)
    expect(out.some((s) => s.id === 'fasterOffTrackRecovery')).toBe(true)
  })

  it('flags frequent off-track excursions with a softer penalty', () => {
    const input = baseInput()
    input.offTrackEvents = [
      makeOffTrackEvent({ speed: 6 }),
      makeOffTrackEvent({ speed: 6 }),
      makeOffTrackEvent({ speed: 6 }),
      makeOffTrackEvent({ speed: 6 }),
    ]
    const out = suggestContinuousTuningTweaks(input)
    expect(out.some((s) => s.id === 'softerOffTrackPenalty')).toBe(true)
  })

  it('returns at most CONTINUOUS_TUNING_MAX_SUGGESTIONS picks sorted by score', () => {
    const input = baseInput()
    const fast = input.params.maxSpeed * 0.85
    input.telemetry = makeTelemetry(
      Array.from({ length: 200 }, () => input.params.maxSpeed * 0.4),
    )
    input.offTrackEvents = [
      makeOffTrackEvent({ speed: 3 }),
      makeOffTrackEvent({ speed: 4 }),
      makeOffTrackEvent({ speed: fast }),
      makeOffTrackEvent({ speed: fast, durationMs: 2500 }),
      makeOffTrackEvent({ speed: 4 }),
    ]
    const out = suggestContinuousTuningTweaks(input)
    expect(out.length).toBeLessThanOrEqual(CONTINUOUS_TUNING_MAX_SUGGESTIONS)
    for (let i = 1; i < out.length; i += 1) {
      expect(out[i - 1].score).toBeGreaterThanOrEqual(out[i].score)
    }
  })

  it('omits suggestions whose delta would be a clamped no-op', () => {
    const input = baseInput()
    // Pin maxSpeed at the floor of its range. The "lower top speed" pick
    // should be dropped from the high-speed off-track family.
    input.params.maxSpeed = TUNING_BOUNDS.maxSpeed.min
    input.telemetry = makeTelemetry(
      Array.from({ length: 200 }, () => input.params.maxSpeed * 0.9),
    )
    input.offTrackEvents = [
      makeOffTrackEvent({ speed: input.params.maxSpeed * 0.85 }),
    ]
    const out = suggestContinuousTuningTweaks(input)
    expect(out.some((s) => s.id === 'lowerTopSpeed')).toBe(false)
  })

  it('handles a lap with no telemetry by relying on off-track events alone', () => {
    const input: ContinuousSuggestionInput = {
      params: cloneDefaultParams(),
      lapTimeMs: null,
      offTrackEvents: [makeOffTrackEvent({ speed: 4 })],
      telemetry: null,
    }
    const out = suggestContinuousTuningTweaks(input)
    expect(out.some((s) => s.id === 'turnFasterLowSpeed')).toBe(true)
  })
})

describe('applyContinuousSuggestion', () => {
  it('adds the delta to each named key and clamps the result', () => {
    const params = cloneDefaultParams()
    const next = applyContinuousSuggestion(params, {
      maxSpeed: 4,
      steerRateLow: -0.3,
    })
    expect(next.maxSpeed).toBeCloseTo(DEFAULT_CAR_PARAMS.maxSpeed + 4, 5)
    expect(next.steerRateLow).toBeCloseTo(DEFAULT_CAR_PARAMS.steerRateLow - 0.3, 5)
    // Untouched fields are unchanged.
    expect(next.brake).toBe(DEFAULT_CAR_PARAMS.brake)
  })

  it('clamps to the param bounds when the delta would overshoot', () => {
    const params = cloneDefaultParams()
    const huge = TUNING_BOUNDS.maxSpeed.max + 100
    const next = applyContinuousSuggestion(params, { maxSpeed: huge })
    expect(next.maxSpeed).toBe(TUNING_BOUNDS.maxSpeed.max)
  })
})
