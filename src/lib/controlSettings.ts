import { z } from 'zod'
import { CarPaintSettingSchema } from './carPaint'
import {
  DEFAULT_RACING_NUMBER,
  RacingNumberSettingSchema,
  type RacingNumberSetting,
} from './racingNumber'
import {
  DEFAULT_TIME_OF_DAY,
  TimeOfDaySchema,
  type TimeOfDay,
} from './lighting'
import {
  DEFAULT_WEATHER,
  WeatherSchema,
  type Weather,
} from './weather'
import {
  DEFAULT_SPEED_UNIT,
  SpeedUnitSchema,
  type SpeedUnit,
} from './speedometer'
import {
  DEFAULT_GHOST_SOURCE,
  GhostSourceSchema,
  type GhostSource,
} from './ghostSource'
import {
  DEFAULT_HEADLIGHT_MODE,
  HeadlightModeSchema,
  type HeadlightMode,
} from './headlights'
import {
  DEFAULT_BRAKE_LIGHT_MODE,
  BrakeLightModeSchema,
  type BrakeLightMode,
} from './brakeLights'
import {
  DEFAULT_GAMEPAD_RUMBLE_INTENSITY,
  DEFAULT_HAPTIC_MODE,
  GamepadRumbleIntensitySchema,
  HapticModeSchema,
  type GamepadRumbleIntensity,
  type HapticMode,
} from './haptics'
import {
  DEFAULT_TIME_OF_DAY_CYCLE,
  TimeOfDayCycleModeSchema,
  type TimeOfDayCycleMode,
} from './timeOfDayCycle'
import {
  DEFAULT_TRANSMISSION,
  TRANSMISSION_MODES,
  type TransmissionMode,
} from '@/game/transmission'

// Re-export so component code can import the enum + type from one place
// (controlSettings) alongside the rest of the user-preference surface.
export { TRANSMISSION_MODES, type TransmissionMode } from '@/game/transmission'

// User-tunable control settings. Persisted to localStorage so the choice
// follows the player across sessions and slugs without server state.

export const CONTROL_ACTIONS = [
  'forward',
  'backward',
  'left',
  'right',
  'handbrake',
  'shiftDown',
  'shiftUp',
  'restartLap',
] as const
export type ControlAction = (typeof CONTROL_ACTIONS)[number]

// Subset of CONTROL_ACTIONS that the game loop reads as held-down booleans
// (forward, brake, steer, handbrake). The remaining actions are one-shots
// that fire on the rising edge of a keydown and are handled by their own
// listener (Game.tsx for restartLap). useKeyboard only writes booleans for
// the continuous set so a one-shot binding never pollutes KeyInput.
export const CONTINUOUS_CONTROL_ACTIONS = [
  'forward',
  'backward',
  'left',
  'right',
  'handbrake',
  'shiftDown',
  'shiftUp',
] as const
export type ContinuousControlAction = (typeof CONTINUOUS_CONTROL_ACTIONS)[number]

export function isContinuousAction(
  action: ControlAction,
): action is ContinuousControlAction {
  return (CONTINUOUS_CONTROL_ACTIONS as readonly string[]).includes(action)
}

// Gamepad actions are a smaller set than keyboard actions: steering stays on
// the analog stick + dpad and is not user-rebindable here, so the rebindable
// actions are just the discrete buttons that drive throttle, brake, handbrake,
// and pause. Each action holds a list of W3C Standard Gamepad button indices
// (0..16), and the gamepad helper looks at the analog `value` of every bound
// button so triggers (analog) and face buttons (digital) feel identical at the
// physics layer.
export const GAMEPAD_ACTIONS = [
  'forward',
  'backward',
  'handbrake',
  'shiftDown',
  'shiftUp',
  'pause',
] as const
export type GamepadAction = (typeof GAMEPAD_ACTIONS)[number]

export type GamepadBindings = Record<GamepadAction, number[]>

// W3C Standard Gamepad layout. Indices 0..16 are well-defined; we accept
// anything in range so future remap UIs can grow if browsers ever ship more
// indices. Source: https://w3c.github.io/gamepad/#remapping
export const GAMEPAD_BUTTON_MAX_INDEX = 16

export const DEFAULT_GAMEPAD_BINDINGS: GamepadBindings = {
  // RT (analog forward) plus A (digital fallback so D-input pads with no
  // analog triggers still drive forward at full throttle).
  forward: [7, 0],
  // LT (analog brake / reverse) plus B (digital fallback).
  backward: [6, 1],
  // RB primary, X face button as a thumb-friendly alt.
  handbrake: [5, 2],
  // LB downshifts, Y upshifts.
  shiftDown: [4],
  shiftUp: [3],
  // Start / Options.
  pause: [9],
}

export const TOUCH_MODES = ['dual', 'single'] as const
export type TouchMode = (typeof TOUCH_MODES)[number]

export type KeyBindings = Record<ControlAction, string[]>

// Player-tunable camera rig. Mirrors the runtime CameraRigParams in
// src/game/sceneBuilder.ts, but only the parameters worth surfacing in
// Settings: how high the camera sits, how far it trails, how far ahead the
// look-target leans into turns, how snappy the follow is, and the perspective
// camera's vertical field of view. The two lerp rates are tied together behind
// a single `followSpeed` so the UI stays a single intuitive slider rather than
// two fiddly knobs.
export interface CameraRigSettings {
  height: number
  distance: number
  lookAhead: number
  followSpeed: number
  // Optional preset-only local camera X offset, in car-forward units.
  // Negative sits behind the car, positive sits toward the front. When
  // omitted the renderer derives the offset from `-distance` so legacy chase
  // behavior and the Distance slider stay intact.
  cameraForward?: number
  // Optional preset-only look target height. Defaults to 1, matching the
  // legacy chase camera target around the body center.
  targetHeight?: number
  // Vertical field of view in degrees. Lower values zoom in and feel calmer;
  // higher values widen the view (peripheral vision) and feel faster, at the
  // cost of more lens distortion at the edges.
  fov: number
}

