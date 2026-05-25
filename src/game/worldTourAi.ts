/**
 * World Tour AI driver tick. Pure-pursuit controller: every tick the
 * AI projects its world position onto the rail to find its true arc
 * length, picks a "carrot" point `lookAhead` meters further along the
 * rail (with a small lateral bias for the racing line), then emits a
 * steer signal proportional to the heading error between the car's
 * current heading and the direction to the carrot. The carrot is
 * always forward in arc length, so even a car bumped wide off the
 * rail has a target it can naturally converge on. Throttle is a
 * separate loop that picks a target speed from the upcoming
 * curvature, capped by a same-lane follow distance.
 *
 * This replaces an earlier two-term controller (lateral-error P +
 * heading-error P, both clamp-saturated) that locked into full steer
 * whenever the track frame had a heading discontinuity at the rail
 * seam. Pure pursuit has a single saturated term and the carrot is
 * continuous across seam crossings, so the seam is no longer a
 * special case.
 *
 * The function is pure: never mutates inputs, returns a fresh state
 * and a fresh `PhysicsInput`. The deterministic seed channel is
 * preserved for future archetype variation.
 *
 * Constants are tuned for VibeRacer's `stepPhysics` units (meters and
 * meters per second). Steer convention follows `playerInput.ts`:
 * positive steer turns left (heading increases counterclockwise).
 * Heading convention matches `physics.ts` and the rail-sampling
 * helpers: 0 means facing +X (east); forward is `(cos h, -sin h)`.
 */

import type { PhysicsInput } from './physics'

// Default track width is mirrored from `trackWidth.ts`; we keep a local
// constant here so the AI module can be exercised against a synthetic
// track view in tests without importing the renderer.
const ROAD_HALF_WIDTH_DEFAULT = 4

/**
 * Tunable constants for the clean_line archetype. Per-archetype
 * variation is a known followup; for now every AI driver uses these.
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
   * Distance (m) the car has actually driven since race-go over which
   * the racing-line bias blends from 0 (hold spawn lane) to 1 (full
   * racing line). Without this hold every AI immediately steers
   * toward the centerline-anchored racing line and the field collides
   * into a pile-up before the first lap develops. The launch hold
   * reads the AI's `racedDistance` channel so a car initialised at
   * any arbitrary rail position still gets a clean launch window.
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
   * Pure-pursuit look-ahead time in seconds. The carrot is placed
   * `speed * LOOK_AHEAD_SECONDS` meters ahead on the rail, clamped to
   * `[MIN_LOOK_AHEAD_M, MAX_LOOK_AHEAD_M]`. Larger values produce
   * smoother lines and earlier braking; smaller values turn sharper
   * but oscillate near tight corners.
   */
  LOOK_AHEAD_SECONDS: 0.7,
  /**
   * Floor on look-ahead distance (m). Even at zero speed the carrot
   * sits at least this far ahead so a car at rest still has a
   * target to face when leaving the grid.
   */
  MIN_LOOK_AHEAD_M: 4,
  /**
   * Ceiling on look-ahead distance (m). Capping prevents the carrot
   * from leaping past the next corner entry on a long straight, which
   * would make the AI under-brake into the corner.
   */
  MAX_LOOK_AHEAD_M: 20,
  /**
   * Heading error (rad) at which the steer signal saturates to +/-1.
   * Errors smaller than this scale linearly. About 0.4 rad (23 deg)
   * keeps the steering responsive without hair-trigger oscillation
   * on a clean racing line.
   */
  STEER_HALF_ANGLE: 0.4,
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
  /**
   * Lateral distance from the rail (as a multiple of the road half-
   * width) above which the AI brakes to MIN_AI_SPEED so the chassis
   * has the steer authority to make the wider recovery arc back to
   * the rail. A ratio of 1.5 means recovery kicks in once the car
   * drifts about 1.5 road-widths off (6 m at the default track
   * width of 8 m), past where the racing line could plausibly
   * recover at full speed.
   */
  RECOVERY_OFF_TRACK_RATIO: 1.5,
  /**
   * Extra look-ahead meters added per meter of lateral distance from
   * the rail. Pure pursuit's turn radius is roughly
   * `lookAhead^2 / (2 * crossTrackError)`; without this boost the
   * radius collapses when the car is off-line and the AI traces a
   * tight circle instead of returning. A boost of 0.5 is enough at
   * the recovery brake speed (8 m/s, steerRate 2.2 rad/s, min radius
   * 3.6 m) to keep the requested turn radius above what the chassis
   * can deliver; larger boosts wash out the next corner on tight
   * loops because the carrot ends up past the corner entry.
   */
  LATERAL_LOOK_AHEAD_BOOST: 0.5,
})

