import { describe, it, expect } from 'vitest'
import {
  REPAIR_COST_PER_PERCENT,
  applyFullRepair,
  difficultyTierForCareer,
  nextRaceFor,
  repairCost,
} from '@/game/worldTourGarage'
import {
  defaultCareer,
  type WorldTourCareer,
} from '@/game/worldTourCareer'
import {
  STANDARD_CHAMPIONSHIP,
  VELVET_COAST_TOUR_ID,
} from '@/data/worldTourChampionship'

describe('repairCost', () => {
  it('returns 0 at zero damage', () => {
    expect(repairCost(0)).toBe(0)
  })

  it('returns 0 for non-finite damage', () => {
    expect(repairCost(NaN)).toBe(0)
    expect(repairCost(-1)).toBe(0)
  })

  it('charges the documented per-percent rate at the base tier', () => {
    expect(repairCost(1)).toBe(REPAIR_COST_PER_PERCENT * 100)
    expect(repairCost(0.5)).toBe(REPAIR_COST_PER_PERCENT * 50)
    expect(repairCost(0.2)).toBe(REPAIR_COST_PER_PERCENT * 20)
  })

  it('marks up the per-percent rate at higher difficulty tiers', () => {
    const base = repairCost(0.5, 0)
    const tierUp = repairCost(0.5, 1)
    expect(tierUp).toBeGreaterThan(base)
  })

  it('clamps damage above 1 to a full repair', () => {
    expect(repairCost(2)).toBe(repairCost(1))
  })

  it('ceils fractional credits up', () => {
    // 0.123 * 100 * 5 = 61.5 -> ceil to 62.
    expect(repairCost(0.123, 0)).toBe(62)
  })
})

describe('difficultyTierForCareer', () => {
  it('returns 0 when no tour is active', () => {
    expect(
      difficultyTierForCareer(STANDARD_CHAMPIONSHIP, defaultCareer()),
    ).toBe(0)
  })

  it('returns the index of the active tour inside the championship order', () => {
    const career: WorldTourCareer = {
      ...defaultCareer(),
      activeTour: {
        tourId: VELVET_COAST_TOUR_ID,
        raceIndex: 0,
        results: [],
      },
    }
    expect(
      difficultyTierForCareer(STANDARD_CHAMPIONSHIP, career),
    ).toBe(0)
  })
})

describe('applyFullRepair', () => {
  it('rejects the call when there is no damage', () => {
    const result = applyFullRepair(defaultCareer(), STANDARD_CHAMPIONSHIP)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('no-damage')
  })

  it('rejects the call when the wallet cannot cover the cost', () => {
    const career: WorldTourCareer = {
      ...defaultCareer(),
      money: 10,
      activeCarDamage: 0.8,
    }
    const result = applyFullRepair(career, STANDARD_CHAMPIONSHIP)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('insufficient-funds')
  })

  it('zeros damage and deducts the cost on success', () => {
    const career: WorldTourCareer = {
      ...defaultCareer(),
      money: 1000,
      activeCarDamage: 0.5,
    }
    const result = applyFullRepair(career, STANDARD_CHAMPIONSHIP)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.career.activeCarDamage).toBe(0)
    expect(result.career.money).toBe(1000 - result.spent)
    expect(result.spent).toBeGreaterThan(0)
  })

  it('does not mutate the input career', () => {
    const career: WorldTourCareer = {
      ...defaultCareer(),
      money: 1000,
      activeCarDamage: 0.5,
    }
    applyFullRepair(career, STANDARD_CHAMPIONSHIP)
    expect(career.activeCarDamage).toBe(0.5)
    expect(career.money).toBe(1000)
  })
})

describe('nextRaceFor', () => {
  it('returns null when no tour is active', () => {
    expect(
      nextRaceFor(STANDARD_CHAMPIONSHIP, defaultCareer()),
    ).toBeNull()
  })

  it('returns the next track in the active tour', () => {
    const career: WorldTourCareer = {
      ...defaultCareer(),
      activeTour: {
        tourId: VELVET_COAST_TOUR_ID,
        raceIndex: 2,
        results: [],
      },
    }
    const next = nextRaceFor(STANDARD_CHAMPIONSHIP, career)
    expect(next).not.toBeNull()
    expect(next!.tourId).toBe(VELVET_COAST_TOUR_ID)
    expect(next!.raceIndex).toBe(2)
    expect(next!.trackId).toBe('velvet-coast-3')
  })
})

describe('damage round-trip across a tour', () => {
  it('preserves damage across repair-skipped races', () => {
    // Race 1: pick up 30% damage. Save it without repairing.
    const after1: WorldTourCareer = {
      ...defaultCareer(),
      activeCarDamage: 0.3,
    }
    // Race 2: another 30% accumulates.
    const after2: WorldTourCareer = {
      ...after1,
      activeCarDamage: Math.min(1, after1.activeCarDamage + 0.3),
    }
    expect(after2.activeCarDamage).toBeCloseTo(0.6)
  })

  it('preserves zero damage after a successful repair', () => {
    const before: WorldTourCareer = {
      ...defaultCareer(),
      money: 500,
      activeCarDamage: 0.4,
    }
    const repaired = applyFullRepair(before, STANDARD_CHAMPIONSHIP)
    expect(repaired.ok).toBe(true)
    if (!repaired.ok) return
    expect(repaired.career.activeCarDamage).toBe(0)
  })
})