// Slider ranges. Picked so the extremes still produce a usable view: the
// minimum height (1.5) is roof-cam and the max (14) is helicopter, the
// trailing distance spans tight chase to wide cinematic, lookAhead 0 (center
// the car) to 12 (anticipates corners aggressively), and followSpeed 0.4
// (loose, drifty cam) to 1.6 (snappy, locked-on). Defaults match the legacy
// hardcoded `DEFAULT_CAMERA_RIG` so users who never touch the panel see the
// same view they did before.
export const CAMERA_HEIGHT_MIN = 1.5
export const CAMERA_HEIGHT_MAX = 14
export const CAMERA_DISTANCE_MIN = 6
export const CAMERA_DISTANCE_MAX = 28
export const CAMERA_LOOK_AHEAD_MIN = 0
export const CAMERA_LOOK_AHEAD_MAX = 12
export const CAMERA_FOLLOW_SPEED_MIN = 0.4
export const CAMERA_FOLLOW_SPEED_MAX = 1.6
export const CAMERA_FORWARD_MIN = -28
export const CAMERA_FORWARD_MAX = 4
export const CAMERA_TARGET_HEIGHT_MIN = 0.2
export const CAMERA_TARGET_HEIGHT_MAX = 4
// FOV bounds: 50 is a fairly tight cinematic view, 110 is a fish-eye-leaning
// wide view that still keeps the chase camera readable. The legacy hardcoded
// camera shipped with 70 degrees so that stays the default.
export const CAMERA_FOV_MIN = 50
export const CAMERA_FOV_MAX = 110

export const DEFAULT_CAMERA_SETTINGS: CameraRigSettings = {
  height: 6,
  distance: 14,
  lookAhead: 6,
  followSpeed: 1,
  fov: 70,
}

