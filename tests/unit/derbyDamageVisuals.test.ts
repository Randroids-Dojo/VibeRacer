import { describe, expect, it } from 'vitest'
import { Mesh, MeshStandardMaterial } from 'three'
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
    const bodyMesh = asset.submeshes.body as Mesh
    const bodyMat = bodyMesh.material as MeshStandardMaterial
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
    const headlightMesh = asset.submeshes.headlight_l as Mesh
    const originalMat = headlightMesh.material
    car.health = car.maxHealth * 0.5
    viz.update(car)
    expect(headlightMesh.material).not.toBe(originalMat)
    viz.dispose()
  })

  it('breaks the taillights at heavy damage but not at moderate', () => {
    const asset = freshAsset('car')
    const viz = createDamageVisualizer(asset)
    const car = initCarState(0, DERBY_VEHICLES.car, {
      x: 0, z: 0, heading: 0, speed: 0,
    })
    const taillightMesh = asset.submeshes.taillight_l as Mesh
    const originalMat = taillightMesh.material
    car.health = car.maxHealth * 0.5 // moderate tier (0.4..0.6)
    viz.update(car)
    expect(taillightMesh.material).toBe(originalMat)
    car.health = car.maxHealth * 0.15 // heavy tier (0.0..0.2 dropping into critical)
    viz.update(car)
    expect(taillightMesh.material).not.toBe(originalMat)
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
    const result = viz.applyHit(10, 1, 0, 0, () => 0.5)
    expect(result).toBeNull()
    expect(asset.submeshes.door_l.visible).toBe(true)
    viz.dispose()
  })

  it('front-on hit detaches the hood', () => {
    const asset = freshAsset('car')
    const viz = createDamageVisualizer(asset)
    // heading=0 means the car faces world +X; a normal of (1, 0) is a
    // front-on hit so the hood pops first.
    const result = viz.applyHit(40, 1, 0, 0, () => 0.5)
    expect(result?.name).toBe('hood')
    // Real detach: panel is removed from its parent group entirely so it
    // disappears from the car and becomes free-standing debris.
    expect(asset.submeshes.hood.parent).toBeNull()
    viz.dispose()
  })

  it('side hit on a rotated car detaches a door, not a panel from the unrotated frame', () => {
    const asset = freshAsset('car')
    const viz = createDamageVisualizer(asset)
    // Car rotated 90 degrees so its forward is world -Z. A world-space
    // normal of (1, 0) is now a side hit, and the picker must rotate the
    // normal into the local frame to see that.
    const result = viz.applyHit(40, 1, 0, Math.PI / 2, () => 0.5)
    expect(['door_l', 'door_r']).toContain(result?.name)
    viz.dispose()
  })

  it('does not detach the same panel twice', () => {
    const asset = freshAsset('car')
    const viz = createDamageVisualizer(asset)
    const first = viz.applyHit(40, 1, 0, 0, () => 0.5) // front
    expect(first?.name).toBe('hood')
    const second = viz.applyHit(40, 1, 0, 0, () => 0.5)
    expect(second?.name).not.toBe('hood')
    viz.dispose()
  })

  it('returns null once every detachable panel is gone', () => {
    const asset = freshAsset('car')
    const viz = createDamageVisualizer(asset)
    const seen = new Set<string>()
    // Cycle through front, right, rear, left to exercise every panel slot.
    const directions: Array<[number, number]> = [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ]
    for (let i = 0; i < 8; i++) {
      const [nx, nz] = directions[i % directions.length]
      const r = viz.applyHit(40, nx, nz, 0, () => 0.5)
      if (r) seen.add(r.name)
    }
    expect(seen.size).toBe(4)
    const after = viz.applyHit(40, 1, 0, 0, () => 0.5)
    expect(after).toBeNull()
    viz.dispose()
  })
})
