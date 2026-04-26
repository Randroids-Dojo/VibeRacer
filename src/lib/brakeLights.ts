import { z } from 'zod'

// Brake-light setting. Controls whether the cosmetic red lamps on the rear of
// the player car glow when the player is slowing the car down.
//
// - off: never lit. For players who prefer the bare GLB rear.
// - auto: lit only while braking (any of: holding the brake / reverse key
//   while moving forward, holding the handbrake). Default; what a real car
//   does. Most visible payoff is in the rear-view mirror inset.
// - on: always lit, regardless of input. For players who like the look of
//   permanently-glowing rear lamps (or want to verify they are visible from
//   their current camera setup).
//
// Pure cosmetic. There is no physics interaction; turning the lamps on does
// not slow the car down, and the brake-light state is computed downstream of
// the physics step (no feedback loop). Anti-cheat is unaffected.
export const BRAKE_LIGHT_MODES = ['off', 'auto', 'on'] as const
export type BrakeLightMode = (typeof BRAKE_LIGHT_MODES)[number]

export const DEFAULT_BRAKE_LIGHT_MODE: BrakeLightMode = 'auto'

export const BrakeLightModeSchema = z.enum(BRAKE_LIGHT_MODES)

export const BRAKE_LIGHT_MODE_LABELS: Record<BrakeLightMode, string> = {
  off: 'Off',
  auto: 'Auto',
  on: 'On',
}

export const BRAKE_LIGHT_MODE_DESCRIPTIONS: Record<BrakeLightMode, string> = {
  off: 'Brake lamps stay dark.',
  auto: 'Brake lamps glow red whenever you are braking or holding the handbrake.',
  on: 'Brake lamps always glow red, even while accelerating.',
}

export function isBrakeLightMode(value: unknown): value is BrakeLightMode {
  return (
    typeof value === 'string' &&
    (BRAKE_LIGHT_MODES as readonly string[]).includes(value)
  )
}

// Per-frame "is the player actively slowing the car down" predicate. Pure
// helper so the rAF loop in RaceCanvas can call it cheaply each frame.
//
// A player counts as braking when either:
//   - the handbrake is held (any speed, any direction); OR
//   - throttle input is negative (S / brake key) AND the car is currently
//     moving forward. Reversing onto the throttle is acceleration, not
//     braking, so we gate on `speed > BRAKE_LIGHT_MIN_FORWARD_SPEED` to keep
//     the lamps off when the player is intentionally driving backward.
//
// Defensive against non-finite throttle / speed inputs (returns false) so a
// missed analog reset never strands the lamps in an "always on" state.
export const BRAKE_LIGHT_MIN_FORWARD_SPEED = 0.5

export function isBrakingNow(
  throttle: number,
  speed: number,
  handbrake: boolean,
): boolean {
  if (handbrake === true) return true
  if (!Number.isFinite(throttle) || !Number.isFinite(speed)) return false
  if (throttle >= 0) return false
  if (speed <= BRAKE_LIGHT_MIN_FORWARD_SPEED) return false
  return true
}

// Resolve the live "should the lamps be glowing this frame" boolean from the
// player's BrakeLightMode pick plus the per-frame braking predicate. Used by
// the renderer's poll-and-set helper so a Settings flip plus the live driver
// input land on the next frame without rebuilding any geometry.
export function shouldBrakeLightsLight(
  mode: BrakeLightMode,
  braking: boolean,
): boolean {
  if (mode === 'off') return false
  if (mode === 'on') return true
  // auto
  return braking
}

// Visual tunables for the brake-light assembly. Centralized so a future polish
// pass on the lamp size or mounting position only changes here. Numbers are in
// world units (meters in the car's local frame after the inner-group scale).
//
// The lamps sit just behind the rear bumper line and slightly to either side
// of the car's centerline, mirroring the headlight layout but on the opposite
// face of the chassis. Each lamp is a small glowing flat disc; there is no
// beam cone (the visual cue is "the lamp is red and bright", not "a beam
// projects backward").
export const BRAKE_LIGHT_LAMP_OFFSET_X = -1.05 // behind the car pivot
export const BRAKE_LIGHT_LAMP_OFFSET_Y = 0.6 // above the chassis pivot
export const BRAKE_LIGHT_LAMP_OFFSET_Z = 0.55 // half-spread between left and right lamps
export const BRAKE_LIGHT_LAMP_RADIUS = 0.16
// Two color channels: the dim "always present" lens color (slightly visible
// even when the brake lamps are off so the player sees the lens housing on a
// bright body) and the bright "lit" emissive color. Matching the headlight
// pattern: the headlights swap visibility, the brake lights swap color.
export const BRAKE_LIGHT_COLOR_HEX = 0xff2a2a // bright red while braking
// Glow halo: a thin translucent additive disc one notch larger than the lamp
// so the lit state reads as a soft red glow against the road and through the
// rear-view mirror. Hidden when the lamps are dark.
export const BRAKE_LIGHT_GLOW_RADIUS = 0.34
export const BRAKE_LIGHT_GLOW_OPACITY = 0.55
