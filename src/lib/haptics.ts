// Haptic feedback (Vibration API) for tactile confirmation on touch devices.
//
// Web Vibration API is intentionally low-effort: navigator.vibrate(pattern)
// schedules a single one-shot pulse pattern. Pure cosmetic; never affects
// physics or anti-cheat. Desktop browsers and devices without a vibration
// motor silently no-op so the helper is safe to call from any code path.
//
// We expose three named outcomes that mirror the existing PB / record / lap
// audio cues:
//   - 'lap'    -> a single short pulse on every completed lap.
//   - 'pb'     -> a longer celebratory double-pulse on a fresh personal best.
//   - 'record' -> the loudest pattern, a triple-pulse for a fresh track-wide
//                 record (a new #1 on the leaderboard).
//
// Patterns are tuned to be felt without being annoying on a long session: the
// lap pulse is brief enough that a fast circuit racer is not constantly
// buzzing, and the record pattern stays under a second so it overlaps with
// (but does not outlive) the audio fanfare.

import { z } from 'zod'

export const HAPTIC_OUTCOMES = ['lap', 'pb', 'record'] as const
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
