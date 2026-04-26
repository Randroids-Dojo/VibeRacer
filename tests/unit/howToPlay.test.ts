import { describe, it, expect } from 'vitest'
import {
  HOW_TO_PLAY_GAMEPAD_ORDER,
  HOW_TO_PLAY_GOAL_BODY,
  HOW_TO_PLAY_GOAL_TITLE,
  HOW_TO_PLAY_KEYBOARD_ORDER,
  HOW_TO_PLAY_TIPS,
  buildGamepadHelpRows,
  buildKeyboardHelpRows,
  buildTouchHelp,
  continuousActionsHaveLabels,
  gamepadHelpOrderCoversAllActions,
  howToPlayKeyboardOrderCoversAllActions,
} from '@/lib/howToPlay'
import {
  ACTION_LABELS,
  CONTROL_ACTIONS,
  DEFAULT_GAMEPAD_BINDINGS,
  DEFAULT_KEY_BINDINGS,
  GAMEPAD_ACTIONS,
  GAMEPAD_ACTION_LABELS,
  cloneBindings,
  cloneDefaultGamepadBindings,
} from '@/lib/controlSettings'

describe('HOW_TO_PLAY_KEYBOARD_ORDER', () => {
  it('covers every CONTROL_ACTIONS entry exactly once', () => {
    expect(howToPlayKeyboardOrderCoversAllActions()).toBe(true)
    expect(HOW_TO_PLAY_KEYBOARD_ORDER.length).toBe(CONTROL_ACTIONS.length)
    const seen = new Set(HOW_TO_PLAY_KEYBOARD_ORDER)
    expect(seen.size).toBe(HOW_TO_PLAY_KEYBOARD_ORDER.length)
  })

  it('lists driving actions before the restart-lap one-shot', () => {
    const restartIdx = HOW_TO_PLAY_KEYBOARD_ORDER.indexOf('restartLap')
    expect(restartIdx).toBe(HOW_TO_PLAY_KEYBOARD_ORDER.length - 1)
    expect(restartIdx).toBeGreaterThan(0)
  })
})

describe('buildKeyboardHelpRows', () => {
  it('returns one row per action in display order', () => {
    const rows = buildKeyboardHelpRows(DEFAULT_KEY_BINDINGS)
    expect(rows).toHaveLength(HOW_TO_PLAY_KEYBOARD_ORDER.length)
    rows.forEach((row, i) => {
      expect(row.action).toBe(HOW_TO_PLAY_KEYBOARD_ORDER[i])
      expect(row.label).toBe(ACTION_LABELS[row.action])
    })
  })

  it('formats default WASD + arrow bindings into friendly key names', () => {
    const rows = buildKeyboardHelpRows(DEFAULT_KEY_BINDINGS)
    const forward = rows.find((r) => r.action === 'forward')
    expect(forward).toBeDefined()
    expect(forward!.keys).toEqual(['W', 'Up arrow'])
    const handbrake = rows.find((r) => r.action === 'handbrake')
    expect(handbrake!.keys).toEqual(['Space'])
    const restart = rows.find((r) => r.action === 'restartLap')
    expect(restart!.keys).toEqual(['R'])
  })

  it('reflects a remapped binding in the keys cell', () => {
    const remapped = cloneBindings(DEFAULT_KEY_BINDINGS)
    remapped.forward = ['KeyE']
    const rows = buildKeyboardHelpRows(remapped)
    const forward = rows.find((r) => r.action === 'forward')
    expect(forward!.keys).toEqual(['E'])
  })

  it('returns an empty key list when an action has no bindings', () => {
    const cleared = cloneBindings(DEFAULT_KEY_BINDINGS)
    cleared.handbrake = []
    const rows = buildKeyboardHelpRows(cleared)
    const handbrake = rows.find((r) => r.action === 'handbrake')
    expect(handbrake!.keys).toEqual([])
  })

  it('drops blank string entries defensively', () => {
    const dirty = cloneBindings(DEFAULT_KEY_BINDINGS)
    dirty.left = ['', 'KeyA']
    const rows = buildKeyboardHelpRows(dirty)
    const left = rows.find((r) => r.action === 'left')
    expect(left!.keys).toEqual(['A'])
  })

  it('survives a missing per-action array (treats as empty)', () => {
    // Simulate a corrupted bindings object with one slot stripped out.
    const bad = cloneBindings(DEFAULT_KEY_BINDINGS)
    // @ts-expect-error - exercising the defensive fallback when an action is missing
    delete bad.right
    const rows = buildKeyboardHelpRows(bad)
    const right = rows.find((r) => r.action === 'right')
    expect(right!.keys).toEqual([])
  })
})

describe('HOW_TO_PLAY_GAMEPAD_ORDER', () => {
  it('covers every GAMEPAD_ACTIONS entry exactly once', () => {
    expect(gamepadHelpOrderCoversAllActions()).toBe(true)
    expect(HOW_TO_PLAY_GAMEPAD_ORDER.length).toBe(GAMEPAD_ACTIONS.length)
    const seen = new Set(HOW_TO_PLAY_GAMEPAD_ORDER)
    expect(seen.size).toBe(HOW_TO_PLAY_GAMEPAD_ORDER.length)
  })
})

