// Haptic feedback for tactile confirmation. Two parallel paths:
//
// 1. Web Vibration API (`navigator.vibrate`) for touch devices (phones,
//    tablets). One-shot pulse patterns; silently no-ops on desktop.
// 2. Gamepad API rumble (`gamepad.vibrationActuator.playEffect("dual-rumble",
//    ...)`) for connected controllers. Both impulses (lap / PB / record /
//    offTrack / wrongWay / achievement) and a continuous physics-driven
//    rumble loop (engine purr, surface texture, slip / drift) so a 360 pad
//    feels Forza-lite during a race. Falls back to the legacy
//    `gamepad.hapticActuators[0].pulse(...)` array on browsers that have not
//    shipped `vibrationActuator` yet.
//
// Pure cosmetic; never affects physics or anti-cheat. Both paths are
// defensive and safe to call from any code path on any runtime.
//
// Outcomes:
//   - 'lap'      -> single short impulse on every completed lap.
//   - 'pb'       -> longer celebratory impulse on a fresh personal best.
//   - 'record'   -> heaviest impulse for a fresh track-wide record.
//   - 'offTrack' -> short tap on the on-track to off-track rising edge,
//                   paired with the existing audio off-track rumble cue.
//   - 'wrongWay' -> short warning chatter when the wrong-way banner appears.
//   - 'achievement' -> celebratory pop when an achievement unlocks.
//
// Patterns / effects are tuned so a fast circuit racer is not constantly
// buzzing, and impulses stay under a second so they overlap with (but do not
// outlive) the audio fanfare.

import { z } from 'zod'

export const HAPTIC_OUTCOMES = [
  'lap',
  'pb',
  'record',
  'offTrack',
  'wrongWay',
  'achievement',
] as const
export type HapticOutcome = (typeof HAPTIC_OUTCOMES)[number]

export function isHapticOutcome(value: unknown): value is HapticOutcome {
  return (
    typeof value === 'string' &&
    (HAPTIC_OUTCOMES as readonly string[]).includes(value)
  )
}

// ms-pattern compatible with navigator.vibrate. Even-indexed entries are
// vibrate durations; odd-indexed entries are pause durations between pulses.
// Total wall-clock cost (sum of every entry) is bounded so a long session
// never queues a runaway buzz.
export const HAPTIC_PATTERNS: Record<HapticOutcome, readonly number[]> = {
  lap: [40],
  pb: [60, 60, 120],
  record: [80, 60, 80, 60, 200],
  // offTrack is a momentary cue, not a celebration. A single short pulse so
  // the player feels the curb / grass without it competing with the audio
  // off-track rumble that fires on the same edge.
  offTrack: [55],
  // wrongWay is a warning cue rather than a reward, so it uses two small
  // pulses with a tight gap.
  wrongWay: [35, 25, 35],
  // achievement is brighter than a normal lap but still shorter than a PB.
  achievement: [45, 35, 90],
}

// Total budget so a future pattern tweak does not accidentally schedule a
// half-second buzz on every lap. Asserted in unit tests.
export const HAPTIC_PATTERN_MAX_MS = 1000

// Settings modes mirror the headlight / brakeLight pickers so the UI stays
// consistent: 'auto' fires only on touch devices (where the buzz is felt),
// 'on' always tries to fire, 'off' suppresses every call.
export const HAPTIC_MODES = ['off', 'auto', 'on'] as const
export type HapticMode = (typeof HAPTIC_MODES)[number]

export const DEFAULT_HAPTIC_MODE: HapticMode = 'auto'

export const HapticModeSchema = z.enum(HAPTIC_MODES)

export const HAPTIC_MODE_LABELS: Record<HapticMode, string> = {
  off: 'Off',
  auto: 'Auto (touch only)',
  on: 'Always on',
}

export const HAPTIC_MODE_DESCRIPTIONS: Record<HapticMode, string> = {
  off: 'Never buzz on lap events.',
  auto: 'Buzz only on touch devices when a lap finishes, PB, or record drops.',
  on: 'Buzz on every lap, PB, and record, even on desktop with a connected motor.',
}

export function isHapticMode(value: unknown): value is HapticMode {
  return (
    typeof value === 'string' &&
    (HAPTIC_MODES as readonly string[]).includes(value)
  )
}

