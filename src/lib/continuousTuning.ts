import type { CarParams } from '@/game/physics'
import type { LapTelemetry, OffTrackEvent } from '@/game/offTrackEvents'
import {
  TUNING_BOUNDS,
  TUNING_PARAM_META,
  clampParams,
} from './tuningSettings'

// Pure heuristic engine for the continuous-tuning lap mode. After every lap
// the player completes, this module looks at the lap's telemetry (off-track
// events plus the per-sample speed trace) and proposes up to a few small
// param tweaks the player can choose between. The session never asks for a
// Likert rating in this path; the suggestions are derived from how the player
// actually drove the lap.
//
// All values returned are absolute deltas to add to the current CarParams.
// `applyContinuousSuggestion` handles the add + clamp, so callers never have
// to think about TUNING_BOUNDS directly.

export interface ContinuousSuggestionInput {
  params: CarParams
  lapTimeMs: number | null
  offTrackEvents: OffTrackEvent[]
  telemetry: LapTelemetry | null
}

export interface ContinuousSuggestion {
  // Stable identifier so the UI can key list items and so an upstream caller
  // can de-duplicate identical recommendations across laps if it wants to.
  id: string
  title: string
  reason: string
  delta: Partial<Record<keyof CarParams, number>>
  // Higher score = more confident the heuristic should fire. The output list
  // is sorted by score descending.
  score: number
}

// Public default. Three picks plus the implicit "no change" / "end session"
// CTAs keeps the freeze panel scannable.
export const CONTINUOUS_TUNING_MAX_SUGGESTIONS = 3

// Bumped step size (vs the Likert recommender's 12% gradient): each pick is
// one explicit player choice per lap, so making the nudge land somewhere
// noticeable matters more than tiny-step convergence.
const DEFAULT_STEP_FRACTION = 0.08

// --- helpers ---------------------------------------------------------------

function pctOfRange(key: keyof CarParams, pct: number): number {
  const b = TUNING_BOUNDS[key]
  return (b.max - b.min) * pct
}

function safeMaxSpeed(params: CarParams): number {
  // Used as the denominator for "share of lap near top speed" and as the
  // reference for "low / high speed off-track entry" thresholds. Never zero
  // because TUNING_BOUNDS.maxSpeed.min is well above zero, but cheap to
  // guard against a bad import that somehow slipped through.
  return Math.max(1, params.maxSpeed)
}

function speedStats(telemetry: LapTelemetry | null, maxSpeed: number) {
  const speeds = telemetry?.speeds ?? []
  if (speeds.length === 0) {
    return {
      count: 0,
      avg: 0,
      peak: 0,
      slowShare: 0,
      topShare: 0,
      crawlShare: 0,
    }
  }
  let sum = 0
  let peak = 0
  let slowSamples = 0
  let topSamples = 0
  let crawlSamples = 0
  for (const s of speeds) {
    sum += s
    if (s > peak) peak = s
    if (s < maxSpeed * 0.3) slowSamples += 1
    if (s < maxSpeed * 0.1) crawlSamples += 1
    if (s >= maxSpeed * 0.95) topSamples += 1
  }
  return {
    count: speeds.length,
    avg: sum / speeds.length,
    peak,
    slowShare: slowSamples / speeds.length,
    topShare: topSamples / speeds.length,
    crawlShare: crawlSamples / speeds.length,
  }
}

// --- heuristics ------------------------------------------------------------

function lowSpeedOffTrack(
  input: ContinuousSuggestionInput,
): ContinuousSuggestion[] {
  const maxSpeed = safeMaxSpeed(input.params)
  const lowEvents = input.offTrackEvents.filter(
    (e) => Math.abs(e.speed) < maxSpeed * 0.55,
  )
  if (lowEvents.length < 1) return []
  const score = 1 + lowEvents.length * 0.6
  const out: ContinuousSuggestion[] = [
    {
      id: 'turnFasterLowSpeed',
      title: 'Turn faster at slow speeds',
      reason:
        lowEvents.length === 1
          ? 'You went off-track once at low speed. A sharper low-speed steer rate helps tight turns bite.'
          : `You went off-track ${lowEvents.length}x at low speed. A sharper low-speed steer rate helps tight turns bite.`,
      delta: {
        steerRateLow: pctOfRange('steerRateLow', DEFAULT_STEP_FRACTION),
      },
      score,
    },
  ]
  // Only suggest dropping the steering deadband if the player isn't already
  // at the floor. Otherwise the pick would be a no-op after clamp.
  if (input.params.minSpeedForSteering > TUNING_BOUNDS.minSpeedForSteering.min + 0.05) {
    out.push({
      id: 'lowerMinSteerSpeed',
      title: 'Steering responds at lower speeds',
      reason:
        'Off-track entries at crawl speeds often happen because the front wheels stop responding before the turn finishes.',
      delta: {
        minSpeedForSteering: -pctOfRange(
          'minSpeedForSteering',
          DEFAULT_STEP_FRACTION,
        ),
      },
      score: score * 0.8,
    })
  }
  return out
}