export interface ControlSettings {
  keyBindings: KeyBindings
  touchMode: TouchMode
  showGhost: boolean
  // Which ghost to surface when `showGhost` is true: 'auto' (legacy: PB if
  // the player has one, else leaderboard top), 'top' (always the leaderboard
  // top, even after the player's PB beats it), or 'pb' (only the player's
  // PB, no fallback to top). Setting `showGhost: false` hides the ghost
  // regardless of source.
  ghostSource: GhostSource
  // Toggle the floating nameplate above the ghost car (initials + lap
  // time). Default on so players know whose lap they are chasing without
  // having to open the leaderboard. The toggle is here for users who want
  // a totally clean ghost car silhouette. Has no effect when `showGhost`
  // is false (the nameplate hides whenever the ghost itself is hidden).
  showGhostNameplate: boolean
  // Toggle the live "ghost gap" HUD chip: a small pill rendered alongside
  // the existing live split tile that shows the player's real-time time
  // delta vs the ghost car's recorded path (negative = ahead, green;
  // positive = behind, red). Updated every HUD frame from the same source
  // the ghost car uses, so a flip in `ghostSource` swaps both at once. Has
  // no effect when `showGhost` is false (no ghost on screen means no gap to
  // measure). Default on so players see the chip on their next race.
  showGhostGap: boolean
  // Toggle the bottom-right top-down minimap card. Default on for new users
  // (cheap render, useful on unfamiliar tracks); turning it off hides the
  // card entirely with no other side effects.
  showMinimap: boolean
  // Toggle the dark tire trail laid behind the rear wheels during slides.
  // Cheap to render (a fixed-size pool of fading quads) so default on; the
  // toggle is here for users who want a fully clean track surface.
  showSkidMarks: boolean
  // Toggle the soft white tire-smoke puffs that pop off the rear wheels
  // during hard slides and braking. Volumetric (camera-facing sprites that
  // rise + fade in under a second) so the cue reads alongside the dark skid
  // trail without competing with it. Cheap to render (a fixed pool of soft
  // sprites) so default on; the toggle is here for users who want a clean
  // track with no atmospheric particles.
  showTireSmoke: boolean
  // Toggle the bottom-center speedometer overlay. Default on. The chosen
  // unit is independent of the toggle: turning the readout off keeps the
  // unit choice for whenever the player turns it back on.
  showSpeedometer: boolean
  speedUnit: SpeedUnit
  // Toggle the session top-speed marker drawn as a small tick on the
  // speedometer dial plus a `PEAK <value>` sub-readout below the live number.
  // Default on so existing players see the new marker on their next race; the
  // toggle is here for users who want a clean dial. The peak resets on a full
  // Restart and on Exit-to-title; Restart Lap and pause keep the running peak.
  showTopSpeedMarker: boolean
  // Toggle the top-center rear-view mirror. Renders the same scene from a
  // backward-facing camera in a small inset so the player can see the ghost
  // (or anything else behind them) while racing. Default on.
  showRearview: boolean
  // Toggle the alternating red / white kerbs at the inside of every corner.
  // Cheap to render (a couple of materials shared across every tile) so
  // default on; the toggle is here for users who want a pure-asphalt look.
  showKerbs: boolean
  // Toggle the trackside scenery (trees on the grass, traffic cones at the
  // outside of every corner, red / white barrier blocks framing the start
  // gate). Cheap to render (a small handful of cached geometries reused
  // across every prop) so default on; the toggle is here for users who want
  // a totally clean track and grass field with nothing else on it.
  showScenery: boolean
  // Toggle the live drift-score HUD block. Default on. Hides both the live
  // score and the lap / all-time best blocks; the underlying scoring keeps
  // running so a flip back mid-session still shows the in-progress totals.
  showDrift: boolean
  // Toggle the racing-line overlay: a thin colored polyline floating just
  // above the asphalt that traces the active ghost replay (the same source
  // the ghost car uses, picked by `ghostSource`). Default off because the
  // line is a coaching aid that not every player wants on screen; the toggle
  // is here for players who want to study the fast line.
  showRacingLine: boolean
  // Toggle the screen-space speed-line streak overlay: thin streaks radiate
  // outward from the screen center while the player is going fast (above
  // ~65% of their tuning's maxSpeed). Pure cosmetic; sells velocity in the
  // anime / Forza Horizon rush style. Default on so existing players see the
  // effect on their next race; the toggle is here for users who prefer a
  // clean screen at top speed.
  showSpeedLines: boolean
  // Toggle the reaction-time HUD chip. When on, the HUD pops a small pill
  // showing how many milliseconds elapsed between the GO light and the
  // player first pressing throttle, plus a tier label (LIGHTNING / GREAT /
  // GOOD / HUMAN). Auto-fades after a few seconds so it never clutters the
  // mid-race HUD. Default on so existing players see the chip on their next
  // race; the toggle is here for users who prefer a clean post-launch HUD.
  showReactionTime: boolean
  // Toggle the leaderboard-rank HUD chip. When on, the HUD pins a small
  // pill alongside the medal badge showing the player's current standing on
  // the (slug, version) leaderboard ("P1", "PODIUM", "TOP 10 #5", etc.).
  // Persists across sessions per (slug, version) so the chip lights up the
  // moment a recognized layout loads, before the next submit lands. Default
  // on; the toggle is here for users who prefer a clean post-launch HUD.
  showLeaderboardRank: boolean
  // Toggle the pace-notes HUD chip ("co-driver call-outs"). When on, the HUD
  // surfaces the upcoming track feature ("Sharp left next", "S-curve in 2",
  // "Finish") so the player can plan a corner before they see it, in the
  // spirit of rally-game pace notes. Pure topology lookup; updates every HUD
  // frame from the player's current piece. Default OFF (opt-in coaching aid)
  // so legacy stored payloads keep their existing screen exactly as it was.
  showPaceNotes: boolean
  camera: CameraRigSettings
  // Lowercase 7-char hex string (`#rrggbb`) or null for the stock colormap.
  // Stored as a string so the Settings UI can compare directly against the
  // palette in `src/lib/carPaint.ts`.
  carPaint: string | null
  // Racing number plate decal mounted on the car's roof. When `enabled` is
  // true the renderer attaches a small flat plate showing `value` (a 1-2
  // digit string) drawn in `textHex` on a `plateHex` background. Default off
  // so legacy stored payloads keep the exact car silhouette they had on
  // upgrade. Pure cosmetic. Defaults documented in `src/lib/racingNumber.ts`.
  racingNumber: RacingNumberSetting
  // User-customizable gamepad button bindings. Steering is fixed (left stick
  // X plus dpad 14/15); these cover the discrete buttons that drive throttle,
  // brake, handbrake, and pause.
  gamepadBindings: GamepadBindings
  // Visual time-of-day skin for the scene: tints sky, ground, ambient light,
  // and sun direction / color. Pure cosmetic. Default 'noon' matches the
  // original hardcoded scene exactly so users who never open Settings see no
  // change.
  timeOfDay: TimeOfDay
  // Visual weather skin for the scene: layers exponential fog, a sky tint,
  // and ambient / sun multipliers on top of the time-of-day preset. Pure
  // cosmetic. Default 'clear' is a no-op (zero fog density, identity
  // multipliers) so users who never open Settings see no change.
  weather: Weather
  // When true (the default), apply the track author's preferred mood
  // (timeOfDay / weather baked into the track version) instead of the player's
  // own picks. The player's `timeOfDay` and `weather` choices remain stored;
  // turning this off snaps the scene back to those personal picks. Track
  // authors set the mood from the editor's Advanced panel.
  respectTrackMood: boolean
  // Headlight lamp lenses and SpotLights on the front of the player car.
  // 'auto' lights them in dim scenes (dawn / sunset / dusk / night / foggy /
  // snowy / rainy); 'on' always lights them; 'off' keeps them dark. Visual
  // only and never affects physics. Default 'auto' matches what a player would
  // expect ("the car turns its lights on at night") so the upgrade is opt-out,
  // not opt-in.
  headlights: HeadlightMode
  // Cosmetic brake lamps + soft red glow on the rear of the player car. 'auto'
  // glows them while the player is braking (brake key while moving forward,
  // or handbrake at any time); 'on' always glows them; 'off' keeps them dark.
  // Pure cosmetic; never affects physics. Most visible from the rear-view
  // mirror or when chasing the player car. Default 'auto' matches a real car
  // so the upgrade is opt-out.
  brakeLights: BrakeLightMode
  // Haptic feedback (Vibration API) on lap completion, fresh personal best,
  // and a fresh track-wide record. 'auto' fires only on touch devices (the
  // buzz is meaningless on a hardwired desktop); 'on' always fires; 'off'
  // suppresses every buzz. Default 'auto' so phone players opt in by default
  // and desktop sessions stay quiet.
  haptics: HapticMode
  // Gamepad rumble (vibrationActuator dual-rumble) on a connected controller.
  // Drives the Forza-lite continuous engine / surface / slip rumble and the
  // discrete lap / PB / record / off-track impulses. 'auto' fires only when a
  // rumble-capable pad is connected; 'on' always fires; 'off' suppresses every
  // rumble. Default 'auto' so desktop players with a controller feel it on
  // their next race without having to dig into Settings.
  gamepadRumble: HapticMode
  // Per-motor intensity for gamepad rumble. Strong is the low-frequency
  // motor that carries engine / chassis weight. Weak is the high-frequency
  // motor that carries slip / drift and warning chatter. Defaults preserve
  // the shipped 100 percent feel for both motors.
  gamepadRumbleIntensity: GamepadRumbleIntensity
  // Auto-rotate the active time-of-day skin through noon -> morning -> sunset
  // -> night while the player races. Pure cosmetic. Default 'off' so legacy
  // stored payloads keep their existing screen exactly as it was; players who
  // want a Forza Horizon-style sky cycle can flip to 'slow' (5 min per skin)
  // or 'fast' (60s per skin) once. Composes with the static `timeOfDay` pick:
  // the cycle starts on whichever preset the player picked and rotates from
  // there so a flip on does not snap to noon mid-race.
  timeOfDayCycle: TimeOfDayCycleMode
  // 'automatic' keeps the classic arcade drive model where the engine handles
  // gears for you. 'manual' surfaces a 5-gear box driven by the player's
  // shiftDown / shiftUp bindings (Q / E by default), the touch shifter, and
  // the gamepad LB / Y buttons. Default 'automatic' so legacy stored payloads
  // keep the same race feel they had before this preference moved off of the
  // track and onto the player.
  transmission: TransmissionMode
}

