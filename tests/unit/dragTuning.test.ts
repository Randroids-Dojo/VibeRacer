import { describe, expect, it } from 'vitest'
import {
  GRAVITY,
  REFERENCE_WEIGHT_KG,
  deriveDragCarParams,
  slopeAccel,
} from '@/game/dragTuning'
import {
  DEFAULT_DRAG_LOADOUT,
  DRAG_BODIES,
  DRAG_ENGINES,
  DRAG_TIRES,
  DRAG_TRANSMISSIONS,
  type DragLoadout,
} from '@/lib/dragParts'
import { ALL_DRAG_STRIPS, DRAG_STRIPS } from '@/lib/dragStrips'

function withTire(loadout: DragLoadout, tireId: string): DragLoadout {
  return { ...loadout, tire: tireId }
}
function withBody(loadout: DragLoadout, bodyId: string): DragLoadout {
  return { ...loadout, body: bodyId }
}
function withEngine(loadout: DragLoadout, engineId: string): DragLoadout {
  return { ...loadout, engine: engineId }
}
function withTransmission(
  loadout: DragLoadout,
  transmissionId: string,
): DragLoadout {
  return { ...loadout, transmission: transmissionId }
}

describe('deriveDragCarParams', () => {
  const strip = DRAG_STRIPS['salt-flats']

  it('returns finite, sane values for the default loadout', () => {
    const { params, launch, derivation } = deriveDragCarParams(
      DEFAULT_DRAG_LOADOUT,
      strip,
    )
    expect(Number.isFinite(params.accel)).toBe(true)
    expect(Number.isFinite(params.maxSpeed)).toBe(true)
    expect(params.accel).toBeGreaterThan(0)
    expect(params.maxSpeed).toBeGreaterThan(0)
    expect(params.maxReverseSpeed).toBe(0)
    expect(params.reverseAccel).toBe(0)
    expect(params.steerRateLow).toBeGreaterThan(0)
    expect(params.steerRateHigh).toBeGreaterThan(0)
    expect(params.steerRateLow).toBeLessThan(2.2)
    expect(launch.jumpStartAccelFactor).toBeLessThan(1)
    expect(derivation.surfaceMul).toBeGreaterThan(0)
  })

  it('heavier body strictly reduces accel on every strip', () => {
    for (const stripCfg of ALL_DRAG_STRIPS) {
      const light = deriveDragCarParams(
        withBody(DEFAULT_DRAG_LOADOUT, 'lightweight'),
        stripCfg,
      ).params.accel
      const heavy = deriveDragCarParams(
        withBody(DEFAULT_DRAG_LOADOUT, 'reinforced'),
        stripCfg,
      ).params.accel
      expect(heavy).toBeLessThan(light)
    }
  })

  it('higher launch RPM strictly increases accel', () => {
    const eco = deriveDragCarParams(
      withEngine(DEFAULT_DRAG_LOADOUT, 'eco'),
      strip,
    ).params.accel
    const race = deriveDragCarParams(
      withEngine(DEFAULT_DRAG_LOADOUT, 'race'),
      strip,
    ).params.accel
    expect(race).toBeGreaterThan(eco)
  })

  it('shorter (numerically higher) first gear gives stronger off-line accel', () => {
    const shortGear = deriveDragCarParams(
      withTransmission(DEFAULT_DRAG_LOADOUT, 'short'),
      strip,
    ).params.accel
    const longGear = deriveDragCarParams(
      withTransmission(DEFAULT_DRAG_LOADOUT, 'long'),
      strip,
    ).params.accel
    expect(shortGear).toBeGreaterThan(longGear)
  })

  it('overdrive (lower top gear ratio) gives higher max speed', () => {
    const standardTop = deriveDragCarParams(
      withTransmission(DEFAULT_DRAG_LOADOUT, 'standard'),
      strip,
    ).params.maxSpeed
    const longTop = deriveDragCarParams(
      withTransmission(DEFAULT_DRAG_LOADOUT, 'long'),
      strip,
    ).params.maxSpeed
    expect(longTop).toBeGreaterThan(standardTop)
  })

  it('surface multiplier always lands in [0.5, 1.3]', () => {
    for (const tire of DRAG_TIRES) {
      for (const stripCfg of ALL_DRAG_STRIPS) {
        const { derivation } = deriveDragCarParams(
          withTire(DEFAULT_DRAG_LOADOUT, tire.id),
          stripCfg,
        )
        expect(derivation.surfaceMul).toBeGreaterThanOrEqual(0.5)
        expect(derivation.surfaceMul).toBeLessThanOrEqual(1.3)
      }
    }
  })

  it('slick tires perform worse in the rain than rain tires do', () => {
    const harbor = DRAG_STRIPS['harbor-night']
    const slickAccel = deriveDragCarParams(
      withTire(DEFAULT_DRAG_LOADOUT, 'slick'),
      harbor,
    ).params.accel
    const rainAccel = deriveDragCarParams(
      withTire(DEFAULT_DRAG_LOADOUT, 'rain'),
      harbor,
    ).params.accel
    expect(rainAccel).toBeGreaterThan(slickAccel)
  })

  it('winter tires win on Alpine snow over slicks', () => {
    const alpine = DRAG_STRIPS['alpine-pass']
    const slickAccel = deriveDragCarParams(
      withTire(DEFAULT_DRAG_LOADOUT, 'slick'),
      alpine,
    ).params.accel
    const winterAccel = deriveDragCarParams(
      withTire(DEFAULT_DRAG_LOADOUT, 'winter'),
      alpine,
    ).params.accel
    expect(winterAccel).toBeGreaterThan(slickAccel)
  })

  it('produces no NaNs and no Infinities across the full catalog x strip matrix', () => {
    let combos = 0
    for (const tire of DRAG_TIRES) {
      for (const body of DRAG_BODIES) {
        for (const engine of DRAG_ENGINES) {
          for (const tr of DRAG_TRANSMISSIONS) {
            for (const stripCfg of ALL_DRAG_STRIPS) {
              const loadout: DragLoadout = {
                tire: tire.id,
                body: body.id,
                engine: engine.id,
                transmission: tr.id,
              }
              const { params, launch, derivation } = deriveDragCarParams(
                loadout,
                stripCfg,
              )
              for (const v of [
                params.accel,
                params.maxSpeed,
                params.brake,
                params.offTrackMaxSpeed,
                params.steerRateLow,
                params.steerRateHigh,
                launch.jumpStartAccelFactor,
                launch.decayPerSec,
                launch.minDuration,
                derivation.totalAccel,
                derivation.totalMaxSpeed,
                derivation.surfaceMul,
                derivation.weightFactor,
                derivation.rpmFactor,
                derivation.firstGearFactor,
                derivation.topGearFactor,
                derivation.massForSlope,
              ]) {
                expect(Number.isFinite(v)).toBe(true)
              }
              combos++
            }
          }
        }
      }
    }
    expect(combos).toBe(
      DRAG_TIRES.length *
        DRAG_BODIES.length *
        DRAG_ENGINES.length *
        DRAG_TRANSMISSIONS.length *
        ALL_DRAG_STRIPS.length,
    )
  })
})

