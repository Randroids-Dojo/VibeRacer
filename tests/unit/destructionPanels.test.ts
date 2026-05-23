import { describe, expect, it } from 'vitest'
import {
  applyPanelDamage,
  engineBleedFor,
  fractionOf,
  initAllPanels,
  initPanelState,
  PANELS,
} from '@/game/destruction/panels'

describe('initPanelState', () => {
  it('starts every panel at full HP, undetached', () => {
    for (const id of Object.keys(PANELS) as Array<keyof typeof PANELS>) {
      const state = initPanelState(id)
      expect(state.id).toBe(id)
      expect(state.hp).toBe(PANELS[id].maxHp)
      expect(state.detached).toBe(false)
      expect(state.hits).toBe(0)
    }
  })
})

describe('applyPanelDamage', () => {
  it('subtracts damage and clamps at zero', () => {
    const state = initPanelState('hood')
    const r = applyPanelDamage(state, 1000)
    expect(state.hp).toBe(0)
    expect(r.damageDealt).toBe(PANELS.hood.maxHp)
    expect(r.justDetached).toBe(true)
  })

  it('reports a fresh detach exactly once', () => {
    const state = initPanelState('door_l')
    state.hp = 5
    const first = applyPanelDamage(state, 10)
    expect(first.justDetached).toBe(true)
    expect(state.detached).toBe(true)
    const second = applyPanelDamage(state, 10)
    expect(second.justDetached).toBe(false)
    expect(second.damageDealt).toBe(0)
  })

  it('ignores negative and non-finite damage', () => {
    const state = initPanelState('body')
    applyPanelDamage(state, -50)
    expect(state.hp).toBe(PANELS.body.maxHp)
    applyPanelDamage(state, Number.NaN)
    expect(state.hp).toBe(PANELS.body.maxHp)
  })

  it('engine never reports justDetached', () => {
    const panels = initAllPanels()
    const r = applyPanelDamage(panels.engine, 10000)
    expect(r.justDetached).toBe(false)
    expect(panels.engine.detached).toBe(false)
    expect(panels.engine.hp).toBe(0)
  })
})

describe('fractionOf', () => {
  it('is 1 at full HP', () => {
    const state = initPanelState('hood')
    expect(fractionOf(state)).toBeCloseTo(1, 6)
  })
  it('is 0 at zero HP', () => {
    const state = initPanelState('hood')
    state.hp = 0
    expect(fractionOf(state)).toBe(0)
  })
})

describe('engineBleedFor', () => {
  it('bleeds a fraction of hood damage', () => {
    expect(engineBleedFor('hood', 20)).toBeCloseTo(7, 1)
  })
  it('does not bleed from doors or trunk', () => {
    expect(engineBleedFor('door_l', 100)).toBe(0)
    expect(engineBleedFor('door_r', 100)).toBe(0)
    expect(engineBleedFor('trunk', 100)).toBe(0)
  })
  it('forwards direct engine damage at full magnitude', () => {
    expect(engineBleedFor('engine', 10)).toBe(10)
  })
})