export const DEFAULT_KEY_BINDINGS: KeyBindings = {
  forward: ['KeyW', 'ArrowUp'],
  backward: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  handbrake: ['Space'],
  shiftDown: ['KeyQ'],
  shiftUp: ['KeyE'],
  // R restarts only the current lap. Convenient for time-trial runs where the
  // player botches a corner and wants a fresh attempt without the full
  // countdown of a session restart. Lap counter, session PB, and lap history
  // are preserved.
  restartLap: ['KeyR'],
}

export const DEFAULT_CONTROL_SETTINGS: ControlSettings = {
  keyBindings: DEFAULT_KEY_BINDINGS,
  touchMode: 'single',
  showGhost: true,
  ghostSource: DEFAULT_GHOST_SOURCE,
  showGhostNameplate: true,
  showGhostGap: true,
  showMinimap: true,
  showSkidMarks: true,
  showTireSmoke: true,
  showSpeedometer: true,
  speedUnit: DEFAULT_SPEED_UNIT,
  showTopSpeedMarker: true,
  showRearview: true,
  showKerbs: true,
  showScenery: true,
  showDrift: true,
  showRacingLine: false,
  showSpeedLines: true,
  showReactionTime: true,
  showLeaderboardRank: true,
  showPaceNotes: false,
  camera: DEFAULT_CAMERA_SETTINGS,
  carPaint: null,
  racingNumber: DEFAULT_RACING_NUMBER,
  gamepadBindings: DEFAULT_GAMEPAD_BINDINGS,
  timeOfDay: DEFAULT_TIME_OF_DAY,
  weather: DEFAULT_WEATHER,
  respectTrackMood: true,
  headlights: DEFAULT_HEADLIGHT_MODE,
  brakeLights: DEFAULT_BRAKE_LIGHT_MODE,
  haptics: DEFAULT_HAPTIC_MODE,
  gamepadRumble: DEFAULT_HAPTIC_MODE,
  gamepadRumbleIntensity: DEFAULT_GAMEPAD_RUMBLE_INTENSITY,
  timeOfDayCycle: DEFAULT_TIME_OF_DAY_CYCLE,
  transmission: DEFAULT_TRANSMISSION,
}

export const CONTROL_SETTINGS_STORAGE_KEY = 'viberacer.controls'

const KeyCodeSchema = z.string().min(1).max(32)

const KeyBindingsSchema = z.object({
  forward: z.array(KeyCodeSchema),
  backward: z.array(KeyCodeSchema),
  left: z.array(KeyCodeSchema),
  right: z.array(KeyCodeSchema),
  handbrake: z.array(KeyCodeSchema),
  shiftDown: z.array(KeyCodeSchema).default(['KeyQ']),
  shiftUp: z.array(KeyCodeSchema).default(['KeyE']),
  // restartLap landed after the original control set. Backfill the default R
  // binding for legacy stored payloads so the upgrade is opt-out, not opt-in.
  restartLap: z.array(KeyCodeSchema).default(['KeyR']),
})

const GamepadButtonIndexSchema = z
  .number()
  .int()
  .min(0)
  .max(GAMEPAD_BUTTON_MAX_INDEX)

const GamepadBindingsSchema = z.object({
  forward: z.array(GamepadButtonIndexSchema),
  backward: z.array(GamepadButtonIndexSchema),
  handbrake: z.array(GamepadButtonIndexSchema),
  shiftDown: z.array(GamepadButtonIndexSchema).default([4]),
  shiftUp: z.array(GamepadButtonIndexSchema).default([3]),
  pause: z.array(GamepadButtonIndexSchema),
})

