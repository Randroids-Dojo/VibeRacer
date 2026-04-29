/**
 * Off-track event tracker and per-lap telemetry envelope. All pure: no Web
 * Audio, no Three.js, no DOM. The race renderer feeds in per-frame inputs
 * (onTrack flag, position, heading, speed, control inputs) and the helpers
 * detect each off-track excursion as a single event with an entry snapshot
 * and a return-to-track aggregate.
 *
 * What counts as an off-track event?
 *  - Each contiguous run of frames where `onTrack` is false counts as one
 *    excursion. The event is emitted on the falling edge (off-track to
 *    on-track) so the consumer always sees a complete record.
 *  - Sign convention: in this codebase the keyboard's `left` key maps to
 *    `steerInput = +1` and `right` to `-1` (see RaceCanvas line 834). The
 *    physics integrator rotates heading positive for left turns when moving
 *    forward. Consumers that label steering should treat positive as LEFT.
 *
 * The companion LapTelemetry type bundles per-position speed samples (one
 * value per replay sample, sampled at REPLAY_SAMPLE_MS) alongside all
 * off-track events captured during the same lap, so the survey screen gets
 * one envelope to render.
 */

import { z } from 'zod'

export interface OffTrackEntrySnapshot {
  /** Milliseconds into the current lap when the car crossed off the track. */
  lapMs: number
  x: number
  z: number
  /** Heading in radians at the moment of departure. */
  heading: number
  /** Signed speed in m/s. Negative values mean the car was reversing off. */
  speed: number
  /** Steering input in [-1, 1]. Positive = LEFT (see file docstring). */
  steer: number
  /** Throttle input in [-1, 1]. Negative is brake / reverse. */
  throttle: number
  handbrake: boolean
  /**
   * Distance from the centerline when the car first read off-track. Caller
   * passes the current piece distance, so this is a non-negative number that
   * is at least TRACK_WIDTH / 2 at the boundary itself.
   */
  distanceFromCenter: number
}

export interface OffTrackEvent extends OffTrackEntrySnapshot {
  /** Total milliseconds the car spent off the track in this excursion. */
  durationMs: number
  /** Maximum |speed| during the excursion. */
  peakSpeed: number
  /** Maximum distanceFromCenter during the excursion. */
  peakDistanceFromCenter: number
  /**
   * Lap milliseconds when the car returned to track, or null if the lap
   * ended (or the run aborted) while still off.
   */
  exitLapMs: number | null
}

export interface OffTrackTrackerState {
  active: boolean
  current: {
    entry: OffTrackEntrySnapshot
    peakSpeed: number
    peakDistance: number
    lastLapMs: number
  } | null
}

export function initOffTrackTracker(): OffTrackTrackerState {
  return { active: false, current: null }
}

export interface OffTrackStepInput {
  onTrack: boolean
  lapMs: number
  x: number
  z: number
  heading: number
  speed: number
  steer: number
  throttle: number
  handbrake: boolean
  distanceFromCenter: number
}

export interface OffTrackStepResult {
  state: OffTrackTrackerState
  /** Non-null on the falling edge (excursion completed this frame). */
  emitted: OffTrackEvent | null
}

function isFiniteNumber(n: number): boolean {
  return typeof n === 'number' && Number.isFinite(n)
}

function snapshotOf(input: OffTrackStepInput): OffTrackEntrySnapshot {
  return {
    lapMs: input.lapMs,
    x: input.x,
    z: input.z,
    heading: input.heading,
    speed: input.speed,
    steer: input.steer,
    throttle: input.throttle,
    handbrake: !!input.handbrake,
    distanceFromCenter: input.distanceFromCenter,
  }
}

/**
 * Single-frame transition. Pure: takes the previous tracker state and the
 * per-frame inputs, returns the next state plus an optional emitted event.
 * Consumers fire the event into a buffer; nothing here mutates the input.
 */
