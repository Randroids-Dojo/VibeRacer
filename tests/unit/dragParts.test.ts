import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DRAG_LOADOUT,
  DRAG_BODIES,
  DRAG_ENGINES,
  DRAG_TIRES,
  DRAG_TRANSMISSIONS,
  DragLoadoutSchema,
  findBody,
  findEngine,
  findTire,
  findTransmission,
  resolveLoadout,
} from '@/lib/dragParts'

describe('drag parts catalog', () => {
  it('exposes at least four parts in every category', () => {
    expect(DRAG_TIRES.length).toBeGreaterThanOrEqual(4)
    expect(DRAG_BODIES.length).toBeGreaterThanOrEqual(4)
    expect(DRAG_ENGINES.length).toBeGreaterThanOrEqual(4)
    expect(DRAG_TRANSMISSIONS.length).toBeGreaterThanOrEqual(4)
  })

  it('has unique ids in every category', () => {
    for (const catalog of [
      DRAG_TIRES,
      DRAG_BODIES,
      DRAG_ENGINES,
      DRAG_TRANSMISSIONS,
    ]) {
      const ids = new Set(catalog.map((p) => p.id))
      expect(ids.size).toBe(catalog.length)
    }
  })

  it('has positive weights and finite stats on every part', () => {
    for (const t of DRAG_TIRES) {
      expect(t.weight).toBeGreaterThan(0)
      expect(t.baseGrip).toBeGreaterThan(0)
      for (const v of Object.values(t.surfaceAffinity)) {
        expect(Number.isFinite(v)).toBe(true)
        expect(v).toBeGreaterThan(0)
      }
    }
    for (const b of DRAG_BODIES) {
      expect(b.weight).toBeGreaterThan(0)
      expect(b.dragCoefficient).toBeGreaterThan(0)
    }
    for (const e of DRAG_ENGINES) {
      expect(e.weight).toBeGreaterThan(0)
      expect(e.launchRpm).toBeGreaterThan(0)
      expect(e.peakPower).toBeGreaterThan(0)
    }
    for (const tr of DRAG_TRANSMISSIONS) {
      expect(tr.weight).toBeGreaterThan(0)
      expect(tr.firstGearRatio).toBeGreaterThan(0)
      expect(tr.topGearRatio).toBeGreaterThan(0)
    }
  })

  it('default loadout references valid catalog ids', () => {
    expect(DRAG_TIRES.some((t) => t.id === DEFAULT_DRAG_LOADOUT.tire)).toBe(true)
    expect(DRAG_BODIES.some((b) => b.id === DEFAULT_DRAG_LOADOUT.body)).toBe(true)
    expect(DRAG_ENGINES.some((e) => e.id === DEFAULT_DRAG_LOADOUT.engine)).toBe(true)
    expect(
      DRAG_TRANSMISSIONS.some((t) => t.id === DEFAULT_DRAG_LOADOUT.transmission),
    ).toBe(true)
  })

  it('parses the default loadout through the schema', () => {
    const parsed = DragLoadoutSchema.parse(DEFAULT_DRAG_LOADOUT)
    expect(parsed).toEqual(DEFAULT_DRAG_LOADOUT)
  })

  it('rejects malformed loadouts', () => {
    expect(() => DragLoadoutSchema.parse({})).toThrow()
    expect(() =>
      DragLoadoutSchema.parse({ ...DEFAULT_DRAG_LOADOUT, paint: 'red' }),
    ).toThrow()
  })

  it('finds parts by id and falls back safely on unknown ids', () => {
    expect(findTire(DRAG_TIRES[0].id)).toEqual(DRAG_TIRES[0])
    expect(findBody(DRAG_BODIES[0].id)).toEqual(DRAG_BODIES[0])
    expect(findEngine(DRAG_ENGINES[0].id)).toEqual(DRAG_ENGINES[0])
    expect(findTransmission(DRAG_TRANSMISSIONS[0].id)).toEqual(DRAG_TRANSMISSIONS[0])
    expect(findTire('definitely-not-a-tire')).toBeDefined()
    expect(findEngine('not-real')).toBeDefined()
  })

  it('resolves a loadout into the full part objects', () => {
    const resolved = resolveLoadout(DEFAULT_DRAG_LOADOUT)
    expect(resolved.tire.id).toBe(DEFAULT_DRAG_LOADOUT.tire)
    expect(resolved.body.id).toBe(DEFAULT_DRAG_LOADOUT.body)
    expect(resolved.engine.id).toBe(DEFAULT_DRAG_LOADOUT.engine)
    expect(resolved.transmission.id).toBe(DEFAULT_DRAG_LOADOUT.transmission)
    expect(resolved.paint).toBeNull()
    expect(resolved.racingNumber).toBeNull()
  })
})