/**
 * Per-AI runtime state. The pure-pursuit controller does not need to
 * remember its rail progress between ticks (it re-derives that from
 * the car's world position via `projectToRail`), so the state is
 * intentionally minimal: a deterministic seed channel, the distance
 * raced since race-go (drives the launch-hold blend), and a few
 * read-only telemetry fields the renderer can use to draw the
 * carrot or surface "AI target speed" overlays.
 */
export interface AiState {
  // Per-AI deterministic PRNG channel. Used by future archetypes for
  // mistakes / brilliant moments; the clean_line archetype does not
  // currently draw from it, but the field is present so future
  // archetypes do not require a state-shape bump.
  seed: number
  // Distance the AI has actually driven since race-go in meters.
  // Starts at 0 in every fresh session and accumulates `speed * dt`
  // each tick regardless of where the car is on the rail. Drives the
  // launch-hold blend so a car initialised at an arbitrary rail
  // position still eases onto the racing line over the first
  // `LAUNCH_LANE_HOLD_M` meters.
  racedDistance: number
  // Last projection result, supplied back to `projectToRail` as a hint
  // on the next tick so the search window narrows to a few samples
  // instead of scanning the whole rail.
  lastArcHint: number
  // Telemetry only.
  targetSpeed: number
  carrotX: number
  carrotZ: number
}