export function stepOffTrackTracker(
  prev: OffTrackTrackerState,
  input: OffTrackStepInput,
): OffTrackStepResult {
  // Defensive against non-finite inputs from a wonky physics frame. Treat
  // non-finite numerics as on-track noise so we never push phantom events
  // and never carry NaN into the aggregate. Mirrors drift.ts's clamp01 stance.
  if (
    !isFiniteNumber(input.lapMs) ||
    !isFiniteNumber(input.x) ||
    !isFiniteNumber(input.z) ||
    !isFiniteNumber(input.heading) ||
    !isFiniteNumber(input.speed) ||
    !isFiniteNumber(input.steer) ||
    !isFiniteNumber(input.throttle) ||
    !isFiniteNumber(input.distanceFromCenter)
  ) {
    return { state: prev, emitted: null }
  }

  if (input.onTrack) {
    if (prev.active && prev.current !== null) {
      const c = prev.current
      const event: OffTrackEvent = {
        ...c.entry,
        durationMs: Math.max(0, input.lapMs - c.entry.lapMs),
        peakSpeed: c.peakSpeed,
        peakDistanceFromCenter: c.peakDistance,
        exitLapMs: input.lapMs,
      }
      return { state: initOffTrackTracker(), emitted: event }
    }
    return { state: prev, emitted: null }
  }

  // Off-track frame.
  const speedAbs = Math.abs(input.speed)
  if (!prev.active) {
    const entry = snapshotOf(input)
    return {
      state: {
        active: true,
        current: {
          entry,
          peakSpeed: speedAbs,
          peakDistance: input.distanceFromCenter,
          lastLapMs: input.lapMs,
        },
      },
      emitted: null,
    }
  }

  const c = prev.current!
  const peakSpeed = speedAbs > c.peakSpeed ? speedAbs : c.peakSpeed
  const peakDistance =
    input.distanceFromCenter > c.peakDistance
      ? input.distanceFromCenter
      : c.peakDistance
  return {
    state: {
      active: true,
      current: {
        entry: c.entry,
        peakSpeed,
        peakDistance,
        lastLapMs: input.lapMs,
      },
    },
    emitted: null,
  }
}

/**
 * Force-close any in-flight excursion as a final event. Called by the rAF
 * loop on lap completion (and on full reset / abort) so an "off the track at
 * the line" case still surfaces in the per-lap buffer instead of being
 * silently discarded. Returns null when the tracker is idle.
 */
export function flushOffTrackTracker(
  prev: OffTrackTrackerState,
): OffTrackEvent | null {
  if (!prev.active || prev.current === null) return null
  const c = prev.current
  return {
    ...c.entry,
    durationMs: Math.max(0, c.lastLapMs - c.entry.lapMs),
    peakSpeed: c.peakSpeed,
    peakDistanceFromCenter: c.peakDistance,
    exitLapMs: null,
  }
}

export const OffTrackEntrySnapshotSchema = z.object({
  lapMs: z.number().finite(),
  x: z.number().finite(),
  z: z.number().finite(),
  heading: z.number().finite(),
  speed: z.number().finite(),
  steer: z.number().finite(),
  throttle: z.number().finite(),
  handbrake: z.boolean(),
  distanceFromCenter: z.number().finite(),
})

export const OffTrackEventSchema = OffTrackEntrySnapshotSchema.extend({
  durationMs: z.number().finite().nonnegative(),
  peakSpeed: z.number().finite().nonnegative(),
  peakDistanceFromCenter: z.number().finite().nonnegative(),
  exitLapMs: z.number().finite().nullable(),
})

/**
 * Per-lap telemetry envelope. `positions[i]` and `speeds[i]` correspond to
 * the same sample, taken at sample period `sampleMs`, so a consumer can map
 * any sample to time `i * sampleMs`.
 */
export interface LapTelemetry {
  sampleMs: number
  positions: Array<[number, number]>
  speeds: number[]
  lapTimeMs: number | null
  offTrackEvents: OffTrackEvent[]
}

export const LapTelemetrySchema = z
  .object({
    sampleMs: z.number().positive().finite(),
    positions: z.array(z.tuple([z.number().finite(), z.number().finite()])),
    speeds: z.array(z.number().finite().nonnegative()),
    lapTimeMs: z.number().int().positive().nullable(),
    offTrackEvents: z.array(OffTrackEventSchema),
  })
  .refine((t) => t.positions.length === t.speeds.length, {
    message: 'positions and speeds must be the same length',
  })