// Pure resolver: given the player's mode pick and whether the runtime looks
// like a touch device, return whether a buzz should fire. Auto fires only on
// touch (the buzz is meaningless on a hardwired desktop). Off always
// suppresses. On always fires (so a desktop player with a buzzing controller
// can feel it too).
export function shouldHapticFire(mode: HapticMode, isTouch: boolean): boolean {
  if (mode === 'off') return false
  if (mode === 'on') return true
  return isTouch
}

// Returns a defensive copy so callers can mutate the array (or pass it to a
// browser API that mutates) without poisoning the constant table.
export function patternFor(outcome: HapticOutcome): number[] {
  const raw = HAPTIC_PATTERNS[outcome]
  return [...raw]
}

// Sum of every entry in the pattern. Used by tests to enforce
// HAPTIC_PATTERN_MAX_MS and by the runtime to avoid scheduling a no-op buzz
// (a zero-length pattern would just return false from navigator.vibrate).
export function patternTotalMs(pattern: readonly number[]): number {
  let total = 0
  for (const v of pattern) {
    if (!Number.isFinite(v) || v < 0) return 0
    total += v
  }
  return total
}

// Detect a touch-capable runtime. Mirrors the same media-query the touch
// pause-button styles use so the haptic decision matches the visual decision.
// SSR-safe: falls back to false when window or matchMedia is missing.
export function isTouchRuntime(): boolean {
  if (typeof window === 'undefined') return false
  try {
    if (typeof window.matchMedia === 'function') {
      const m = window.matchMedia('(any-pointer: coarse)')
      if (m && typeof m.matches === 'boolean') return m.matches
    }
  } catch {
    // matchMedia in some embedded webviews can throw; fall through.
  }
  // Fall back to maxTouchPoints: a phone always reports >= 1 even when the
  // matchMedia query is unavailable.
  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.maxTouchPoints === 'number'
  ) {
    return navigator.maxTouchPoints > 0
  }
  return false
}

// Schedule a buzz. Returns true when navigator.vibrate accepted the pattern,
// false otherwise (no vibration API, malformed pattern, or the browser
// rejected the call). Defensive against a hostile or browser-blocked
// navigator.vibrate so a runtime exception never bubbles into the lap-saved
// flow.
export function fireHaptic(outcome: HapticOutcome): boolean {
  if (!isHapticOutcome(outcome)) return false
  if (typeof navigator === 'undefined') return false
  const vibrate = (navigator as Navigator & { vibrate?: (p: number | number[]) => boolean }).vibrate
  if (typeof vibrate !== 'function') return false
  const pattern = patternFor(outcome)
  if (patternTotalMs(pattern) <= 0) return false
  try {
    return vibrate.call(navigator, pattern) === true
  } catch {
    return false
  }
}

// =====================================================================
// Gamepad rumble (Xbox 360 + every Standard Gamepad with motors).
// =====================================================================

// dual-rumble effect shape, matching the Web Gamepad API. `strongMagnitude`
// drives the low-frequency motor (left side on Xbox), `weakMagnitude` drives
// the high-frequency motor (right side). Both in [0, 1].
export interface DualRumbleEffect {
  duration: number
  strongMagnitude: number
  weakMagnitude: number
}

// Per-outcome impulse effects. Magnitudes mirror the audio escalation:
// lap < pb < record. offTrack is a separate axis (chassis / surface cue),
// so it sits outside the celebration ramp.
export const RUMBLE_EFFECTS: Record<HapticOutcome, DualRumbleEffect> = {
  lap: { duration: 80, strongMagnitude: 0.35, weakMagnitude: 0.55 },
  pb: { duration: 220, strongMagnitude: 0.65, weakMagnitude: 0.85 },
  record: { duration: 380, strongMagnitude: 0.85, weakMagnitude: 1.0 },
  offTrack: { duration: 90, strongMagnitude: 0.55, weakMagnitude: 0.3 },
  wrongWay: { duration: 130, strongMagnitude: 0.25, weakMagnitude: 0.75 },
  achievement: { duration: 180, strongMagnitude: 0.45, weakMagnitude: 0.9 },
}

// Per-effect duration cap. Keeps a future tweak from accidentally scheduling
// a half-second motor stall on every lap. Asserted in unit tests.
export const RUMBLE_EFFECT_MAX_MS = 600

// Per-frame continuous rumble call duration. Slightly longer than a 60 fps
// frame so a stuttered HUD frame does not leave an audible gap.
export const RUMBLE_FRAME_DURATION_MS = 100

