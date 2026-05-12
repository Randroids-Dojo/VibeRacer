/**
 * World Tour AI driver tick. Ported from VibeGear2's `ai.ts` and adapted
 * for VibeRacer's `PhysicsInput` shape and 3D track frame. One archetype
 * for the MVP: `clean_line`. Per-archetype variation lands in a follow-up
 * once the four-car race loop is shipped.
 *
 * The function is pure: never mutates inputs, returns a fresh state and a
 * fresh `PhysicsInput`. The deterministic mistake/brilliant decorators
 * draw from the per-AI `seed` channel so the same `(seed, inputs)` pair
 * always reproduces the same output, satisfying the World Tour plan's
 * "deterministic replay across the full race" rule.
 *
 * The track is consumed through a narrow `AiTrackView` interface so this
 * module can be exercised in unit tests without compiling a real
 * VibeRacer track. The Phase 1a `worldTourRaceSession` will wire a real
 * `AiTrackView` over the existing `trackPath` helpers.
 *
 * Constants are tuned for VibeRacer's `stepPhysics` units (meters and
 * meters per second). Steer convention follows `playerInput.ts`:
 * positive steer turns left.
 */

import type { PhysicsInput } from './physics'

// Default track width is mirrored from `trackWidth.ts`; we keep a local
// constant here so the AI module can be exercised against a synthetic
// track view in tests without importing the renderer.
const ROAD_HALF_WIDTH_DEFAULT = 4

/**
 * Tunable constants for the clean_line archetype. Names mirror the
 * VibeGear2 constants so a future reader can compare the two
 * implementations without re-deriving the semantics.
 */
export const AI_TUNING = Object.freeze({
  /**
   * Max lateral offset for the racing-line approximation, in meters.
   * The AI biases toward the inside of curves up to this distance from
   * the centerline. Capped at 70 percent of the road half-width so the
   * AI keeps a small margin to the rumble.
   */
  MAX_RACING_LINE_OFFSET: ROAD_HALF_WIDTH_DEFAULT * 0.7,
  /**
   * Curve-driven deceleration coefficient. A unit-curvature corner cuts
   * the AI's target speed by this fraction before the per-driver scalar
   * is applied.
   */
  CLEAN_LINE_CURVE_DECEL: 0.6,
  /**
   * Floor on the AI target speed (m/s). Prevents pathological corners
   * from forcing the AI to a complete stop, which would look broken.
   */
  MIN_AI_SPEED: 8,
  /**
   * Distance (m) over which the AI blends from "hold spawn lane" to
   * "pursue racing line." Without this hold, every AI immediately steers
   * toward the centerline-anchored racing line and the field collides
   * into a pile-up before the first lap develops. Linear blend from 0 m
   * (full lane hold) to LAUNCH_LANE_HOLD_M (full racing line).
   */
  LAUNCH_LANE_HOLD_M: 200,
  /**
   * Speed-error band (m/s) around the target where the AI cruises.
   * Inside this band the AI feathers the throttle proportional to the
   * error sign, eliminating high-frequency bang-bang oscillation.
   */
  SPEED_HYSTERESIS: 1.5,
  /**
   * Speed overshoot (m/s) at which the AI applies full brake. Below
   * this the brake ramps linearly with the overshoot.
   */
  BRAKE_RAMP: 6,
  /**
   * Lateral error (m) at which the AI applies full steer. Inside this
   * band the steer input ramps linearly. A P controller is sufficient
   * for the clean_line archetype.
   */
  STEER_GAIN: 1.5,
  /**
   * Longitudinal range (m) where a same-lane leader triggers the
   * follow-distance throttle cap. Inside this window the trailing AI
   * targets the leader's speed instead of its own top, so the contact
   * band (CAR_LENGTH ~ 4 m) stays empty.
   */
  FOLLOW_DISTANCE_METERS: 14,
  /**
   * Lateral threshold (m) for same-lane follow-distance detection. A
   * peer counts as a leader when its |dx| is below this value. Slightly
   * wider than the car width so the throttle cap engages just before
   * lateral contact rather than the moment a car drifts in.
   */
  FOLLOW_LANE_THRESHOLD_METERS: 2.4,
  /**
   * Margin (m/s) the trailing AI keeps below the leader's speed inside
   * the follow window.
   */
  FOLLOW_SPEED_BUFFER_M_PER_S: 1,
})

/**
 * Per-AI runtime state. Carried across ticks so the seed and the racing-
 * line intent persist. The race-session reducer owns one of these per AI
 * slot and threads it back through `tickAi` every frame.
 */
export interface AiState {
  // Total forward distance traveled, in meters. Used by the launch lane
  // hold blend and by future telemetry overlays. The race-session
  // reducer increments this each tick from the per-car physics step.
  progress: number
  // Per-AI deterministic PRNG channel for mistakes / brilliant moments.
  // The clean_line archetype does not currently draw from it but the
  // field is present so future archetypes do not need a state-shape
  // bump.
  seed: number
  // The most recent computed target speed (m/s). Useful for telemetry
  // overlays so the renderer can show "AI 2 wants 38 m/s" alongside
  // its actual speed.
  targetSpeed: number
  // The most recent computed lateral target (m, signed). Useful for
  // visualizing the racing line.
  laneTarget: number
}