const CameraRigSettingsSchema = z.object({
  height: z.number().min(CAMERA_HEIGHT_MIN).max(CAMERA_HEIGHT_MAX),
  distance: z.number().min(CAMERA_DISTANCE_MIN).max(CAMERA_DISTANCE_MAX),
  lookAhead: z.number().min(CAMERA_LOOK_AHEAD_MIN).max(CAMERA_LOOK_AHEAD_MAX),
  followSpeed: z
    .number()
    .min(CAMERA_FOLLOW_SPEED_MIN)
    .max(CAMERA_FOLLOW_SPEED_MAX),
  cameraForward: z
    .number()
    .min(CAMERA_FORWARD_MIN)
    .max(CAMERA_FORWARD_MAX)
    .optional(),
  targetHeight: z
    .number()
    .min(CAMERA_TARGET_HEIGHT_MIN)
    .max(CAMERA_TARGET_HEIGHT_MAX)
    .optional(),
  // FOV landed after the original camera shape; backfill from the default so
  // legacy stored payloads (with the rest of the rig already saved) keep their
  // tweaks instead of getting reset back to the full default rig.
  fov: z.number().min(CAMERA_FOV_MIN).max(CAMERA_FOV_MAX).default(70),
})

const ControlSettingsSchema = z.object({
  keyBindings: KeyBindingsSchema,
  touchMode: z.enum(TOUCH_MODES),
  // Older stored settings predate this flag; default it on so existing users
  // see the ghost on their next race without having to dig into Settings.
  showGhost: z.boolean().default(true),
  // Ghost-source picker landed after `showGhost`. Default 'auto' matches the
  // legacy resolution (local PB if present, else leaderboard top) so legacy
  // payloads keep their existing behavior on the next race without having to
  // open Settings.
  ghostSource: GhostSourceSchema.default(DEFAULT_GHOST_SOURCE),
  // Ghost nameplate landed after the ghost-source picker. Default on so
  // legacy stored payloads start showing the floating "WHO + TIME" plate
  // above the ghost car automatically without losing any other choices;
  // players who want a clean silhouette can flip it off.
  showGhostNameplate: z.boolean().default(true),
  // Live ghost-gap chip landed after the nameplate toggle. Default on so
  // legacy stored payloads start showing the chip automatically without
  // losing any other choices; players who want a totally clean HUD can flip
  // it off in Settings.
  showGhostGap: z.boolean().default(true),
  // Minimap toggle landed after the original settings shape. Default on for
  // legacy stored payloads so the upgrade is opt-out, not opt-in.
  showMinimap: z.boolean().default(true),
  // Skid marks toggle landed later still; default on so legacy payloads
  // start showing them automatically without losing any other choices.
  showSkidMarks: z.boolean().default(true),
  // Tire smoke landed after skid marks. Default on so legacy stored payloads
  // start seeing the soft puffs automatically without losing any other
  // choices; players who want a clean cornering scene can flip this off.
  showTireSmoke: z.boolean().default(true),
  // Speedometer landed later. Default on so existing players see the new
  // overlay on their next race; the unit choice backfills to mph.
  showSpeedometer: z.boolean().default(true),
  // Rear-view mirror landed later still. Default on so legacy players see
  // the inset on their next race without having to dig into Settings.
  showRearview: z.boolean().default(true),
  // Kerbs landed later still. Default on so legacy stored payloads start
  // showing the curb stones automatically without losing any other choices.
  showKerbs: z.boolean().default(true),
  // Trackside scenery landed after kerbs. Default on so legacy payloads start
  // seeing trees / cones / barriers automatically without losing any other
  // choices.
  showScenery: z.boolean().default(true),
  // Drift-score HUD landed after kerbs. Default on so legacy payloads start
  // showing the new readouts automatically without losing any other choices.
  showDrift: z.boolean().default(true),
  // Racing-line overlay landed after drift. Default OFF (opt-in coaching aid)
  // so legacy stored payloads keep their existing screen exactly as it was;
  // players who want the line have to flip it on once in Settings.
  showRacingLine: z.boolean().default(false),
  // Speed-line streak overlay landed after racing line. Default ON (cosmetic
  // velocity cue) so legacy stored payloads start seeing the streaks the next
  // time they hit top speed; players who want a clean screen can flip it off.
  showSpeedLines: z.boolean().default(true),
  // Reaction-time chip landed after speed lines. Default ON so legacy stored
  // payloads start showing the post-launch chip on their next race; players
  // who want a clean HUD immediately after GO can flip it off in Settings.
  showReactionTime: z.boolean().default(true),
  // Leaderboard rank chip landed after reaction time. Default ON so legacy
  // stored payloads start showing the placement chip on their next race;
  // players who want a clean HUD can flip it off in Settings.
  showLeaderboardRank: z.boolean().default(true),
  // Pace notes chip landed after the leaderboard rank chip. Default OFF
  // (opt-in coaching aid) so legacy stored payloads keep their existing
  // screen exactly as it was; players who want rally-style co-driver
  // call-outs flip it on once in Settings.
  showPaceNotes: z.boolean().default(false),
  speedUnit: SpeedUnitSchema.default(DEFAULT_SPEED_UNIT),
  // Top-speed marker landed after the speedometer toggle. Default on so legacy
  // stored payloads start showing the peak tick on their next race; players
  // who want a clean dial can flip it off in Settings.
  showTopSpeedMarker: z.boolean().default(true),
  // Camera tunables landed after the original settings shape; backfill from
  // defaults when reading legacy localStorage payloads so existing users do
  // not see a broken Settings pane.
  camera: CameraRigSettingsSchema.default(DEFAULT_CAMERA_SETTINGS),
  // Car paint also landed later. Null = stock colormap from the GLB.
  carPaint: CarPaintSettingSchema.default(null),
  // Racing number plate landed after car paint. Default-disabled so legacy
  // stored payloads keep the exact car they had on upgrade; the rest of the
  // sub-fields backfill from the racingNumber default so a player who flips
  // `enabled` once in Settings sees a well-formed plate immediately.
  racingNumber: RacingNumberSettingSchema.default(DEFAULT_RACING_NUMBER),
  // Gamepad bindings landed after the original settings shape; backfill from
  // defaults when reading legacy localStorage payloads so existing controller
  // users keep the same bindings they had before this feature shipped.
  gamepadBindings: GamepadBindingsSchema.default(DEFAULT_GAMEPAD_BINDINGS),
  // Time of day landed later still. Default to noon for legacy stored payloads
  // so users see the exact scene they had before this feature shipped.
  timeOfDay: TimeOfDaySchema.default(DEFAULT_TIME_OF_DAY),
  // Weather landed after time-of-day. Default to clear (zero fog, identity
  // multipliers) for legacy stored payloads so users see the exact scene they
  // had before this feature shipped.
  weather: WeatherSchema.default(DEFAULT_WEATHER),
  // Track-author mood respect landed after weather. Default true so brand-new
  // players see the look the track author intended; legacy stored payloads
  // pick up the same default so the upgrade is opt-out, not opt-in.
  respectTrackMood: z.boolean().default(true),
  // Headlights landed after track-mood respect. Default 'auto' so legacy stored
  // payloads light up the lamps the next time they race a sunset / night /
  // foggy / snowy / rainy scene without having to dig into Settings; players
  // who want them off can flip to 'off' once.
  headlights: HeadlightModeSchema.default(DEFAULT_HEADLIGHT_MODE),
  // Brake lights landed after headlights. Default 'auto' so legacy stored
  // payloads start showing red rear lamps while braking on the next race
  // (matches a real car) without having to dig into Settings.
  brakeLights: BrakeLightModeSchema.default(DEFAULT_BRAKE_LIGHT_MODE),
  // Haptics landed after brake lights. Default 'auto' so phone players feel
  // the buzz on the next race without having to dig into Settings; legacy
  // stored payloads pick up the same default so the upgrade is opt-out, not
  // opt-in.
  haptics: HapticModeSchema.default(DEFAULT_HAPTIC_MODE),
  // Gamepad rumble landed after touch haptics. Default 'auto' so desktop
  // players with a connected pad feel the Forza-lite rumble on the next race;
  // legacy stored payloads pick up the same default so the upgrade is opt-out.
  gamepadRumble: HapticModeSchema.default(DEFAULT_HAPTIC_MODE),
  // Rumble intensity landed after the base gamepad rumble setting. Defaults
  // are both 1 so legacy payloads preserve the exact shipped feel.
  gamepadRumbleIntensity: GamepadRumbleIntensitySchema.default(
    DEFAULT_GAMEPAD_RUMBLE_INTENSITY,
  ),
  // Time-of-day auto cycle landed after haptics. Default 'off' so legacy stored
  // payloads keep their existing screen exactly as it was; players who want a
  // Forza Horizon-style rotating sky have to flip it on once in Settings.
  timeOfDayCycle: TimeOfDayCycleModeSchema.default(DEFAULT_TIME_OF_DAY_CYCLE),
  // Transmission moved off of the track and onto the player. Default
  // 'automatic' so legacy stored payloads keep the classic drive model;
  // players who want manual shifting flip it on once in Settings and it
  // applies to every track they race.
  transmission: z.enum(TRANSMISSION_MODES).default(DEFAULT_TRANSMISSION),
})

