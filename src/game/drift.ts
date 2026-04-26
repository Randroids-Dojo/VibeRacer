/**
 * Drift scoring helpers. All pure: no Web Audio, no Three.js, no DOM. The
 * race renderer feeds in per-frame inputs (speed, steer, on-track flag) and
 * the helpers maintain a multi-frame "drift session" that accumulates a score
 * while the player slides.
 *
 * What counts as a drift?
 *  - The car must be moving above DRIFT_MIN_SPEED.
 *  - Steering input must be above DRIFT_MIN_STEER (so trundling along a
 *    straight does not count).
 *  - Combined intensity = abs(steer) * speedRatio (similar to skidIntensity in
 *    `audio.ts`, intentionally so the visual + audio cues line up). When the
 *    combined intensity exceeds DRIFT_ENTER_INTENSITY a drift session begins.
 *
 * A drift session ends when:
 *  - The combined intensity drops below DRIFT_EXIT_INTENSITY for longer than
 *    DRIFT_GRACE_MS. This grace window lets the player feather steering
 *    through a combo without instantly resetting the multiplier.
 *  - The player goes off-track for longer than DRIFT_OFFTRACK_GRACE_MS. Brief
 *    excursions are forgiven so kissing the kerb does not zero the score.
 *  - The lap ends or the player teleports (handled in RaceCanvas).
 *
 * Score accrual: every active frame adds `intensity * speedRatio * dtMs * SCORE_PER_MS`
 * points, with a multiplier that grows with active duration (capped at
 * MAX_MULTIPLIER). Longer sustained drifts therefore reward exponentially
 * better than two short stabs of the wheel.
 */

export const DRIFT_MIN_SPEED = 4 // m/s. Below this the car is not really sliding.
export const DRIFT_MIN_STEER = 0.18 // [0, 1] absolute steering input.
export const DRIFT_ENTER_INTENSITY = 0.32
export const DRIFT_EXIT_INTENSITY = 0.18
export const DRIFT_GRACE_MS = 350
export const DRIFT_OFFTRACK_GRACE_MS = 600

export const SCORE_PER_MS = 0.02 // tuned so a clean 2s drift around a corner is ~80 points.
export const MAX_MULTIPLIER = 4
// At MULTIPLIER_GROWTH_MS active milliseconds the multiplier reaches MAX.
// Earlier the multiplier ramps linearly from 1.0 toward MAX_MULTIPLIER.
export const MULTIPLIER_GROWTH_MS = 4000

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0
  if (x < 0) return 0
  if (x > 1) return 1
  return x
}

// Same shape as the audio-side skidIntensity but tuned slightly higher (drifts
// should require a bit more lock-up than the SFX cue) and without the
// off-track baseline. Off-track behavior is handled by the session machine
// (see DRIFT_OFFTRACK_GRACE_MS) so the raw intensity stays a clean function of
// throttle / steer.
export function driftIntensity(
  speedAbs: number,
  maxSpeed: number,
  steerAbs: number,
): number {
  if (maxSpeed <= 0) return 0
  if (!Number.isFinite(speedAbs) || speedAbs < DRIFT_MIN_SPEED) return 0
  const steer = clamp01(Math.abs(steerAbs))
  if (steer < DRIFT_MIN_STEER) return 0
  const speedRatio = clamp01(speedAbs / maxSpeed)
  return clamp01(steer * speedRatio * 1.6)
}

export function driftMultiplier(activeMs: number): number {
  if (!Number.isFinite(activeMs) || activeMs <= 0) return 1
  const growth = (activeMs / MULTIPLIER_GROWTH_MS) * (MAX_MULTIPLIER - 1)
  return Math.min(MAX_MULTIPLIER, 1 + growth)
}

export interface DriftSessionState {
  // Whether a drift is currently being scored (i.e. above the enter threshold
  // OR within the grace window after dropping below exit threshold).
  active: boolean
  // Total active milliseconds in the current drift session. Accumulates only
  // while `active` is true; the grace window does not count toward duration
  // (the multiplier should not keep growing while the player is coasting).
  activeMs: number
  // Last frame's signed direction of travel * sign(steer). When the player
  // flicks the wheel the opposite way mid-session, the direction flips and we
  // award a transition bonus (see chainBonus). 0 = neutral.
  lastDirection: number
  // Milliseconds since intensity last exceeded the EXIT threshold. Used to
  // detect when the grace window expires.
  belowSinceMs: number
  // Milliseconds spent off-track in the current session. Resets to 0 each
  // frame the car returns on-track.
  offTrackMs: number
  // Score accumulated during this session.
  score: number
  // Number of direction-change transitions in this session (each transition
  // awards a CHAIN_BONUS at the moment it happens; the count is for HUD
  // display).
  chains: number
}