export const INITIAL_AI_STATE: Readonly<AiState> = Object.freeze({
  progress: 0,
  seed: 1,
  targetSpeed: 0,
  laneTarget: 0,
})

/**
 * Position view of the player or another AI on the field. Kept narrow
 * so tests do not need a full physics state.
 */
export interface AiCarView {
  // World x in meters.
  x: number
  // World z in meters.
  z: number
  // Heading in radians. The clean_line archetype reads this only to
  // resolve the AI's forward axis when projecting a leader into the
  // same-lane band.
  heading: number
  // Current speed in m/s.
  speed: number
}

/**
 * Stats the AI consumes about its own chassis. Mirrors the `CarParams`
 * fields the AI actually reads. The race-session resolves the player
 * and AI stats from the championship car-spec table.
 */
export interface AiCarStats {
  // Top speed in m/s. The AI never targets a speed above this.
  topSpeed: number
}

/**
 * Narrow track-frame view. The AI reads only:
 * - the centerline x at the AI's progress (so the lane error can be
 *   computed in world coordinates without a full track compile);
 * - the authored curve at the AI's progress, in [-1, 1] where positive
 *   means the road bends to the right (matching VibeRacer's piece-set
 *   convention).
 *
 * The Phase 1a integration builds this from the existing
 * `trackPath`/`orderedPieces` helpers. Tests construct it directly.
 */
export interface AiTrackView {
  // Centerline world x (m) at the AI's progress. The AI steers toward
  // this plus a racing-line bias.
  centerXAt(progress: number): number
  // Authored curve (-1..1) at the AI's progress. Positive bends right.
  curveAt(progress: number): number
  // Optional road half-width override (m). Defaults to
  // ROAD_HALF_WIDTH_DEFAULT.
  roadHalfWidth?: number
}

export interface AiTickContext {
  // Other cars on the field (player plus AI peers). Used for the
  // follow-distance throttle cap.
  others: ReadonlyArray<AiCarView>
  // Time step in seconds. The clean_line archetype only uses this to
  // integrate `progress` from the speed.
  dt: number
  // Optional "racing" flag. When false (countdown, finished), the AI
  // returns neutral input. Defaults to true so simple test scenarios
  // do not have to pass it.
  racing?: boolean
}