export function cloneDefaultCameraSettings(): CameraRigSettings {
  return { ...DEFAULT_CAMERA_SETTINGS }
}

export function cloneDefaultSettings(): ControlSettings {
  return {
    keyBindings: cloneDefaultBindings(),
    touchMode: DEFAULT_CONTROL_SETTINGS.touchMode,
    showGhost: DEFAULT_CONTROL_SETTINGS.showGhost,
    ghostSource: DEFAULT_CONTROL_SETTINGS.ghostSource,
    showGhostNameplate: DEFAULT_CONTROL_SETTINGS.showGhostNameplate,
    showGhostGap: DEFAULT_CONTROL_SETTINGS.showGhostGap,
    showMinimap: DEFAULT_CONTROL_SETTINGS.showMinimap,
    showSkidMarks: DEFAULT_CONTROL_SETTINGS.showSkidMarks,
    showTireSmoke: DEFAULT_CONTROL_SETTINGS.showTireSmoke,
    showSpeedometer: DEFAULT_CONTROL_SETTINGS.showSpeedometer,
    speedUnit: DEFAULT_CONTROL_SETTINGS.speedUnit,
    showTopSpeedMarker: DEFAULT_CONTROL_SETTINGS.showTopSpeedMarker,
    showRearview: DEFAULT_CONTROL_SETTINGS.showRearview,
    showKerbs: DEFAULT_CONTROL_SETTINGS.showKerbs,
    showScenery: DEFAULT_CONTROL_SETTINGS.showScenery,
    showDrift: DEFAULT_CONTROL_SETTINGS.showDrift,
    showRacingLine: DEFAULT_CONTROL_SETTINGS.showRacingLine,
    showSpeedLines: DEFAULT_CONTROL_SETTINGS.showSpeedLines,
    showReactionTime: DEFAULT_CONTROL_SETTINGS.showReactionTime,
    showLeaderboardRank: DEFAULT_CONTROL_SETTINGS.showLeaderboardRank,
    showPaceNotes: DEFAULT_CONTROL_SETTINGS.showPaceNotes,
    camera: cloneDefaultCameraSettings(),
    carPaint: DEFAULT_CONTROL_SETTINGS.carPaint,
    racingNumber: { ...DEFAULT_RACING_NUMBER },
    gamepadBindings: cloneDefaultGamepadBindings(),
    timeOfDay: DEFAULT_CONTROL_SETTINGS.timeOfDay,
    weather: DEFAULT_CONTROL_SETTINGS.weather,
    respectTrackMood: DEFAULT_CONTROL_SETTINGS.respectTrackMood,
    headlights: DEFAULT_CONTROL_SETTINGS.headlights,
    brakeLights: DEFAULT_CONTROL_SETTINGS.brakeLights,
    haptics: DEFAULT_CONTROL_SETTINGS.haptics,
    gamepadRumble: DEFAULT_CONTROL_SETTINGS.gamepadRumble,
    gamepadRumbleIntensity: { ...DEFAULT_GAMEPAD_RUMBLE_INTENSITY },
    timeOfDayCycle: DEFAULT_CONTROL_SETTINGS.timeOfDayCycle,
    transmission: DEFAULT_CONTROL_SETTINGS.transmission,
  }
}

