import { describe, expect, it } from 'vitest'
import { Group, Mesh, BoxGeometry, MeshStandardMaterial } from 'three'
import {
  REQUIRED_SUBMESHES,
  assertVehicleContract,
  buildPlaceholderVehicleGroup,
  loadDerbyVehicleAsset,
} from '@/game/derbyVehicleLoader'
import { DERBY_VEHICLES } from '@/lib/derbyVehicles'

describe('derbyVehicleLoader contract', () => {
  it('REQUIRED_SUBMESHES enumerates 11 named meshes (doors are optional)', () => {
    expect(REQUIRED_SUBMESHES).toHaveLength(11)
    expect(new Set(REQUIRED_SUBMESHES).size).toBe(REQUIRED_SUBMESHES.length)
  })

  it('placeholder group contains every required submesh', () => {
    const group = buildPlaceholderVehicleGroup(DERBY_VEHICLES.car, 0xff0000)
    const names = group.children.map((c) => c.name)
    for (const required of REQUIRED_SUBMESHES) {
      expect(names).toContain(required)
    }
  })

  it('assertVehicleContract returns the asset with a populated submeshes record', () => {
    const group = buildPlaceholderVehicleGroup(DERBY_VEHICLES.car, 0xff0000)
    const asset = assertVehicleContract(group)
    for (const name of REQUIRED_SUBMESHES) {
      expect(asset.submeshes[name]).toBeInstanceOf(Mesh)
      expect(asset.submeshes[name].name).toBe(name)
    }
  })

  it('assertVehicleContract throws when a required submesh is missing', () => {
    const group = buildPlaceholderVehicleGroup(DERBY_VEHICLES.car, 0xff0000)
    // Drop the hood and reassert.
    const hood = group.children.find((c) => c.name === 'hood')
    if (hood) group.remove(hood)
    expect(() => assertVehicleContract(group)).toThrow(/hood/)
  })

  it('tolerates extra unnamed children (decorative meshes)', () => {
    const group = buildPlaceholderVehicleGroup(DERBY_VEHICLES.car, 0xff0000)
    const decorative = new Mesh(
      new BoxGeometry(0.1, 0.1, 0.1),
      new MeshStandardMaterial({ color: 0x000000 }),
    )
    decorative.name = 'rooftop_antenna_decorative'
    group.add(decorative)
    expect(() => assertVehicleContract(group)).not.toThrow()
  })

  it('reports every missing required submesh, not just the first', () => {
    const group = new Group()
    let err: Error | null = null
    try {
      assertVehicleContract(group)
    } catch (e) {
      err = e as Error
    }
    expect(err).not.toBeNull()
    for (const name of REQUIRED_SUBMESHES) {
      expect(err!.message).toContain(name)
    }
  })

  it('loadDerbyVehicleAsset resolves with a contract-valid asset', async () => {
    const asset = await loadDerbyVehicleAsset(DERBY_VEHICLES.bigTruck)
    for (const name of REQUIRED_SUBMESHES) {
      expect(asset.submeshes[name]).toBeInstanceOf(Mesh)
    }
    expect(asset.group.name).toBe('derbyVehicle:bigTruck')
    asset.dispose()
  })

  it('loadDerbyVehicleAsset furnishes the cabin interior', async () => {
    // The GLB fetch fails under jsdom and falls back to the placeholder, which
    // the async loader then furnishes via addVehicleInterior.
    const asset = await loadDerbyVehicleAsset(DERBY_VEHICLES.car)
    const interior = asset.group.children.find((c) => c.name === 'interior')
    expect(interior).toBeDefined()
    const partNames = interior!.children.map((c) => c.name)
    for (const expected of ['seat_fl_base', 'steering_wheel', 'dashboard']) {
      expect(partNames).toContain(expected)
    }
    asset.dispose()
  })

  it('interior is not a required submesh and never breaks the contract', () => {
    // The interior group rides along as an extra child: it must never be
    // mistaken for a contract submesh (so it is never painted or detached).
    expect(REQUIRED_SUBMESHES).not.toContain('interior')
    const group = buildPlaceholderVehicleGroup(DERBY_VEHICLES.car, 0xff0000)
    expect(() => assertVehicleContract(group)).not.toThrow()
  })
})