export const INITIAL_AI_STATE: Readonly<AiState> = Object.freeze({
  seed: 1,
  racedDistance: 0,
  lastArcHint: 0,
  targetSpeed: 0,
  carrotX: 0,
  carrotZ: 0,
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
 * Narrow track-frame view for the AI. The pure-pursuit controller
 * reads three things:
 *
 *   `projectToRail(x, z, hint)`  - closest arc length on the rail
 *   `sampleAt(arc, lateral)`     - world pose at arc length, with a
 *                                  lateral offset to the right of travel
 *   `curveAt(arc)`               - signed curve in [-1, 1] for braking
 *
 * `buildAiTrackView` (`src/game/worldTourTrackView.ts`) implements
 * this over a real `WorldTourRail`. Tests can stub any subset with a
 * synthetic flat-straight view; the controller falls back to a stub
 * where features are missing (e.g., `projectToRail` may be absent on
 * a flat-straight unit-test view, in which case the controller uses
 * `lastArcHint` directly).
 */
export interface AiTrackView {
  // Total rail length (m). Carrot arc-lengths are taken modulo this
  // value inside `sampleAt`.
  totalLength: number
  // Closest arc length on the rail to a world `(x, z)`. The `hint`
  // is the previous tick's projection, used to constrain the search
  // window for cost. Optional: synthetic stubs may omit it.
  projectToRail?(x: number, z: number, hint: number): number
  // World pose on the rail at `arcLength`, shifted by `lateral`
  // meters to the right of travel. Internally wraps `arcLength` to
  // [0, totalLength).
  sampleAt(arcLength: number, lateral: number): {
    x: number
    z: number
    heading: number
  }
  // Signed curve at `arcLength`, in [-1, 1]. Positive bends right.
  curveAt(arcLength: number): number
  // Optional road half-width override (m). Defaults to
  // ROAD_HALF_WIDTH_DEFAULT.
  roadHalfWidth?: number
}

export interface AiTickContext {
  // Other cars on the field (player plus AI peers). Used for the
  // follow-distance throttle cap.
  others: ReadonlyArray<AiCarView>
  // Time step in seconds. The controller only uses this to integrate
  // `racedDistance` from the car's speed.
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
 * peer is inside the window.
 */
export function followDistanceCap(
  ai: AiCarView,
  others: ReadonlyArray<AiCarView>,
): number | null {
  let closest: AiCarView | null = null
  let closestDz = Infinity
  for (const o of others) {
    // Project the leader into the AI's forward axis. Heading convention
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
 * Target speed at a given arc length on the rail. Floors at
 * `MIN_AI_SPEED`, scales by curve magnitude, and clamps to chassis
 * `topSpeed`. Pure-pursuit uses this on the carrot's arc length so
 * the AI brakes for the corner it is approaching, not the corner it
 * is currently in.
 */
export function targetSpeedAt(
  track: AiTrackView,
  stats: AiCarStats,
  arcLength: number,
): number {
  const curve = track.curveAt(arcLength)
  const decel = Math.abs(curve) * AI_TUNING.CLEAN_LINE_CURVE_DECEL
  const target = stats.topSpeed * (1 - decel)
  if (!Number.isFinite(target)) return AI_TUNING.MIN_AI_SPEED
  return Math.max(AI_TUNING.MIN_AI_SPEED, Math.min(stats.topSpeed, target))
}

/**
 * Racing-line lateral target relative to the centerline. Positive
 * moves the AI to the right of travel. Scaled by the launch-hold
 * blend so the AI does not jump toward the racing line off the grid.
 */
export function racingLineOffset(curve: number, blend: number): number {
  // VibeRacer convention: positive curve bends right; the racing line
  // bias is on the inside of the corner, which is the side toward which
  // the curve points. We bias the AI toward the inside by the same
  // sign as the curve.
  return curve * AI_TUNING.MAX_RACING_LINE_OFFSET * blend
}

/**
 * Single AI tick. Pure pursuit: project onto the rail, pick a carrot
 * point ahead, steer to face it.
 *
 * When `context.racing` is false the function returns neutral input
 * but still accumulates `racedDistance` so the launch-hold blend is
 * already at zero on the first racing tick.
 */
export function tickAi(
  state: Readonly<AiState>,
  car: Readonly<AiCarView>,
  stats: Readonly<AiCarStats>,
  track: Readonly<AiTrackView>,
  context: Readonly<AiTickContext>,
): AiTickResult {
  const racing = context.racing !== false
  const dt = Math.max(0, context.dt)
  const forwardDelta = Math.max(0, car.speed) * dt
  const nextRacedDistance = state.racedDistance + forwardDelta

  // Pure pursuit step 1: find the car's true arc length on the rail.
  // The hint constrains the search window; a missing projection
  // (unit-test stubs) falls back to the last hint so the controller
  // still has a usable arc length to work with.
  const arcLength =
    track.projectToRail?.(car.x, car.z, state.lastArcHint) ?? state.lastArcHint

  if (!racing) {
    // During countdown / after a finish, freeze steer + throttle but
    // still update telemetry so the next racing tick starts from a
    // sane hint.
    return {
      input: { throttle: 0, steer: 0, handbrake: false },
      nextAiState: {
        ...state,
        racedDistance: nextRacedDistance,
        lastArcHint: arcLength,
        targetSpeed: 0,
        carrotX: car.x,
        carrotZ: car.z,
      },
    }
  }

  // Step 2: pick a carrot point ahead on the rail. Look-ahead has
  // two contributions:
  //
  //   - A speed-scaled base term: faster car -> looks further ahead
  //     -> smoother lines. Clamped to a sane range so a stopped car
  //     still has a target and a top-speed car does not look past a
  //     corner entry.
  //   - A lateral-error boost: when the car is off-line, scale
  //     look-ahead UP by the lateral distance from the rail. Pure
  //     pursuit's geometric turn radius is roughly
  //     `lookAhead^2 / (2 * crossTrackError)`. With a fixed
  //     look-ahead and a large cross-track error, the steering
  //     radius collapses and the AI carves a tight circle off-line
  //     instead of returning to the rail. Boosting look-ahead with
  //     the lateral distance keeps the turn radius reasonable and
  //     the recovery path drivable.
  //
  // We DO still brake to MIN_AI_SPEED when significantly off-line so
  // the chassis has the steer authority to actually make the wider
  // arc; that part of the recovery branch is kept.
  const halfWidth = track.roadHalfWidth ?? ROAD_HALF_WIDTH_DEFAULT
  const projectedPose = track.sampleAt(arcLength, 0)
  const lateralFromRail = Math.hypot(
    car.x - projectedPose.x,
    car.z - projectedPose.z,
  )
  const recoveryThreshold = halfWidth * AI_TUNING.RECOVERY_OFF_TRACK_RATIO
  const recovering = lateralFromRail > recoveryThreshold
  const baseLookAhead = clamp(
    car.speed * AI_TUNING.LOOK_AHEAD_SECONDS,
    AI_TUNING.MIN_LOOK_AHEAD_M,
    AI_TUNING.MAX_LOOK_AHEAD_M,
  )
  const lookAhead =
    baseLookAhead + lateralFromRail * AI_TUNING.LATERAL_LOOK_AHEAD_BOOST
  const carrotArc = arcLength + lookAhead

  // Step 3: lateral racing-line bias at the carrot. Read the curve
  // AT the carrot (not at the car's current position) so the AI
  // pre-positions for the corner it is approaching. The launch-hold
  // blend keeps the bias at 0 for the first 200 m of raced distance
  // so the field spreads off the grid before chasing the racing line.
  // While recovering the bias also collapses to 0 (aim at centerline,
  // not racing line) so the car comes back to the road, not the
  // racing line.
  const blend = launchBlend(state.racedDistance)
  const upcomingCurve = track.curveAt(carrotArc)
  const lateral = recovering ? 0 : racingLineOffset(upcomingCurve, blend)
  const carrot = track.sampleAt(carrotArc, lateral)

  // Step 4: steer to face the carrot. The single saturated term
  // replaces the prior lateral-error + heading-error controllers; the
  // pure-pursuit geometry naturally damps as the car approaches the
  // carrot (heading error shrinks to zero), so no explicit lateral
  // term is needed.
  const dx = carrot.x - car.x
  const dz = carrot.z - car.z
  const angleToCarrot = Math.atan2(-dz, dx)
  let headingError = angleToCarrot - car.heading
  if (headingError > Math.PI) headingError -= 2 * Math.PI
  if (headingError < -Math.PI) headingError += 2 * Math.PI
  const steer = clamp(headingError / AI_TUNING.STEER_HALF_ANGLE, -1, 1)

  // Step 5: target speed. Recovering off-track? Brake to MIN_AI_SPEED
  // so the car can turn sharply enough to reach the rail without
  // doubling back on itself. Otherwise use the upcoming curvature,
  // capped by any close same-lane leader (after launch hold; during
  // launch every car is at speed 0 and the cap would deadlock the
  // field).
  let target = recovering
    ? AI_TUNING.MIN_AI_SPEED
    : targetSpeedAt(track, stats, carrotArc)
  if (!recovering && blend >= 1) {
    const cap = followDistanceCap(car, context.others)
    if (cap !== null && cap < target) target = cap
  }

  // Step 6: throttle / brake controller. Same shape as the original
  // VibeGear2 port: hysteresis band around the target, full throttle
  // when way below, ramped brake when way above.
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

  return {
    input: { throttle, steer, handbrake: false },
    nextAiState: {
      ...state,
      racedDistance: nextRacedDistance,
      lastArcHint: arcLength,
      targetSpeed: target,
      carrotX: carrot.x,
      carrotZ: carrot.z,
    },
  }
}
