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

  it('keeps headlights intact at moderate damage and breaks them at heavy', () => {
    const asset = freshAsset('car')
    const viz = createDamageVisualizer(asset)
    const car = initCarState(0, DERBY_VEHICLES.car, {
      x: 0, z: 0, heading: 0, speed: 0,
    })
    const headlightMesh = asset.submeshes.headlight_l as Mesh
    const originalMat = headlightMesh.material
    car.health = car.maxHealth * 0.5 // moderate tier
    viz.update(car)
    expect(headlightMesh.material).toBe(originalMat)
    car.health = car.maxHealth * 0.15 // heavy tier
    viz.update(car)
    expect(headlightMesh.material).not.toBe(originalMat)
    viz.dispose()
  })

  it('reserves taillight breaks for destruction', () => {
    const asset = freshAsset('car')
    const viz = createDamageVisualizer(asset)
    const car = initCarState(0, DERBY_VEHICLES.car, {
      x: 0, z: 0, heading: 0, speed: 0,
    })
    const taillightMesh = asset.submeshes.taillight_l as Mesh
    const originalMat = taillightMesh.material
    car.health = car.maxHealth * 0.1 // critical tier, still alive
    viz.update(car)
    expect(taillightMesh.material).toBe(originalMat)
    car.health = 0
    car.status = 'destroyed'
    viz.update(car)
    expect(taillightMesh.material).not.toBe(originalMat)
    viz.dispose()
  })

  it('reserves fire for destroyed cars and never lights it on a still-alive critical', () => {
    const asset = freshAsset('car')
    const viz = createDamageVisualizer(asset)
    const car = initCarState(0, DERBY_VEHICLES.car, {
      x: 0, z: 0, heading: 0, speed: 0,
    })
    const fire = asset.group.children.find((c) => c.name === 'derbyDamageFire')
    expect(fire).toBeDefined()
    car.health = car.maxHealth * 0.1 // critical tier, still alive
    viz.update(car)
    expect(fire!.visible).toBe(false)
    car.health = 0
    car.status = 'destroyed'
    viz.update(car)
    expect(fire!.visible).toBe(true)
    viz.dispose()
  })

  it('applyHit below the threshold does not detach a panel', () => {
    const asset = freshAsset('car')
    const viz = createDamageVisualizer(asset)
    // Threshold sits low (around 4) so any meaningful hit sheds a panel;
    // grazes under that floor stay attached. Use 2 so the test does not
    // become brittle to small future tuning bumps within the graze band.
    const result = viz.applyHit(2, 1, 0, 0, () => 0.5)
    expect(result).toBeNull()
    expect(asset.submeshes.door_l!.visible).toBe(true)
    viz.dispose()
  })

  it('front-on hit drops the hood', () => {
    const asset = freshAsset('car')
    const viz = createDamageVisualizer(asset)
    const result = viz.applyHit(40, 1, 0, 0, () => 0.5)
    expect(result?.name).toBe('hood')
    expect(asset.submeshes.hood.parent).toBeNull()
    viz.dispose()
  })

  it('rear-on hit drops the trunk', () => {
    const asset = freshAsset('car')
    const viz = createDamageVisualizer(asset)
    const result = viz.applyHit(40, -1, 0, 0, () => 0.5)
    expect(result?.name).toBe('trunk')
    expect(asset.submeshes.trunk.parent).toBeNull()
    viz.dispose()
  })

  it('right-side hit drops the right door', () => {
    const asset = freshAsset('car')
    const viz = createDamageVisualizer(asset)
    // heading=0: car faces +X, so its local right axis is +Z. A hit
    // normal of (0, 1) lands on the right side.
    const result = viz.applyHit(40, 0, 1, 0, () => 0.5)
    expect(result?.name).toBe('door_r')
    expect(asset.submeshes.door_r!.parent).toBeNull()
    expect(asset.submeshes.door_l!.parent).not.toBeNull()
    viz.dispose()
  })

  it('left-side hit drops the left door', () => {
    const asset = freshAsset('car')
    const viz = createDamageVisualizer(asset)
    const result = viz.applyHit(40, 0, -1, 0, () => 0.5)
    expect(result?.name).toBe('door_l')
    expect(asset.submeshes.door_l!.parent).toBeNull()
    expect(asset.submeshes.door_r!.parent).not.toBeNull()
    viz.dispose()
  })

  it('side hit on a rotated car drops the door on the impact side', () => {
    const asset = freshAsset('car')
    const viz = createDamageVisualizer(asset)
    // Car rotated 90 degrees so its forward is world -Z. A world-space
    // normal of (1, 0) is now a side hit; the picker rotates the
    // normal into the local frame to see that.
    const result = viz.applyHit(40, 1, 0, Math.PI / 2, () => 0.5)
    expect(['door_l', 'door_r']).toContain(result?.name)
    viz.dispose()
  })

  it('does not detach the same panel twice', () => {
    const asset = freshAsset('car')
    const viz = createDamageVisualizer(asset)
    const first = viz.applyHit(40, 0, 1, 0, () => 0.5)
    expect(first?.name).toBe('door_r')
    const second = viz.applyHit(40, 0, 1, 0, () => 0.5)
    expect(second).toBeNull()
    viz.dispose()
  })

  it('keeps every panel attached while the car is still alive (no tier-based detach)', () => {
    const asset = freshAsset('car')
    const viz = createDamageVisualizer(asset)
    const car = initCarState(0, DERBY_VEHICLES.car, {
      x: 0, z: 0, heading: 0, speed: 0,
    })
    for (const frac of [0.65, 0.45, 0.25, 0.05]) {
      car.health = car.maxHealth * frac
      viz.update(car)
    }
    for (const name of ['hood', 'door_l', 'door_r', 'trunk'] as const) {
      const panel = asset.submeshes[name]
      if (panel === undefined) continue
      expect(panel.parent).not.toBeNull()
    }
    viz.dispose()
  })

  it('detachAllRemaining sheds every still-attached sliced panel on destruction', () => {
    const asset = freshAsset('car')
    const viz = createDamageVisualizer(asset)
    const detached = viz.detachAllRemaining()
    const names = detached.map((d) => d.name).sort()
    // Placeholder asset ships hood, trunk, door_l, door_r.
    expect(names).toEqual(['door_l', 'door_r', 'hood', 'trunk'])
    viz.dispose()
  })

  it('flashes paint toward white on a hit and fades back', () => {
    const asset = freshAsset('car')
    const viz = createDamageVisualizer(asset)
    const bodyMesh = asset.submeshes.body as Mesh
    const bodyMat = bodyMesh.material as MeshStandardMaterial
    // The placeholder paint is saturated red (r=1). Pick a non-saturated
    // channel (green) to assert the lerp toward white is observable.
    const g0 = bodyMat.color.g
    viz.applyFlash(0.8)
    const gFlash = bodyMat.color.g
    expect(gFlash).toBeGreaterThan(g0)
    // Decay enough frames for the flash to fully drain.
    for (let i = 0; i < 60; i++) viz.tickFlash(1 / 30)
    expect(bodyMat.color.g).toBeCloseTo(g0, 5)
    viz.dispose()
  })

  it('returns null once every detachable panel from that direction is gone', () => {
    const asset = freshAsset('car')
    const viz = createDamageVisualizer(asset)
    // Pop each panel from its matching direction, then re-hit the same
    // sides. The second pass should land on already-detached panels and
    // return null.
    const directions: Array<{ nx: number; nz: number; name: string }> = [
      { nx: 1, nz: 0, name: 'hood' },
      { nx: -1, nz: 0, name: 'trunk' },
      { nx: 0, nz: 1, name: 'door_r' },
      { nx: 0, nz: -1, name: 'door_l' },
    ]
    for (const d of directions) {
      const r = viz.applyHit(40, d.nx, d.nz, 0, () => 0.5)
      expect(r?.name).toBe(d.name)
    }
    for (const d of directions) {
      const r = viz.applyHit(40, d.nx, d.nz, 0, () => 0.5)
      expect(r).toBeNull()
    }
    viz.dispose()
  })
})