function highSpeedOffTrack(
  input: ContinuousSuggestionInput,
): ContinuousSuggestion[] {
  const maxSpeed = safeMaxSpeed(input.params)
  const highEvents = input.offTrackEvents.filter(
    (e) => Math.abs(e.speed) >= maxSpeed * 0.7,
  )
  if (highEvents.length < 1) return []
  const score = 1 + highEvents.length * 0.7
  return [
    {
      id: 'sharperHighSpeedSteer',
      title: 'Sharper steering at top speed',
      reason:
        highEvents.length === 1
          ? 'You went off-track at near-top speed. A snappier high-speed steer rate gives you more turn-in.'
          : `You went off-track ${highEvents.length}x at near-top speed. A snappier high-speed steer rate gives you more turn-in.`,
      delta: {
        steerRateHigh: pctOfRange('steerRateHigh', DEFAULT_STEP_FRACTION),
      },
      score,
    },
    {
      id: 'lowerTopSpeed',
      title: 'Lower the top speed',
      reason:
        'If you keep getting punished for arriving at corners too hot, a slightly lower cap trades straight-line speed for control.',
      delta: { maxSpeed: -pctOfRange('maxSpeed', DEFAULT_STEP_FRACTION) },
      score: score * 0.75,
    },
    {
      id: 'strongerBrakes',
      title: 'Stronger brakes',
      reason:
        'More stopping power lets you carry top-end speed longer before the braking zone.',
      delta: { brake: pctOfRange('brake', DEFAULT_STEP_FRACTION) },
      score: score * 0.6,
    },
  ]
}

function neverReachedTopSpeed(
  input: ContinuousSuggestionInput,
): ContinuousSuggestion[] {
  const maxSpeed = safeMaxSpeed(input.params)
  const stats = speedStats(input.telemetry, maxSpeed)
  if (stats.count === 0) return []
  // Only fire when the peak sample is well below the configured cap AND the
  // top-speed share is essentially zero. Avoids stepping on the
  // already-at-top heuristic when the track really is straight-line limited.
  if (stats.peak >= maxSpeed * 0.85) return []
  if (stats.topShare > 0.02) return []
  // Strength = how far the peak fell short of the cap.
  const shortfall = (maxSpeed - stats.peak) / maxSpeed
  const score = 0.5 + shortfall * 2
  const out: ContinuousSuggestion[] = [
    {
      id: 'fasterPickup',
      title: 'Faster pickup off the line',
      reason:
        'You never reached top speed this lap. More acceleration helps you climb out of corners.',
      delta: { accel: pctOfRange('accel', DEFAULT_STEP_FRACTION) },
      score,
    },
  ]
  if (input.params.rollingFriction > TUNING_BOUNDS.rollingFriction.min + 0.5) {
    out.push({
      id: 'lessRollingFriction',
      title: 'Coast longer between throttle blips',
      reason:
        'Lower rolling friction lets the car carry speed through sections where you let off.',
      delta: {
        rollingFriction: -pctOfRange('rollingFriction', DEFAULT_STEP_FRACTION),
      },
      score: score * 0.7,
    })
  }
  return out
}

function alwaysAtTopSpeed(
  input: ContinuousSuggestionInput,
): ContinuousSuggestion[] {
  const maxSpeed = safeMaxSpeed(input.params)
  const stats = speedStats(input.telemetry, maxSpeed)
  if (stats.count === 0) return []
  if (stats.topShare < 0.25) return []
  // Don't pile on if the player is already crashing at high speed.
  const highEvents = input.offTrackEvents.filter(
    (e) => Math.abs(e.speed) >= maxSpeed * 0.7,
  )
  if (highEvents.length > 0) return []
  const score = 0.5 + stats.topShare * 1.5
  return [
    {
      id: 'higherTopSpeed',
      title: 'Higher top speed',
      reason: `You held top speed for ${Math.round(stats.topShare * 100)}% of the lap. More cap = more straight-line gain.`,
      delta: { maxSpeed: pctOfRange('maxSpeed', DEFAULT_STEP_FRACTION) },
      score,
    },
  ]
}

