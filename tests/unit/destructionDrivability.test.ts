import { describe, expect, it } from 'vitest'
import {
  derive,
  fireIntensity,
  IDENTITY_DRIVABILITY,
  smokeIntensity,
} from '@/game/destruction/drivability'
import { initAllPanels } from '@/game/destruction/panels'

describe('derive', () => {
  it('returns identity for an untouched car', () => {
    const panels = initAllPanels()
    const d = derive(panels)
    expect(d.accelFactor).toBeCloseTo(IDENTITY_DRIVABILITY.accelFactor, 6)
    expect(d.maxSpeedFactor).toBeCloseTo(IDENTITY_DRIVABILITY.maxSpeedFactor, 6)
    expect(d.steerBias).toBeCloseTo(0, 6)
    expect(d.stalled).toBe(false)
  })

  it('stalls when engine HP hits zero', () => {
    const panels = initAllPanels()
    panels.engine.hp = 0
    const d = derive(panels)
    expect(d.stalled).toBe(true)
    expect(d.accelFactor).toBeCloseTo(0, 6)
  })

  it('biases steer right when door_r is damaged', () => {
    const panels = initAllPanels()
    panels.door_r.hp = 0
    const d = derive(panels)
    expect(d.steerBias).toBeLessThan(0)
  })

  it('biases steer left when door_l is damaged', () => {
    const panels = initAllPanels()
    panels.door_l.hp = 0
    const d = derive(panels)
    expect(d.steerBias).toBeGreaterThan(0)
  })

  it('drops max-speed-factor as the body wears down', () => {
    const panels = initAllPanels()
    panels.body.hp = 0
    const d = derive(panels)
    expect(d.maxSpeedFactor).toBeLessThan(IDENTITY_DRIVABILITY.maxSpeedFactor)
    expect(d.maxSpeedFactor).toBeGreaterThan(0)
  })

  it('drops accel-factor as the hood wears down', () => {
    const panels = initAllPanels()
    panels.hood.hp = 0
    const d = derive(panels)
    // Hood at zero with full engine still leaves a floor of accel.
    expect(d.accelFactor).toBeLessThan(IDENTITY_DRIVABILITY.accelFactor)
    expect(d.accelFactor).toBeGreaterThan(0)
  })
})

describe('smokeIntensity', () => {
  it('is zero on a pristine car', () => {
    const panels = initAllPanels()
    expect(smokeIntensity(panels)).toBe(0)
  })
  it('ramps as the engine HP drops', () => {
    const panels = initAllPanels()
    panels.engine.hp = panels.engine.hp * 0.1
    expect(smokeIntensity(panels)).toBeGreaterThan(0.5)
  })
  it('is non-zero on heavy hood damage even if engine is fine', () => {
    const panels = initAllPanels()
    panels.hood.hp = panels.hood.hp * 0.1
    expect(smokeIntensity(panels)).toBeGreaterThan(0)
  })
})

describe('fireIntensity', () => {
  it('is zero with engine HP > 0', () => {
    const panels = initAllPanels()
    expect(fireIntensity(panels)).toBe(0)
  })
  it('is one with engine HP at zero', () => {
    const panels = initAllPanels()
    panels.engine.hp = 0
    expect(fireIntensity(panels)).toBe(1)
  })
})
