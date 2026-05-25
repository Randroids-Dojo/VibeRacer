/**
 * World Tour AI driver tick. Ported from VibeGear2's `ai.ts` and
 * adapted for VibeRacer's `PhysicsInput` shape and 3D track frame.
 * One archetype today (`clean_line`); per-archetype variation is a
 * known followup.
 *
 * The function is pure: never mutates inputs, returns a fresh state and a
 * fresh `PhysicsInput`. The deterministic mistake/brilliant decorators
 * draw from the per-AI `seed` channel so the same `(seed, inputs)` pair
 * always reproduces the same output, satisfying the World Tour plan's
 * "deterministic replay across the full race" rule.
 *
 * The track is consumed through a narrow `AiTrackView` interface so this
 * module can be exercised in unit tests without compiling a real
 * VibeRacer track. The tour route builds a real curvature-aware
 * `AiTrackView` from the rendered track's `WorldTourRail` via
 * `buildAiTrackView` (`src/game/worldTourTrackView.ts`); tests still
 * construct flat-straight views directly.
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
   * Heading-error gain (1/rad). Multiplied by the AI's current heading
   * delta to the centerline heading to produce a steer contribution
   * that keeps the car aligned with the road frame on a curving rail.
   * Only used when the track view exposes `centerlineAt`. Tuned so a
   * 0.3 rad (17 degree) misalignment saturates the heading term so
   * the lateral term still has authority near the apex.
   */
  HEADING_GAIN: 3,
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
  // Arc length along the rail in meters. Used by the centerline /
  // curve lookup so the AI knows where it is on the track. The
  // tour route can initialise this to a negative-wrapped value
  // (`totalLength - startBack`) to stagger AI cars behind the start
  // line on the closing chord; it does NOT track "how far the car
  // has raced," which is what `racedDistance` is for.
  progress: number
  // Distance the AI has actually driven since race-go in meters.
  // Starts at 0 in every fresh session and accumulates `speed * dt`
  // each tick regardless of where `progress` is on the rail. Drives
  // the launch-hold blend and the follow-distance gate so a car
  // initialised near the rail seam does not skip its launch window.
  racedDistance: number
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
  racedDistance: 0,
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
 * Narrow track-frame view. The AI reads:
 * - the centerline x at the AI's progress (used by the legacy
 *   straight-track P controller and by tests that only exercise the
 *   curve / brake math);
 * - the authored curve at the AI's progress, in [-1, 1] where positive
 *   means the road bends to the right (matching VibeRacer's piece-set
 *   convention);
 * - optionally the full centerline pose at the AI's progress. When
 *   present the AI computes lateral error in the track frame (so the
 *   controller stays correct as the rail rotates through east / west
 *   bearings) and adds a heading-tracking term to the steer signal.
 *   `buildAiTrackView` (`src/game/worldTourTrackView.ts`) provides this
 *   over a real rail; unit tests can leave it undefined and fall back
 *   to the world-x P controller for a straight track.
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
  // Optional full centerline pose. When provided, the AI tick uses
  // track-local lateral error and heading tracking instead of the
  // world-x P controller. heading follows the rail-sample convention
  // (0 = +X east, increasing CCW).
  centerlineAt?(progress: number): { x: number; z: number; heading: number }
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
 * Launch lane hold scalar. Returns 0 at race-go (full lane hold) and
 * 1 once the car has driven `LAUNCH_LANE_HOLD_M` meters since the
 * green flag. Reads `racedDistance` from the AI state so a car that
 * was initialised at an arbitrary rail position (the tour route
 * staggers AI on the closing chord) still gets a real launch window.
 */
