import { describe, it, expect } from 'vitest'
import {
  BASE_TIER_COST,
  UPGRADE_MAX_TIER,
  applyUpgradePurchase,
  damageAbsorption,
  nextTierCost,
  resolveCarParams,
  sanitizeUpgrades,
  stockUpgrades,
  STOCK_BASE_PARAMS,
} from '@/game/worldTourUpgrades'

describe('stockUpgrades', () => {
  it('returns all zeros', () => {
    expect(stockUpgrades()).toEqual({
      engine: 0,
      tires: 0,
      brakes: 0,
      body: 0,
    })
  })
})

describe('resolveCarParams', () => {
  it('returns the stock params at all-zero tiers', () => {
    expect(resolveCarParams(STOCK_BASE_PARAMS, stockUpgrades())).toEqual(
      STOCK_BASE_PARAMS,
    )
  })

  it('raises max speed and accel for engine upgrades', () => {
    const tier3 = resolveCarParams(STOCK_BASE_PARAMS, {
      engine: 3,
      tires: 0,
      brakes: 0,
      body: 0,
    })
    expect(tier3.maxSpeed).toBeGreaterThan(STOCK_BASE_PARAMS.maxSpeed)
    expect(tier3.accel).toBeGreaterThan(STOCK_BASE_PARAMS.accel)
  })

  it('raises brake force for brakes upgrades', () => {
    const tier3 = resolveCarParams(STOCK_BASE_PARAMS, {
      engine: 0,
      tires: 0,
      brakes: 3,
      body: 0,
    })
    expect(tier3.brake).toBeGreaterThan(STOCK_BASE_PARAMS.brake)
  })

  it('raises steer rates for tires upgrades', () => {
    const tier3 = resolveCarParams(STOCK_BASE_PARAMS, {
      engine: 0,
      tires: 3,
      brakes: 0,
      body: 0,
    })
    expect(tier3.steerRateLow).toBeGreaterThan(STOCK_BASE_PARAMS.steerRateLow)
    expect(tier3.steerRateHigh).toBeGreaterThan(STOCK_BASE_PARAMS.steerRateHigh)
  })

  it('does not mutate the base params', () => {
    const baseMax = STOCK_BASE_PARAMS.maxSpeed
    resolveCarParams(STOCK_BASE_PARAMS, { engine: 3, tires: 0, brakes: 0, body: 0 })
    expect(STOCK_BASE_PARAMS.maxSpeed).toBe(baseMax)
  })

  it('clamps out-of-range tier values defensively', () => {
    const huge = resolveCarParams(STOCK_BASE_PARAMS, {
      engine: 99,
      tires: 99,
      brakes: 99,
      body: 99,
    })
    const max = resolveCarParams(STOCK_BASE_PARAMS, {
      engine: UPGRADE_MAX_TIER,
      tires: UPGRADE_MAX_TIER,
      brakes: UPGRADE_MAX_TIER,
      body: UPGRADE_MAX_TIER,
    })
    expect(huge).toEqual(max)
  })
})

describe('damageAbsorption', () => {
  it('returns 1 for a stock body', () => {
    expect(damageAbsorption(stockUpgrades())).toBe(1)
  })

  it('decreases as the body tier rises', () => {
    const stock = damageAbsorption(stockUpgrades())
    const tier3 = damageAbsorption({ engine: 0, tires: 0, brakes: 0, body: 3 })
    expect(tier3).toBeLessThan(stock)
    expect(tier3).toBeGreaterThan(0)
  })
})

describe('nextTierCost', () => {
  it('costs BASE_TIER_COST for tier 0 -> 1', () => {
    expect(nextTierCost(stockUpgrades(), 'engine')).toBe(BASE_TIER_COST)
  })

  it('scales linearly with the tier being bought', () => {
    expect(
      nextTierCost({ engine: 1, tires: 0, brakes: 0, body: 0 }, 'engine'),
    ).toBe(BASE_TIER_COST * 2)
    expect(
      nextTierCost({ engine: 2, tires: 0, brakes: 0, body: 0 }, 'engine'),
    ).toBe(BASE_TIER_COST * 3)
  })

  it('returns 0 once the zone is at max', () => {
    expect(
      nextTierCost(
        { engine: UPGRADE_MAX_TIER, tires: 0, brakes: 0, body: 0 },
        'engine',
      ),
    ).toBe(0)
  })
})

describe('applyUpgradePurchase', () => {
  it('advances the zone and deducts the cost on success', () => {
    const out = applyUpgradePurchase(stockUpgrades(), 'engine', 5000)
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.upgrades.engine).toBe(1)
    expect(out.spent).toBe(BASE_TIER_COST)
  })

  it('rejects on insufficient funds', () => {
    const out = applyUpgradePurchase(stockUpgrades(), 'engine', 0)
    expect(out.ok).toBe(false)
    if (out.ok) return
    expect(out.reason).toBe('insufficient-funds')
  })

  it('rejects once the zone is at max', () => {
    const out = applyUpgradePurchase(
      { engine: UPGRADE_MAX_TIER, tires: 0, brakes: 0, body: 0 },
      'engine',
      99999,
    )
    expect(out.ok).toBe(false)
    if (out.ok) return
    expect(out.reason).toBe('max-tier')
  })

  it('does not mutate the input upgrades', () => {
    const start = stockUpgrades()
    applyUpgradePurchase(start, 'engine', 99999)
    expect(start.engine).toBe(0)
  })
})

describe('sanitizeUpgrades', () => {
  it('returns a stock set on a non-object', () => {
    expect(sanitizeUpgrades(null)).toEqual(stockUpgrades())
    expect(sanitizeUpgrades(42)).toEqual(stockUpgrades())
  })

  it('clamps every zone into [0, 3]', () => {
    expect(sanitizeUpgrades({ engine: 99, tires: -1, brakes: 2, body: 0 })).toEqual({
      engine: 3,
      tires: 0,
      brakes: 2,
      body: 0,
    })
  })
})