export function initDriftSession(): DriftSessionState {
  return {
    active: false,
    activeMs: 0,
    lastDirection: 0,
    belowSinceMs: 0,
    offTrackMs: 0,
    score: 0,
    chains: 0,
  }
}

export const CHAIN_BONUS = 25 // flat points awarded when the slide direction flips.

export interface DriftStepInput {
  intensity: number
  steerSigned: number
  speedAbs: number
  onTrack: boolean
  dtMs: number
}

export interface DriftStepResult {
  state: DriftSessionState
  // True if a session ended this frame. Caller can use this to stamp a
  // "last drift" toast or compare against the lap-best.
  ended: boolean
  // Score delta accrued this frame (so the HUD can pulse on big gains). 0
  // when the session is inactive.
  delta: number
}

// Single-frame transition. Pure: takes the previous session state and the
// per-frame inputs, returns the next state plus event flags. Caller (the rAF
// loop in RaceCanvas) decides what to do with `ended` (publish to React, push
// to lap-best, fire a toast).
export function stepDriftSession(
  prev: DriftSessionState,
  input: DriftStepInput,
): DriftStepResult {
  const state: DriftSessionState = {
    active: prev.active,
    activeMs: prev.activeMs,
    lastDirection: prev.lastDirection,
    belowSinceMs: prev.belowSinceMs,
    offTrackMs: prev.offTrackMs,
    score: prev.score,
    chains: prev.chains,
  }

  const dt = Math.max(0, Number.isFinite(input.dtMs) ? input.dtMs : 0)
  const intensity = clamp01(input.intensity)
  const aboveEnter = intensity >= DRIFT_ENTER_INTENSITY
  const aboveExit = intensity >= DRIFT_EXIT_INTENSITY

  // Off-track tracking. Brief kerb-kissing is forgiven; sustained off-track
  // ends the session even if the player is still drifting against the grass.
  if (input.onTrack) {
    state.offTrackMs = 0
  } else if (state.active) {
    state.offTrackMs += dt
  }

  if (state.active) {
    if (aboveExit && state.offTrackMs < DRIFT_OFFTRACK_GRACE_MS) {
      // Active drift, accruing score.
      state.belowSinceMs = 0
      state.activeMs += dt
      const dir =
        Math.sign(input.steerSigned) * Math.sign(input.speedAbs >= 0 ? 1 : -1)
      // Chain bonus on a direction flip during an active session. Only count
      // a flip when the new direction is non-zero AND opposite to the prior
      // (a steer-to-neutral mid-drift does not award a bonus, but neutral
      // back to opposite does).
      if (
        dir !== 0 &&
        state.lastDirection !== 0 &&
        Math.sign(dir) !== Math.sign(state.lastDirection)
      ) {
        state.score += CHAIN_BONUS
        state.chains += 1
      }
      if (dir !== 0) state.lastDirection = dir
      const mult = driftMultiplier(state.activeMs)
      const delta = intensity * SCORE_PER_MS * dt * mult
      state.score += delta
      return { state, ended: false, delta }
    }
    // Below exit OR off-track too long. Tick the grace window.
    state.belowSinceMs += dt
    if (
      state.belowSinceMs >= DRIFT_GRACE_MS ||
      state.offTrackMs >= DRIFT_OFFTRACK_GRACE_MS
    ) {
      // Session ends. Caller picks up the final score from the result; the
      // returned state is reset so the next frame starts fresh.
      const finished: DriftSessionState = initDriftSession()
      return { state: finished, ended: true, delta: 0 }
    }
    // Within grace: hold the active flag so a quick re-entry continues the
    // current session rather than starting a fresh one.
    return { state, ended: false, delta: 0 }
  }

  // Not active. Wait for the enter threshold.
  if (aboveEnter && input.onTrack) {
    state.active = true
    state.activeMs = dt
    state.belowSinceMs = 0
    state.offTrackMs = 0
    const dir =
      Math.sign(input.steerSigned) * Math.sign(input.speedAbs >= 0 ? 1 : -1)
    if (dir !== 0) state.lastDirection = dir
    const mult = driftMultiplier(state.activeMs)
    const delta = intensity * SCORE_PER_MS * dt * mult
    state.score += delta
    return { state, ended: false, delta }
  }
  return { state, ended: false, delta: 0 }
}

// Format a drift score for the HUD. Drift scores are integer points; the
// helper rounds defensively and pads short scores so the readout column does
// not jump width as the score grows.
export function formatDriftScore(score: number): string {
  if (!Number.isFinite(score) || score <= 0) return '0'
  return String(Math.round(score))
}