export function cloneDefaultGamepadBindings(): GamepadBindings {
  return {
    forward: [...DEFAULT_GAMEPAD_BINDINGS.forward],
    backward: [...DEFAULT_GAMEPAD_BINDINGS.backward],
    handbrake: [...DEFAULT_GAMEPAD_BINDINGS.handbrake],
    shiftDown: [...DEFAULT_GAMEPAD_BINDINGS.shiftDown],
    shiftUp: [...DEFAULT_GAMEPAD_BINDINGS.shiftUp],
    pause: [...DEFAULT_GAMEPAD_BINDINGS.pause],
  }
}

export function cloneGamepadBindings(b: GamepadBindings): GamepadBindings {
  return {
    forward: [...b.forward],
    backward: [...b.backward],
    handbrake: [...b.handbrake],
    shiftDown: [...b.shiftDown],
    shiftUp: [...b.shiftUp],
    pause: [...b.pause],
  }
}

// Replace any prior assignment of `index` (across all actions) and assign it
// to `target` at `slot`. Each button index maps to at most one action across
// the whole binding map. Returns a fresh GamepadBindings object.
export function rebindGamepadButton(
  bindings: GamepadBindings,
  target: GamepadAction,
  slot: number,
  index: number,
): GamepadBindings {
  const next = cloneGamepadBindings(bindings)
  for (const action of GAMEPAD_ACTIONS) {
    next[action] = next[action].filter((b) => b !== index)
  }
  const list = next[target]
  while (list.length <= slot) list.push(-1)
  list[slot] = index
  next[target] = list.filter((b) => b >= 0)
  return next
}

export function clearGamepadBinding(
  bindings: GamepadBindings,
  target: GamepadAction,
  slot: number,
): GamepadBindings {
  const next = cloneGamepadBindings(bindings)
  if (slot >= 0 && slot < next[target].length) {
    next[target] = next[target].filter((_, i) => i !== slot)
  }
  return next
}

// Reverse-lookup: which action (if any) is currently bound to `index`. First
// match wins, mirroring `actionForCode` for keyboard.
export function gamepadActionForIndex(
  bindings: GamepadBindings,
  index: number,
): GamepadAction | null {
  for (const action of GAMEPAD_ACTIONS) {
    if (bindings[action].includes(index)) return action
  }
  return null
}

// Map the two-knob `followSpeed` slider onto sceneBuilder's positionLerp +
// targetLerp pair. Defaults: positionLerp 0.12, targetLerp 0.20 at speed 1.0.
// Linear scaling with `followSpeed` keeps the legacy default exact while
// letting users push the camera looser or tighter without exposing the two
// raw knobs.
export const CAMERA_DEFAULT_POSITION_LERP = 0.12
export const CAMERA_DEFAULT_TARGET_LERP = 0.2
export function cameraLerpsFor(followSpeed: number): {
  positionLerp: number
  targetLerp: number
} {
  const clamped = Math.min(
    Math.max(followSpeed, CAMERA_FOLLOW_SPEED_MIN),
    CAMERA_FOLLOW_SPEED_MAX,
  )
  return {
    positionLerp: clamp01(CAMERA_DEFAULT_POSITION_LERP * clamped),
    targetLerp: clamp01(CAMERA_DEFAULT_TARGET_LERP * clamped),
  }
}

function clamp01(x: number): number {
  if (x < 0) return 0
  if (x > 1) return 1
  return x
}

export function cloneDefaultBindings(): KeyBindings {
  return {
    forward: [...DEFAULT_KEY_BINDINGS.forward],
    backward: [...DEFAULT_KEY_BINDINGS.backward],
    left: [...DEFAULT_KEY_BINDINGS.left],
    right: [...DEFAULT_KEY_BINDINGS.right],
    handbrake: [...DEFAULT_KEY_BINDINGS.handbrake],
    shiftDown: [...DEFAULT_KEY_BINDINGS.shiftDown],
    shiftUp: [...DEFAULT_KEY_BINDINGS.shiftUp],
    restartLap: [...DEFAULT_KEY_BINDINGS.restartLap],
  }
}

