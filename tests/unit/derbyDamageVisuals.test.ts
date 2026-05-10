import { describe, expect, it } from 'vitest'
import { MeshStandardMaterial } from 'three'
import {
  createDamageVisualizer,
  tierFromFraction,
  DAMAGE_TIER_HEALTH_FRACTIONS,
} from '@/game/derbyDamageVisuals'
import { buildPlaceholderVehicleGroup, assertVehicleContract } from '@/game/derbyVehicleLoader'
import { DERBY_VEHICLES } from '@/lib/derbyVehicles'
import { initCarState } from '@/game/derbyVehicleState'

function freshAsset(type: keyof typeof DERBY_VEHICLES) {
  return assertVehicleContract(
    buildPlaceholderVehicleGroup(DERBY_VEHICLES[type], 0xff0000),
  )
}

describe('tierFromFraction', () => {
  it('maps every fraction to a known tier', () => {
    expect(tierFromFraction(1.0)).toBe('pristine')
    expect(tierFromFraction(0.8)).toBe('pristine')
    expect(tierFromFraction(DAMAGE_TIER_HEALTH_FRACTIONS.pristine - 0.01)).toBe(
      'light',
    )
    expect(tierFromFraction(DAMAGE_TIER_HEALTH_FRACTIONS.light - 0.01)).toBe(
      'moderate',
    )
    expect(tierFromFraction(DAMAGE_TIER_HEALTH_FRACTIONS.moderate - 0.01)).toBe(
      'heavy',
    )
    expect(tierFromFraction(0.05)).toBe('critical')
  })
})

describe('createDamageVisualizer', () => {
  it('darkens body paint as health drops', () => {
    const asset = freshAsset('car')
    const viz = createDamageVisualizer(asset)
    const car = initCarState(0, DERBY_VEHICLES.car, {
      x: 0, z: 0, heading: 0, speed: 0,
    })
    const bodyMat = asset.submeshes.body.material as MeshStandardMaterial
    const r0 = bodyMat.color.r
    car.health = car.maxHealth * 0.5 // moderate tier
    viz.update(car)
    const r1 = bodyMat.color.r
    expect(r1).toBeLessThan(r0)
    viz.dispose()
  })

  it('breaks the headlights at moderate damage', () => {
    const asset = freshAsset('car')
    const viz = createDamageVisualizer(asset)
    const car = initCarState(0, DERBY_VEHICLES.car, {
      x: 0, z: 0, heading: 0, speed: 0,
    })
    const originalMat = asset.submeshes.headlight_l.material
    car.health = car.maxHealth * 0.5
    viz.update(car)
    expect(asset.submeshes.headlight_l.material).not.toBe(originalMat)
    viz.dispose()
  })

  it('breaks the taillights at heavy damage but not at moderate', () => {
    const asset = freshAsset('car')
    const viz = createDamageVisualizer(asset)
    const car = initCarState(0, DERBY_VEHICLES.car, {
      x: 0, z: 0, heading: 0, speed: 0,
    })
    const originalMat = asset.submeshes.taillight_l.material
    car.health = car.maxHealth * 0.5 // moderate tier (0.4..0.6)
    viz.update(car)
    expect(asset.submeshes.taillight_l.material).toBe(originalMat)
    car.health = car.maxHealth * 0.15 // heavy tier (0.0..0.2 dropping into critical)
    viz.update(car)
    expect(asset.submeshes.taillight_l.material).not.toBe(originalMat)
    viz.dispose()
  })

  it('shows fire only at critical health', () => {
    const asset = freshAsset('car')
    const viz = createDamageVisualizer(asset)
    const car = initCarState(0, DERBY_VEHICLES.car, {
      x: 0, z: 0, heading: 0, speed: 0,
    })
    const fire = asset.group.children.find((c) => c.name === 'derbyDamageFire')
    expect(fire).toBeDefined()
    car.health = car.maxHealth * 0.25
    viz.update(car)
    expect(fire!.visible).toBe(false)
    car.health = car.maxHealth * 0.1
    viz.update(car)
    expect(fire!.visible).toBe(true)
    viz.dispose()
  })

  it('applyHit below the threshold does not detach a panel', () => {
    const asset = freshAsset('car')
    const viz = createDamageVisualizer(asset)
    const result = viz.applyHit(10, 1, 0, () => 0.5)
    expect(result).toBeNull()
    expect(asset.submeshes.door_l.visible).toBe(true)
    viz.dispose()
  })

  it('applyHit at or above the threshold detaches a panel', () => {
    const asset = freshAsset('car')
    const viz = createDamageVisualizer(asset)
    const result = viz.applyHit(40, 1, 0, () => 0.5)
    expect(result).not.toBeNull()
    // Side hit prefers a door.
    expect(['door_l', 'door_r']).toContain(result!.name)
    expect(asset.submeshes[result!.name as 'door_l' | 'door_r'].visible).toBe(false)
    viz.dispose()
  })

  it('does not detach the same panel twice', () => {
    const asset = freshAsset('car')
    const viz = createDamageVisualizer(asset)
    const first = viz.applyHit(40, 0, 1, () => 0.5) // front, prefers hood
    expect(first?.name).toBe('hood')
    const second = viz.applyHit(40, 0, 1, () => 0.5)
    expect(second?.name).not.toBe('hood')
    viz.dispose()
  })

  it('returns null once every detachable panel is gone', () => {
    const asset = freshAsset('car')
    const viz = createDamageVisualizer(asset)
    const seen = new Set<string>()
    for (let i = 0; i < 6; i++) {
      const r = viz.applyHit(40, i % 2 === 0 ? 1 : 0, i % 2 === 0 ? 0 : 1, () => 0.5)
      if (r) seen.add(r.name)
    }
    expect(seen.size).toBe(4)
    const after = viz.applyHit(40, 1, 0, () => 0.5)
    expect(after).toBeNull()
    viz.dispose()
  })
})