describe('slopeAccel', () => {
  it('returns zero for a flat slope', () => {
    expect(slopeAccel(0, REFERENCE_WEIGHT_KG)).toBe(0)
  })

  it('decelerates the car on uphill (positive pitch)', () => {
    const a = slopeAccel(0.1, REFERENCE_WEIGHT_KG)
    expect(a).toBeLessThan(0)
  })

  it('accelerates the car on downhill (negative pitch)', () => {
    const a = slopeAccel(-0.1, REFERENCE_WEIGHT_KG)
    expect(a).toBeGreaterThan(0)
  })

  it('scales linearly with mass against the reference weight', () => {
    const aLight = slopeAccel(0.1, REFERENCE_WEIGHT_KG / 2)
    const aHeavy = slopeAccel(0.1, REFERENCE_WEIGHT_KG * 2)
    expect(Math.abs(aHeavy)).toBeCloseTo(Math.abs(aLight) * 4, 6)
  })

  it('is approximately g * sin(pitch) for the reference mass', () => {
    expect(slopeAccel(0.5, REFERENCE_WEIGHT_KG)).toBeCloseTo(
      -GRAVITY * Math.sin(0.5),
      6,
    )
  })

  it('returns zero on non-finite inputs', () => {
    expect(slopeAccel(Number.NaN, REFERENCE_WEIGHT_KG)).toBe(0)
    expect(slopeAccel(Number.POSITIVE_INFINITY, REFERENCE_WEIGHT_KG)).toBe(0)
  })
})