// Below this delta, two consecutive continuous-rumble writes are treated as
// the same and the second is skipped. Avoids spamming playEffect 60x / sec
// during a steady-state straightaway.
export const RUMBLE_EPSILON = 0.02

export interface DualRumbleMagnitudes {
  strongMagnitude: number
  weakMagnitude: number
}

export interface GamepadRumbleIntensity {
  strong: number
  weak: number
}

export const GAMEPAD_RUMBLE_INTENSITY_MIN = 0
export const GAMEPAD_RUMBLE_INTENSITY_MAX = 1
export const DEFAULT_GAMEPAD_RUMBLE_INTENSITY: GamepadRumbleIntensity = {
  strong: 1,
  weak: 1,
}

export const GamepadRumbleIntensitySchema = z.object({
  strong: z
    .number()
    .min(GAMEPAD_RUMBLE_INTENSITY_MIN)
    .max(GAMEPAD_RUMBLE_INTENSITY_MAX),
  weak: z
    .number()
    .min(GAMEPAD_RUMBLE_INTENSITY_MIN)
    .max(GAMEPAD_RUMBLE_INTENSITY_MAX),
})

interface VibrationActuator {
  playEffect: (
    type: string,
    params: { duration: number; strongMagnitude: number; weakMagnitude: number; startDelay?: number },
  ) => Promise<string> | string
  reset?: () => Promise<string> | string
}

interface LegacyHapticActuator {
  pulse: (value: number, duration: number) => Promise<boolean> | boolean
}

interface RumblePad {
  vibrationActuator?: VibrationActuator
  hapticActuators?: ReadonlyArray<LegacyHapticActuator>
}

function asRumblePad(pad: Gamepad | null): RumblePad | null {
  if (!pad) return null
  return pad as unknown as RumblePad
}

// True when the supplied pad exposes either a `vibrationActuator` (modern
// Chromium dual-rumble path) or a non-empty `hapticActuators` array (legacy
// Firefox / WebKit `pulse` path). Exported so the per-frame rumble loop can
// resolve auto-mode capability against the live active pad without walking
// `navigator.getGamepads()` 60 fps.
export function padHasRumble(pad: Gamepad | null): boolean {
  const r = asRumblePad(pad)
  if (!r) return false
  if (r.vibrationActuator && typeof r.vibrationActuator.playEffect === 'function') return true
  if (r.hapticActuators && r.hapticActuators.length > 0) {
    const a = r.hapticActuators[0]
    if (a && typeof a.pulse === 'function') return true
  }
  return false
}

// SSR-safe: returns true when at least one connected gamepad exposes
// vibrationActuator or a non-empty hapticActuators array. Used by the
// 'auto' resolver so desktop with no controller stays silent.
export function hasRumbleCapableGamepad(): boolean {
  if (typeof navigator === 'undefined') return false
  const getter = (navigator as Navigator & { getGamepads?: () => (Gamepad | null)[] }).getGamepads
  if (typeof getter !== 'function') return false
  let pads: (Gamepad | null)[]
  try {
    pads = getter.call(navigator) ?? []
  } catch {
    return false
  }
  for (let i = 0; i < pads.length; i++) {
    const p = pads[i]
    if (p && p.connected && padHasRumble(p)) return true
  }
  return false
}

// Module-local cache of the last continuous-rumble magnitudes written to a
// pad. Keyed weakly so a disconnected pad gets garbage-collected. Used by
// setGamepadContinuousRumble to dedupe steady-state writes.
const lastContinuousMags: WeakMap<Gamepad, DualRumbleMagnitudes> = new WeakMap()

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0
  if (x < 0) return 0
  if (x > 1) return 1
  return x
}

function effectFor(outcome: HapticOutcome): DualRumbleEffect | null {
  if (!isHapticOutcome(outcome)) return null
  const e = RUMBLE_EFFECTS[outcome]
  if (!e) return null
  return {
    duration: e.duration,
    strongMagnitude: clamp01(e.strongMagnitude),
    weakMagnitude: clamp01(e.weakMagnitude),
  }
}

function normalizeIntensity(
  intensity?: GamepadRumbleIntensity,
): GamepadRumbleIntensity {
  return {
    strong: clamp01(
      intensity?.strong ?? DEFAULT_GAMEPAD_RUMBLE_INTENSITY.strong,
    ),
    weak: clamp01(intensity?.weak ?? DEFAULT_GAMEPAD_RUMBLE_INTENSITY.weak),
  }
}