// Look up which action (if any) a KeyboardEvent.code is bound to. First match
// wins, so if a code appears in two actions only the first action fires.
export function actionForCode(
  bindings: KeyBindings,
  code: string,
): ControlAction | null {
  for (const action of CONTROL_ACTIONS) {
    if (bindings[action].includes(code)) return action
  }
  return null
}

// Replace whichever action currently holds `code` (if any) and assign `code`
// to `target`. Each code maps to at most one action across the whole set.
// Returns a fresh KeyBindings object.
export function rebindKey(
  bindings: KeyBindings,
  target: ControlAction,
  slot: number,
  code: string,
): KeyBindings {
  const next = cloneBindings(bindings)
  for (const action of CONTROL_ACTIONS) {
    next[action] = next[action].filter((c) => c !== code)
  }
  const list = next[target]
  while (list.length <= slot) list.push('')
  list[slot] = code
  next[target] = list.filter((c) => c.length > 0)
  return next
}

export function clearBinding(
  bindings: KeyBindings,
  target: ControlAction,
  slot: number,
): KeyBindings {
  const next = cloneBindings(bindings)
  if (slot >= 0 && slot < next[target].length) {
    next[target] = next[target].filter((_, i) => i !== slot)
  }
  return next
}

export function cloneBindings(bindings: KeyBindings): KeyBindings {
  return {
    forward: [...bindings.forward],
    backward: [...bindings.backward],
    left: [...bindings.left],
    right: [...bindings.right],
    handbrake: [...bindings.handbrake],
    shiftDown: [...bindings.shiftDown],
    shiftUp: [...bindings.shiftUp],
    restartLap: [...bindings.restartLap],
  }
}

export function readStoredControlSettings(): ControlSettings {
  if (typeof window === 'undefined') return cloneDefaultSettings()
  const raw = window.localStorage.getItem(CONTROL_SETTINGS_STORAGE_KEY)
  if (!raw) return cloneDefaultSettings()
  try {
    const parsed = ControlSettingsSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) return cloneDefaultSettings()
    return parsed.data
  } catch {
    return cloneDefaultSettings()
  }
}

export function writeStoredControlSettings(settings: ControlSettings): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(
    CONTROL_SETTINGS_STORAGE_KEY,
    JSON.stringify(settings),
  )
}

// Friendly label for a KeyboardEvent.code value. Keeps the Settings UI
// readable without a lookup table at the call site.
export function formatKeyCode(code: string): string {
  if (!code) return ''
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6)
  if (code.startsWith('Arrow')) return code.slice(5) + ' arrow'
  switch (code) {
    case 'Space':
      return 'Space'
    case 'ShiftLeft':
      return 'Left Shift'
    case 'ShiftRight':
      return 'Right Shift'
    case 'ControlLeft':
      return 'Left Ctrl'
    case 'ControlRight':
      return 'Right Ctrl'
    case 'AltLeft':
      return 'Left Alt'
    case 'AltRight':
      return 'Right Alt'
    case 'MetaLeft':
    case 'MetaRight':
      return 'Meta'
    case 'Enter':
      return 'Enter'
    case 'Tab':
      return 'Tab'
    case 'Backspace':
      return 'Backspace'
    case 'Escape':
      return 'Esc'
    case 'Backquote':
      return '`'
    case 'Minus':
      return '-'
    case 'Equal':
      return '='
    case 'BracketLeft':
      return '['
    case 'BracketRight':
      return ']'
    case 'Semicolon':
      return ';'
    case 'Quote':
      return "'"
    case 'Comma':
      return ','
    case 'Period':
      return '.'
    case 'Slash':
      return '/'
    case 'Backslash':
      return '\\'
    default:
      return code
  }
}

export const ACTION_LABELS: Record<ControlAction, string> = {
  forward: 'Accelerate',
  backward: 'Brake / reverse',
  left: 'Steer left',
  right: 'Steer right',
  handbrake: 'Handbrake',
  shiftDown: 'Shift down',
  shiftUp: 'Shift up',
  restartLap: 'Restart lap',
}

export const GAMEPAD_ACTION_LABELS: Record<GamepadAction, string> = {
  forward: 'Accelerate',
  backward: 'Brake / reverse',
  handbrake: 'Handbrake',
  shiftDown: 'Shift down',
  shiftUp: 'Shift up',
  pause: 'Pause',
}

// Friendly label for a Standard Gamepad button index. Names follow Xbox
// conventions because that is the layout most browser docs assume; PlayStation
// and Switch users will recognize the position even when the glyph differs.
export function formatGamepadButton(index: number): string {
  switch (index) {
    case 0:
      return 'A / Cross'
    case 1:
      return 'B / Circle'
    case 2:
      return 'X / Square'
    case 3:
      return 'Y / Triangle'
    case 4:
      return 'LB'
    case 5:
      return 'RB'
    case 6:
      return 'LT'
    case 7:
      return 'RT'
    case 8:
      return 'Back / Select'
    case 9:
      return 'Start'
    case 10:
      return 'L3 (stick)'
    case 11:
      return 'R3 (stick)'
    case 12:
      return 'Dpad up'
    case 13:
      return 'Dpad down'
    case 14:
      return 'Dpad left'
    case 15:
      return 'Dpad right'
    case 16:
      return 'Home'
    default:
      return `Button ${index}`
  }
}