export function launchBlend(racedDistance: number): number {
  if (racedDistance <= 0) return 0
  if (racedDistance >= AI_TUNING.LAUNCH_LANE_HOLD_M) return 1
  return racedDistance / AI_TUNING.LAUNCH_LANE_HOLD_M
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
    // gives a stable answer even on a curved track. Heading convention
    // matches `physics.ts` and the rail-sampling helpers: 0 means
    // facing +X (east); forward is `(cos h, -sin h)`.
    const dx = o.x - ai.x
    const dz = o.z - ai.z
    const fwdX = Math.cos(ai.heading)
    const fwdZ = -Math.sin(ai.heading)
    const forward = dx * fwdX + dz * fwdZ
    if (forward <= 0) continue
    if (forward > AI_TUNING.FOLLOW_DISTANCE_METERS) continue
    // Lateral offset: the component perpendicular to forward (right of
    // travel = (sin h, cos h) per the rail extrusion convention).
    const sideX = Math.sin(ai.heading)
    const sideZ = Math.cos(ai.heading)
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
  // Integrate progress from the car's speed. `progress` is the arc
  // length along the rail; it can be wrapped by `centerlineAt`. The
  // race-session reducer can initialise it anywhere on the loop, so
  // we also track a separate `racedDistance` channel that always
  // starts at 0 and accumulates `speed * dt` since race-go. The
  // launch-hold blend reads `racedDistance` so a car that spawned
  // mid-rail still gets the launch ease-in.
  const forwardDelta = Math.max(0, car.speed) * dt
  const nextProgress = state.progress + car.speed * dt
  const nextRacedDistance = state.racedDistance + forwardDelta

  if (!racing) {
    return {
      input: { throttle: 0, steer: 0, handbrake: false },
      nextAiState: {
        ...state,
        progress: nextProgress,
        racedDistance: nextRacedDistance,
        targetSpeed: 0,
        laneTarget: car.x,
      },
    }
  }

  const blend = launchBlend(state.racedDistance)
  const curve = track.curveAt(state.progress)
  const laneBias = racingLineOffset(curve, blend)

  // Steering controller. Two modes share the lane-target math:
  //
  // - Track-local (`centerlineAt` available, real rail): compute the
  //   lateral error in the track's right-of-travel frame so the
  //   controller stays correct as the rail rotates through east /
  //   west bearings. Add a heading-tracking term so the AI follows
  //   the rail through long sweeps without over-shooting.
  // - World-x (legacy, used by tests with a flat-straight view): the
  //   centerline is parameterized only by x, so lateral error is the
  //   raw (target x - car x) like the original VibeGear2 port.
  let steer: number
  let centerX: number
  let laneTarget: number
  const pose = track.centerlineAt?.(state.progress)
  if (pose) {
    // Right-of-travel perpendicular matches the rail extrusion
    // convention used by `sampleRailAt`: (sin h, cos h) points to the
    // right of the direction of travel.
    const sideX = Math.sin(pose.heading)
    const sideZ = Math.cos(pose.heading)
    const offX = car.x - pose.x
    const offZ = car.z - pose.z
    const lateralFromCenter = offX * sideX + offZ * sideZ
    // Racing-line target offset relative to the centerline. During the
    // launch window we collapse the bias to 0 and let the car hold the
    // lateral position it spawned at (the launch-hold mechanic from
    // VibeGear2). Outside the launch we pull onto the racing line.
    const heldLateral = lateralFromCenter
    const racingLineTargetLateral = laneBias
    const targetLateral =
      racingLineTargetLateral * blend + heldLateral * (1 - blend)
    const lateralError = targetLateral - lateralFromCenter
    // Heading error: positive means we need to rotate CCW (which is a
    // positive steer in this codebase's convention).
    let headingError = pose.heading - car.heading
    if (headingError > Math.PI) headingError -= 2 * Math.PI
    if (headingError < -Math.PI) headingError += 2 * Math.PI
    const lateralTerm = -lateralError / AI_TUNING.STEER_GAIN
    const headingTerm = AI_TUNING.HEADING_GAIN * headingError
    steer = clamp(lateralTerm + headingTerm, -1, 1)
    centerX = pose.x
    laneTarget = pose.x + targetLateral * sideX + 0 * sideZ
  } else {
    // Legacy world-x P controller. Used by tests with a flat-straight
    // track view; the real tour route always supplies `centerlineAt`.
    centerX = track.centerXAt(state.progress)
    const racingLineTargetX = centerX + laneBias
    const heldLaneTargetX = car.x
    const targetX = racingLineTargetX * blend + heldLaneTargetX * (1 - blend)
    const lateralError = targetX - car.x
    steer = clamp(-lateralError / AI_TUNING.STEER_GAIN, -1, 1)
    laneTarget = targetX
  }

  // Target speed: curve-aware, then capped by any close same-lane
  // leader inside the follow window. Skip the follow-distance cap
  // during the launch window so the field can spread off the grid
  // instead of every car cap-following a stationary leader at speed 0
  // (which deadlocks the entire field) or accelerating into a slow
  // launch and accruing contact damage.
  let target = targetSpeedAt(track, stats, state.progress)
  if (blend >= 1) {
    const cap = followDistanceCap(car, context.others)
    if (cap !== null && cap < target) target = cap
  }

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
  // controller naturally recovers in most cases. Uses the same
  // track-local frame as the main controller when available so the
  // recovery push is in the right direction on a rotated rail.
  if (pose) {
    const sideX = Math.sin(pose.heading)
    const sideZ = Math.cos(pose.heading)
    const offCenter = (car.x - pose.x) * sideX + (car.z - pose.z) * sideZ
    if (Math.abs(offCenter) > halfWidth) {
      steer = clamp(-offCenter / AI_TUNING.STEER_GAIN, -1, 1)
    }
  } else if (Math.abs(car.x - centerX) > halfWidth) {
    steer = clamp(-(car.x - centerX) / AI_TUNING.STEER_GAIN, -1, 1)
  }

  return {
    input: { throttle, steer, handbrake: false },
    nextAiState: {
      ...state,
      progress: nextProgress,
      racedDistance: nextRacedDistance,
      targetSpeed: target,
      laneTarget,
    },
  }
}