export function scaleRumbleMagnitudes(
  mags: DualRumbleMagnitudes,
  intensity?: GamepadRumbleIntensity,
): DualRumbleMagnitudes {
  const scale = normalizeIntensity(intensity)
  return {
    strongMagnitude: clamp01(mags.strongMagnitude) * scale.strong,
    weakMagnitude: clamp01(mags.weakMagnitude) * scale.weak,
  }
}

function scaleRumbleEffect(
  effect: DualRumbleEffect,
  intensity?: GamepadRumbleIntensity,
): DualRumbleEffect {
  const scale = normalizeIntensity(intensity)
  return {
    duration: effect.duration,
    strongMagnitude: clamp01(effect.strongMagnitude) * scale.strong,
    weakMagnitude: clamp01(effect.weakMagnitude) * scale.weak,
  }
}

// Fire a one-shot impulse on the gamepad's motors. Returns true when the
// effect was scheduled (or a legacy pulse was queued); false on any failure.
// Defensive: null pad, missing actuator, thrown promise all return false.
export function fireGamepadImpulse(
  outcome: HapticOutcome,
  pad: Gamepad | null,
  intensity?: GamepadRumbleIntensity,
): boolean {
  const r = asRumblePad(pad)
  if (!r) return false
  const baseEffect = effectFor(outcome)
  if (!baseEffect || baseEffect.duration <= 0) return false
  const effect = scaleRumbleEffect(baseEffect, intensity)
  if (
    effect.strongMagnitude <= RUMBLE_EPSILON &&
    effect.weakMagnitude <= RUMBLE_EPSILON
  ) {
    return false
  }
  const actuator = r.vibrationActuator
  if (actuator && typeof actuator.playEffect === 'function') {
    try {
      const result = actuator.playEffect('dual-rumble', { ...effect })
      // playEffect returns a Promise<string> in the spec; some legacy
      // shims return a string directly. Either way we treat the call as
      // having succeeded if no exception was thrown. Swallow the promise
      // rejection to avoid leaking an unhandled rejection warning.
      if (result && typeof (result as Promise<string>).then === 'function') {
        ;(result as Promise<string>).catch(() => {})
      }
      return true
    } catch {
      // Fall through to the legacy hapticActuators[0].pulse(...) path. A
      // browser may expose vibrationActuator but throw at call time
      // (unsupported effect, runtime permission issue, hostile shim) while
      // still providing a working legacy actuator that can run the cue.
    }
  }
  const legacy = r.hapticActuators && r.hapticActuators[0]
  if (legacy && typeof legacy.pulse === 'function') {
    try {
      const result = legacy.pulse(effect.weakMagnitude, effect.duration)
      if (result && typeof (result as Promise<boolean>).then === 'function') {
        ;(result as Promise<boolean>).catch(() => {})
      }
      return true
    } catch {
      return false
    }
  }
  return false
}