export interface AiTickResult {
  input: PhysicsInput
  nextAiState: AiState
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

/**
 * Launch lane hold scalar. Returns 0 at the start of the lap (full lane
 * hold) and 1 past `LAUNCH_LANE_HOLD_M` (full racing line). A linear
 * blend is enough; the race-session reducer applies this directly to
 * the racing-line offset before computing the steer.
 */
export function launchBlend(progress: number): number {
  if (progress <= 0) return 0
  if (progress >= AI_TUNING.LAUNCH_LANE_HOLD_M) return 1
  return progress / AI_TUNING.LAUNCH_LANE_HOLD_M
}

/**
 * Find the closest "same lane" leader within `FOLLOW_DISTANCE_METERS`
 * ahead of `ai`. Returns the leader's speed (capped by
 * `FOLLOW_SPEED_BUFFER_M_PER_S`) when one is found, or `null` when no
 * peer is inside the window. Lateral distance uses the world-frame x
 * offset; the AI is assumed to run roughly parallel to the world z axis
 * inside the launch hold and along the centerline tangent thereafter.
 */
export function followDistanceCap(
  ai: AiCarView,
  others: ReadonlyArray<AiCarView>,
): number | null {
  let closest: AiCarView | null = null
  let closestDz = Infinity
  for (const o of others) {
    // Project the leader into the AI's forward axis. The clean_line
    // archetype only needs a rough "is this peer ahead of me along the
    // current heading" test; the dot product with the forward axis
    // gives a stable answer even on a curved track.
    const dx = o.x - ai.x
    const dz = o.z - ai.z
    const fwdX = -Math.sin(ai.heading)
    const fwdZ = -Math.cos(ai.heading)
    const forward = dx * fwdX + dz * fwdZ
    if (forward <= 0) continue
    if (forward > AI_TUNING.FOLLOW_DISTANCE_METERS) continue
    // Lateral offset: the component perpendicular to forward.
    const sideX = -fwdZ
    const sideZ = fwdX
    const side = Math.abs(dx * sideX + dz * sideZ)
    if (side > AI_TUNING.FOLLOW_LANE_THRESHOLD_METERS) continue
    if (forward < closestDz) {
      closestDz = forward
      closest = o
    }
  }
  if (closest === null) return null
  return Math.max(0, closest.speed - AI_TUNING.FOLLOW_SPEED_BUFFER_M_PER_S)
}

/**
 * Target speed at the AI's current progress. Floors at `MIN_AI_SPEED`,
 * scales by curve magnitude, and clamps to chassis `topSpeed`.
 */
export function targetSpeedAt(
  track: AiTrackView,
  stats: AiCarStats,
  progress: number,
): number {
  const curve = track.curveAt(progress)
  const decel = Math.abs(curve) * AI_TUNING.CLEAN_LINE_CURVE_DECEL
  const target = stats.topSpeed * (1 - decel)
  if (!Number.isFinite(target)) return AI_TUNING.MIN_AI_SPEED
  return Math.max(AI_TUNING.MIN_AI_SPEED, Math.min(stats.topSpeed, target))
}

/**
 * Racing-line lateral target relative to the centerline. Positive moves
 * the AI to the +x side of the centerline. Scaled by the launch-hold
 * blend so the AI does not jump toward the racing line off the grid.
 */
export function racingLineOffset(
  curve: number,
  blend: number,
): number {
  // VibeRacer convention: positive curve bends right; the racing line
  // bias is on the inside of the corner, which is the side toward which
  // the curve points. We bias the AI toward the inside by the same
  // sign as the curve.
  return curve * AI_TUNING.MAX_RACING_LINE_OFFSET * blend
}

/**
 * Single AI tick. Returns the next state and the `PhysicsInput` the
 * race-session reducer should hand to `stepPhysics` for this car.
 *
 * When `context.racing` is false the function returns a neutral input
 * (throttle 0, steer 0, no handbrake) but still advances the state's
 * `progress` integration from the car's current speed so the launch
 * hold blend is correct on the first racing tick.
 */
export function tickAi(
  state: Readonly<AiState>,
  car: Readonly<AiCarView>,
  stats: Readonly<AiCarStats>,
  track: Readonly<AiTrackView>,
  context: Readonly<AiTickContext>,
): AiTickResult {
  const racing = context.racing !== false
  const halfWidth = track.roadHalfWidth ?? ROAD_HALF_WIDTH_DEFAULT
  const dt = Math.max(0, context.dt)
  // Integrate progress from the car's speed. This is approximate for a
  // curved track but is sufficient for the launch-hold blend.
  const nextProgress = Math.max(0, state.progress + car.speed * dt)

  if (!racing) {
    return {
      input: { throttle: 0, steer: 0, handbrake: false },
      nextAiState: {
        ...state,
        progress: nextProgress,
        targetSpeed: 0,
        laneTarget: car.x,
      },
    }
  }

  const blend = launchBlend(state.progress)
  const curve = track.curveAt(state.progress)
  const centerX = track.centerXAt(state.progress)
  // Lateral target: the centerline plus the racing-line bias. During
  // the launch hold the bias collapses to zero, so the AI continues to
  // hold its spawn lane.
  const laneBias = racingLineOffset(curve, blend)
  // The lane target is the centerline plus the racing-line bias plus
  // the spawn-lane hold during the launch window: outside the window we
  // pull all the way to the racing line; inside we keep the car at its
  // current x. We blend the two so the transition is smooth.
  const racingLineTargetX = centerX + laneBias
  const heldLaneTargetX = car.x
  const targetX = racingLineTargetX * blend + heldLaneTargetX * (1 - blend)
  const lateralError = targetX - car.x
  // Positive steer turns left (matches `playerInput.ts`). World x grows
  // to the right, so a positive `lateralError` (target to the right of
  // the AI) needs a NEGATIVE steer.
  let steer = clamp(-lateralError / AI_TUNING.STEER_GAIN, -1, 1)

  // Target speed: curve-aware, then capped by any close same-lane
  // leader inside the follow window.
  let target = targetSpeedAt(track, stats, state.progress)
  const cap = followDistanceCap(car, context.others)
  if (cap !== null && cap < target) target = cap

  // Throttle / brake controller. Positive throttle accelerates; the
  // PhysicsInput shape uses a signed `throttle` with negative for
  // brake.
  const speedError = car.speed - target
  let throttle: number
  if (Math.abs(speedError) <= AI_TUNING.SPEED_HYSTERESIS) {
    throttle = -speedError / AI_TUNING.SPEED_HYSTERESIS
  } else if (speedError < 0) {
    throttle = 1
  } else {
    throttle = -Math.min(1, speedError / AI_TUNING.BRAKE_RAMP)
  }
  throttle = clamp(throttle, -1, 1)

  // Defensive: if the AI is fully outside the road, pull harder back
  // toward center to avoid an off-track DNF spiral. This is a minimal
  // safety net the clean_line archetype keeps even though the P
  // controller naturally recovers in most cases.
  if (Math.abs(car.x - centerX) > halfWidth) {
    steer = clamp(-(car.x - centerX) / AI_TUNING.STEER_GAIN, -1, 1)
  }

  return {
    input: { throttle, steer, handbrake: false },
    nextAiState: {
      ...state,
      progress: nextProgress,
      targetSpeed: target,
      laneTarget: targetX,
    },
  }
}