function longOffTrackExcursions(
  input: ContinuousSuggestionInput,
): ContinuousSuggestion[] {
  if (input.offTrackEvents.length === 0) return []
  const totalOffMs = input.offTrackEvents.reduce(
    (sum, e) => sum + e.durationMs,
    0,
  )
  const avgOff = totalOffMs / input.offTrackEvents.length
  if (avgOff < 1200) return []
  const score = 0.8 + Math.min(2, avgOff / 1500)
  const out: ContinuousSuggestion[] = [
    {
      id: 'fasterOffTrackRecovery',
      title: 'Recover from off-track faster',
      reason:
        'You spent a long time stuck off-track. Raising the off-track speed cap helps you rejoin the racing line quicker.',
      delta: {
        offTrackMaxSpeed: pctOfRange('offTrackMaxSpeed', DEFAULT_STEP_FRACTION),
      },
      score,
    },
  ]
  if (input.params.offTrackDrag > TUNING_BOUNDS.offTrackDrag.min + 1) {
    out.push({
      id: 'lessOffTrackDrag',
      title: 'Less off-track drag',
      reason:
        'Less off-track drag means the car bogs down less when you cut a corner.',
      delta: {
        offTrackDrag: -pctOfRange('offTrackDrag', DEFAULT_STEP_FRACTION),
      },
      score: score * 0.8,
    })
  }
  return out
}

function frequentOffTracks(
  input: ContinuousSuggestionInput,
): ContinuousSuggestion[] {
  if (input.offTrackEvents.length < 3) return []
  const score = 0.5 + input.offTrackEvents.length * 0.3
  return [
    {
      id: 'softerOffTrackPenalty',
      title: 'Softer off-track penalty',
      reason: `You went off-track ${input.offTrackEvents.length}x this lap. A softer penalty keeps the lap flowing while you learn the line.`,
      delta: {
        offTrackMaxSpeed:
          pctOfRange('offTrackMaxSpeed', DEFAULT_STEP_FRACTION) * 0.75,
        offTrackDrag:
          -pctOfRange('offTrackDrag', DEFAULT_STEP_FRACTION) * 0.75,
      },
      score,
    },
  ]
}

function crawlGuard(
  input: ContinuousSuggestionInput,
): ContinuousSuggestion[] {
  const maxSpeed = safeMaxSpeed(input.params)
  const stats = speedStats(input.telemetry, maxSpeed)
  if (stats.count === 0) return []
  // Player spent a lot of the lap near a standstill: probably catching
  // themselves on understeer, hairpins, or the track edge. Boost low-speed
  // turning so they don't have to crawl through every twist.
  if (stats.crawlShare < 0.12) return []
  const score = 0.4 + stats.crawlShare * 2
  return [
    {
      id: 'tighterLowSpeedSteer',
      title: 'Tighter low-speed steering',
      reason: `You were nearly stopped for ${Math.round(stats.crawlShare * 100)}% of the lap. A sharper low-speed steer rate cuts how slow you have to go to make the turn.`,
      delta: {
        steerRateLow: pctOfRange('steerRateLow', DEFAULT_STEP_FRACTION) * 0.75,
      },
      score,
    },
  ]
}

// --- assembly --------------------------------------------------------------

const HEURISTICS = [
  lowSpeedOffTrack,
  highSpeedOffTrack,
  neverReachedTopSpeed,
  alwaysAtTopSpeed,
  longOffTrackExcursions,
  frequentOffTracks,
  crawlGuard,
] as const

export function suggestContinuousTuningTweaks(
  input: ContinuousSuggestionInput,
  maxResults: number = CONTINUOUS_TUNING_MAX_SUGGESTIONS,
): ContinuousSuggestion[] {
  const pool: ContinuousSuggestion[] = []
  for (const h of HEURISTICS) pool.push(...h(input))
  // Dedupe by id, keeping the highest-scoring instance of each. Multiple
  // heuristics can in principle propose the same id (none do today, but the
  // dedup keeps the contract simple for future additions).
  const byId = new Map<string, ContinuousSuggestion>()
  for (const s of pool) {
    const prev = byId.get(s.id)
    if (!prev || s.score > prev.score) byId.set(s.id, s)
  }
  // Drop suggestions whose delta would be a clamped no-op against the
  // current params. Avoids showing a "lower top speed" pick when the player
  // already sits at the minimum bound.
  const meaningful: ContinuousSuggestion[] = []
  for (const s of byId.values()) {
    if (deltaWouldMove(input.params, s.delta)) meaningful.push(s)
  }
  meaningful.sort((a, b) => b.score - a.score)
  return meaningful.slice(0, Math.max(0, maxResults))
}

function deltaWouldMove(
  params: CarParams,
  delta: Partial<Record<keyof CarParams, number>>,
): boolean {
  const next = applyContinuousSuggestion(params, delta)
  for (const m of TUNING_PARAM_META) {
    if (Math.abs(next[m.key] - params[m.key]) > 1e-9) return true
  }
  return false
}

export function applyContinuousSuggestion(
  params: CarParams,
  delta: Partial<Record<keyof CarParams, number>>,
): CarParams {
  const next: CarParams = { ...params }
  for (const key of Object.keys(delta) as (keyof CarParams)[]) {
    const d = delta[key]
    if (typeof d === 'number' && Number.isFinite(d)) {
      next[key] = next[key] + d
    }
  }
  return clampParams(next)
}