// Write the current frame's continuous rumble magnitudes to the pad. Called
// every game-loop tick. No-ops when the magnitudes are within RUMBLE_EPSILON
// of the last write so a steady-state straightaway does not spam playEffect.
// Both-zero input routes through stopGamepadRumble() so the motor settles.
export function setGamepadContinuousRumble(
  pad: Gamepad | null,
  mags: DualRumbleMagnitudes,
  intensity?: GamepadRumbleIntensity,
): void {
  const r = asRumblePad(pad)
  if (!r || !pad) return
  const scaled = scaleRumbleMagnitudes(mags, intensity)
  const strong = clamp01(scaled.strongMagnitude)
  const weak = clamp01(scaled.weakMagnitude)
  const prev = lastContinuousMags.get(pad)
  if (strong <= RUMBLE_EPSILON && weak <= RUMBLE_EPSILON) {
    // Already stopped: skip the actuator call so a steady idle does not
    // ping reset() / playEffect(0) every frame.
    if (
      prev &&
      prev.strongMagnitude <= RUMBLE_EPSILON &&
      prev.weakMagnitude <= RUMBLE_EPSILON
    ) {
      return
    }
    stopGamepadRumble(pad)
    lastContinuousMags.set(pad, { strongMagnitude: 0, weakMagnitude: 0 })
    return
  }
  if (
    prev &&
    Math.abs(prev.strongMagnitude - strong) < RUMBLE_EPSILON &&
    Math.abs(prev.weakMagnitude - weak) < RUMBLE_EPSILON
  ) {
    return
  }
  const actuator = r.vibrationActuator
  if (actuator && typeof actuator.playEffect === 'function') {
    try {
      const result = actuator.playEffect('dual-rumble', {
        duration: RUMBLE_FRAME_DURATION_MS,
        strongMagnitude: strong,
        weakMagnitude: weak,
      })
      if (result && typeof (result as Promise<string>).then === 'function') {
        ;(result as Promise<string>).catch(() => {})
      }
      lastContinuousMags.set(pad, { strongMagnitude: strong, weakMagnitude: weak })
      return
    } catch {
      // Fall through to the legacy hapticActuators[0].pulse(...) path so a
      // browser that exposes vibrationActuator but throws at call time
      // (unsupported effect, runtime permission issue, hostile shim) still
      // gets a chance to drive the rumble through the legacy API. Matches
      // the fallthrough behavior in fireGamepadImpulse / stopGamepadRumble.
    }
  }
  // Legacy hapticActuators only takes a single magnitude. Use the louder of
  // the two so the player still feels the strongest channel.
  const legacy = r.hapticActuators && r.hapticActuators[0]
  if (legacy && typeof legacy.pulse === 'function') {
    try {
      const result = legacy.pulse(Math.max(strong, weak), RUMBLE_FRAME_DURATION_MS)
      if (result && typeof (result as Promise<boolean>).then === 'function') {
        ;(result as Promise<boolean>).catch(() => {})
      }
      lastContinuousMags.set(pad, { strongMagnitude: strong, weakMagnitude: weak })
    } catch {
      // ignore
    }
  }
}

// Stop any active rumble on the pad and clear cached magnitudes so the next
// setGamepadContinuousRumble write goes through. Called on pause / unmount /
// pad disconnect / mode flip to off.
export function stopGamepadRumble(pad: Gamepad | null): void {
  const r = asRumblePad(pad)
  if (!r || !pad) return
  lastContinuousMags.delete(pad)
  const actuator = r.vibrationActuator
  if (actuator && typeof actuator.reset === 'function') {
    try {
      const result = actuator.reset()
      if (result && typeof (result as Promise<string>).then === 'function') {
        ;(result as Promise<string>).catch(() => {})
      }
      return
    } catch {
      // fall through to zero-magnitude effect
    }
  }
  if (actuator && typeof actuator.playEffect === 'function') {
    try {
      const result = actuator.playEffect('dual-rumble', {
        duration: 0,
        strongMagnitude: 0,
        weakMagnitude: 0,
      })
      if (result && typeof (result as Promise<string>).then === 'function') {
        ;(result as Promise<string>).catch(() => {})
      }
      return
    } catch {
      // Fall through to the legacy hapticActuators[0].pulse(0, 0) path so a
      // browser that exposes vibrationActuator but throws at call time still
      // gets a chance to silence the pad through the legacy API.
    }
  }
  const legacy = r.hapticActuators && r.hapticActuators[0]
  if (legacy && typeof legacy.pulse === 'function') {
    try {
      const result = legacy.pulse(0, 0)
      if (result && typeof (result as Promise<boolean>).then === 'function') {
        ;(result as Promise<boolean>).catch(() => {})
      }
    } catch {
      // ignore
    }
  }
}

// Decision resolvers. Touch haptics fires on touch runtimes only; gamepad
// rumble fires when a rumble-capable controller is connected. 'off' always
// suppresses; 'on' always fires; 'auto' bridges the two.
export function shouldTouchHapticFire(mode: HapticMode, isTouch: boolean): boolean {
  if (mode === 'off') return false
  if (mode === 'on') return true
  return isTouch
}

export function shouldGamepadRumbleFire(
  mode: HapticMode,
  hasGamepad: boolean,
): boolean {
  if (mode === 'off') return false
  if (mode === 'on') return true
  return hasGamepad
}

export const GAMEPAD_RUMBLE_MODE_LABELS: Record<HapticMode, string> = {
  off: 'Off',
  auto: 'Auto (gamepad only)',
  on: 'Always on',
}

export const GAMEPAD_RUMBLE_MODE_DESCRIPTIONS: Record<HapticMode, string> = {
  off: 'Never rumble the controller.',
  auto: 'Rumble only when a gamepad with a vibration motor is connected.',
  on: 'Rumble whenever a controller is connected, even if the browser cannot confirm motors.',
}
