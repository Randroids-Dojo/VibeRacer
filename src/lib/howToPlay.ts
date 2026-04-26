// Pure data + helpers backing the "How to Play" overlay. Kept separate from the
// React component so the strings and the keyboard-binding-to-display formatter
// can be unit-tested without rendering anything.
//
// Design notes:
//
// - Keyboard rows are derived live from the player's current `KeyBindings` so
//   the overlay always matches what the game actually responds to (no stale
//   hardcoded `WASD` after the player remaps to ESDF).
// - Touch rows depend on the active `TouchMode` (single-stick vs dual-stick)
//   because the gestures differ enough that one shared blurb would mislead.
// - Gamepad rows are the labels of whatever indices the player has bound in
//   `GamepadBindings`. The library `formatGamepadButton` already handles index
//   to glyph names so we just join the labels per action.
// - Pro tips are static design-flavored bullets that point at non-obvious
//   mechanics (drift score, racing line overlay, ghost car, restart lap key)
//   so a returning player who ignored Settings can discover them too.

import {
  ACTION_LABELS,
  CONTINUOUS_CONTROL_ACTIONS,
  CONTROL_ACTIONS,
  GAMEPAD_ACTIONS,
  GAMEPAD_ACTION_LABELS,
  formatGamepadButton,
  formatKeyCode,
  type ControlAction,
  type GamepadAction,
  type GamepadBindings,
  type KeyBindings,
  type TouchMode,
} from './controlSettings'

// Display order for the keyboard table. Drives the order rows appear in the
// overlay so the most-used actions land at the top. `restartLap` is grouped
// at the bottom because it is a one-shot "in case of emergency" key.
export const HOW_TO_PLAY_KEYBOARD_ORDER: readonly ControlAction[] = [
  'forward',
  'backward',
  'left',
  'right',
  'handbrake',
  'restartLap',
] as const

// Sanity invariant: the display order covers exactly the same set of actions
// as `CONTROL_ACTIONS`. Keeps the help table in sync with the bindings if a
// future action lands.
export function howToPlayKeyboardOrderCoversAllActions(): boolean {
  if (HOW_TO_PLAY_KEYBOARD_ORDER.length !== CONTROL_ACTIONS.length) return false
  for (const action of CONTROL_ACTIONS) {
    if (!HOW_TO_PLAY_KEYBOARD_ORDER.includes(action)) return false
  }
  return true
}

export interface HelpRow {
  action: ControlAction
  label: string
  // One or more friendly key names ("W", "Up arrow", "Space"). Empty array
  // means the player cleared every binding for this action; the UI surfaces
  // a placeholder rather than an empty cell.
  keys: string[]
}

// Convert the player's stored bindings into a friendly row list. Rows match
// the display order above and use `formatKeyCode` for the keycap labels so the
// overlay reads like the in-app Settings pane.
export function buildKeyboardHelpRows(bindings: KeyBindings): HelpRow[] {
  const rows: HelpRow[] = []
  for (const action of HOW_TO_PLAY_KEYBOARD_ORDER) {
    const codes = bindings[action] ?? []
    const keys = codes
      .filter((c) => typeof c === 'string' && c.length > 0)
      .map((c) => formatKeyCode(c))
    rows.push({ action, label: ACTION_LABELS[action], keys })
  }
  return rows
}

export interface GamepadHelpRow {
  action: GamepadAction
  label: string
  buttons: string[]
}

// Same shape as `buildKeyboardHelpRows` for the gamepad side: per-action rows
// with the friendly button labels of every bound index. The steering stick is
// not user-rebindable so it stays out of this table; the overlay surfaces a
// note alongside.
export const HOW_TO_PLAY_GAMEPAD_ORDER: readonly GamepadAction[] = [
  'forward',
  'backward',
  'handbrake',
  'pause',
] as const

export function gamepadHelpOrderCoversAllActions(): boolean {
  if (HOW_TO_PLAY_GAMEPAD_ORDER.length !== GAMEPAD_ACTIONS.length) return false
  for (const action of GAMEPAD_ACTIONS) {
    if (!HOW_TO_PLAY_GAMEPAD_ORDER.includes(action)) return false
  }
  return true
}

export function buildGamepadHelpRows(
  bindings: GamepadBindings,
): GamepadHelpRow[] {
  const rows: GamepadHelpRow[] = []
  for (const action of HOW_TO_PLAY_GAMEPAD_ORDER) {
    const indices = bindings[action] ?? []
    const buttons = indices
      .filter((i) => Number.isFinite(i) && i >= 0)
      .map((i) => formatGamepadButton(i))
    rows.push({ action, label: GAMEPAD_ACTION_LABELS[action], buttons })
  }
  return rows
}

export interface TouchHelp {
  // Title for the section header. Tells the player which mode they are in so
  // a switch in Settings is reflected in the help text.
  modeLabel: string
  // Short paragraph describing how the chosen layout works.
  intro: string
  // Bullet rows describing each gesture or virtual control.
  bullets: string[]
}

export function buildTouchHelp(mode: TouchMode): TouchHelp {
  if (mode === 'single') {
    return {
      modeLabel: 'Single-stick (default)',
      intro:
        'One floating stick steers the car. The throttle and brake are automatic: tap forward on the stick to accelerate, pull back to brake or reverse.',
      bullets: [
        'Tap-and-drag anywhere on the screen to spawn the steering stick.',
        'Push the stick forward to accelerate, pull back to brake or reverse.',
        'Steer left or right by tilting the stick sideways.',
        'Tap the pause button (bottom-left) to open the menu.',
      ],
    }
  }
  return {
    modeLabel: 'Dual-stick',
    intro:
      'A throttle stick on the right and a steering stick on the left. Use both thumbs at once for finer control.',
    bullets: [
      'Right-side stick: push up to accelerate, pull down to brake or reverse.',
      'Left-side stick: tilt left or right to steer.',
      'Both sticks float to wherever you first touch on their half of the screen.',
      'Tap the pause button (bottom-left) to open the menu.',
    ],
  }
}

// Goal blurb for the top of the overlay. Static copy; surfaces the core loop
// (race a track, beat your time) so a brand-new player gets the elevator pitch
// without having to read the GDD.
export const HOW_TO_PLAY_GOAL_TITLE = 'The goal'
export const HOW_TO_PLAY_GOAL_BODY =
  'Drive the track as fast as you can. Each lap is a fresh attempt. Crossing the finish line submits your time to the leaderboard automatically. Beat your personal best, then chase the track record.'

// Tips list. Pure strings so any UI can render them in any layout. Each tip
// surfaces a non-obvious mechanic that a fresh player might miss.
export const HOW_TO_PLAY_TIPS: readonly string[] = [
  'Hold the handbrake through tight corners to slide. Drift score racks up while you slide.',
  'Press R (or use Restart Lap in the pause menu) to abandon a botched lap without sitting through the countdown.',
  'A translucent ghost car replays the leaderboard top time so you have a moving target. Toggle in Settings.',
  'Turn on the racing-line overlay in Settings to see the recommended path through the track.',
  'Change time of day, weather, and your car paint in Settings. None of it affects lap times.',
  'Open Setup in the pause menu to tune your car (top speed, accel, grip). Each lap submits your tuning so other players can try it.',
] as const

// Sanity invariant: every continuous driving action should have a friendly
// label so the keyboard table never shows a blank action name.
export function continuousActionsHaveLabels(): boolean {
  for (const action of CONTINUOUS_CONTROL_ACTIONS) {
    const label = ACTION_LABELS[action]
    if (typeof label !== 'string' || label.length === 0) return false
  }
  return true
}