describe('buildGamepadHelpRows', () => {
  it('returns one row per gamepad action in display order with friendly labels', () => {
    const rows = buildGamepadHelpRows(DEFAULT_GAMEPAD_BINDINGS)
    expect(rows).toHaveLength(HOW_TO_PLAY_GAMEPAD_ORDER.length)
    rows.forEach((row, i) => {
      expect(row.action).toBe(HOW_TO_PLAY_GAMEPAD_ORDER[i])
      expect(row.label).toBe(GAMEPAD_ACTION_LABELS[row.action])
    })
  })

  it('translates default indices to glyph names', () => {
    const rows = buildGamepadHelpRows(DEFAULT_GAMEPAD_BINDINGS)
    const forward = rows.find((r) => r.action === 'forward')
    expect(forward!.buttons).toEqual(['RT', 'A / Cross'])
    const pause = rows.find((r) => r.action === 'pause')
    expect(pause!.buttons).toEqual(['Start'])
  })

  it('drops negative or non-finite indices defensively', () => {
    const dirty = cloneDefaultGamepadBindings()
    dirty.handbrake = [-1, 5, Number.NaN]
    const rows = buildGamepadHelpRows(dirty)
    const handbrake = rows.find((r) => r.action === 'handbrake')
    expect(handbrake!.buttons).toEqual(['RB'])
  })

  it('returns an empty button list when an action has no bindings', () => {
    const cleared = cloneDefaultGamepadBindings()
    cleared.pause = []
    const rows = buildGamepadHelpRows(cleared)
    const pause = rows.find((r) => r.action === 'pause')
    expect(pause!.buttons).toEqual([])
  })

  it('survives a missing per-action array', () => {
    const bad = cloneDefaultGamepadBindings()
    // @ts-expect-error - exercising the defensive fallback
    delete bad.forward
    const rows = buildGamepadHelpRows(bad)
    const forward = rows.find((r) => r.action === 'forward')
    expect(forward!.buttons).toEqual([])
  })
})

describe('buildTouchHelp', () => {
  it('returns the single-stick blurb for "single"', () => {
    const help = buildTouchHelp('single')
    expect(help.modeLabel.toLowerCase()).toContain('single')
    expect(help.bullets.length).toBeGreaterThan(0)
    expect(help.intro).toContain('steers')
    // pause button reference so a player can always find their way out.
    expect(help.bullets.some((b) => b.toLowerCase().includes('pause'))).toBe(
      true,
    )
  })

  it('returns the dual-stick blurb for "dual"', () => {
    const help = buildTouchHelp('dual')
    expect(help.modeLabel.toLowerCase()).toContain('dual')
    expect(help.bullets.length).toBeGreaterThan(0)
    expect(help.bullets.some((b) => b.toLowerCase().includes('right'))).toBe(
      true,
    )
    expect(help.bullets.some((b) => b.toLowerCase().includes('left'))).toBe(
      true,
    )
    expect(help.bullets.some((b) => b.toLowerCase().includes('pause'))).toBe(
      true,
    )
  })

  it('returns distinct text for the two modes', () => {
    const single = buildTouchHelp('single')
    const dual = buildTouchHelp('dual')
    expect(single.modeLabel).not.toBe(dual.modeLabel)
    expect(single.intro).not.toBe(dual.intro)
  })
})

describe('static help copy', () => {
  it('exposes a non-empty goal title and body', () => {
    expect(HOW_TO_PLAY_GOAL_TITLE.length).toBeGreaterThan(0)
    expect(HOW_TO_PLAY_GOAL_BODY.length).toBeGreaterThan(0)
  })

  it('ships at least a handful of pro tips', () => {
    expect(HOW_TO_PLAY_TIPS.length).toBeGreaterThanOrEqual(3)
    for (const tip of HOW_TO_PLAY_TIPS) {
      expect(typeof tip).toBe('string')
      expect(tip.length).toBeGreaterThan(0)
    }
  })

  it('does not reference em-dashes anywhere in the static copy', () => {
    const blob = [
      HOW_TO_PLAY_GOAL_TITLE,
      HOW_TO_PLAY_GOAL_BODY,
      ...HOW_TO_PLAY_TIPS,
      buildTouchHelp('single').intro,
      ...buildTouchHelp('single').bullets,
      buildTouchHelp('dual').intro,
      ...buildTouchHelp('dual').bullets,
    ].join('\n')
    expect(blob.includes('—')).toBe(false)
    expect(blob.includes('–')).toBe(false)
  })
})

describe('continuousActionsHaveLabels', () => {
  it('returns true with the shipped ACTION_LABELS map', () => {
    expect(continuousActionsHaveLabels()).toBe(true)
  })
})
