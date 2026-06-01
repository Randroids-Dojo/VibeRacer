import { describe, expect, it } from 'vitest'
import { Group, Mesh, BoxGeometry, MeshStandardMaterial } from 'three'
import {
  REQUIRED_SUBMESHES,
  addVehicleInterior,
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

  it('builds a cabin interior with seats, wheel, dashboard, and console', () => {
    const group = buildPlaceholderVehicleGroup(DERBY_VEHICLES.car, 0xff0000)
    const interior = group.children.find((c) => c.name === 'interior')
    expect(interior).toBeDefined()
    const partNames = interior!.children.map((c) => c.name)
    for (const expected of [
      'seat_fl_base',
      'seat_fr_base',
      'seat_rear_base',
      'steering_wheel',
      'dashboard',
      'console',
    ]) {
      expect(partNames).toContain(expected)
    }
  })

  it('interior is ignored by the contract and not a required submesh', () => {
    const group = buildPlaceholderVehicleGroup(DERBY_VEHICLES.car, 0xff0000)
    // The interior group rides along as an extra child: it must never be
    // mistaken for a contract submesh (so it is never painted or detached).
    expect(REQUIRED_SUBMESHES).not.toContain('interior')
    expect(() => assertVehicleContract(group)).not.toThrow()
  })

  it('removes the solid cabin_core filler and fits furniture to its cavity', () => {
    // Mimic the shipping GLBs: a body plus a solid cabin_core block that
    // otherwise occludes the furniture.
    const group = new Group()
    const body = new Mesh(
      new BoxGeometry(2, 1, 4),
      new MeshStandardMaterial(),
    )
    body.name = 'body'
    body.position.y = 0.5
    group.add(body)
    const cabinCore = new Mesh(
      new BoxGeometry(1.8, 1.6, 1.5),
      new MeshStandardMaterial(),
    )
    cabinCore.name = 'cabin_core'
    cabinCore.position.set(0, 1.4, 0.5)
    group.add(cabinCore)

    addVehicleInterior(group)

    // cabin_core is gone, an interior group with furniture took its place.
    expect(group.children.find((c) => c.name === 'cabin_core')).toBeUndefined()
    const interior = group.children.find((c) => c.name === 'interior')
    expect(interior).toBeDefined()
    expect(interior!.children.map((c) => c.name)).toContain('steering_wheel')
  })

  it('interior keeps its dark trim color (not body paint) and survives dispose', () => {
    const group = buildPlaceholderVehicleGroup(DERBY_VEHICLES.car, 0xff0000)
    const interior = group.children.find((c) => c.name === 'interior')!
    const seat = interior.children.find((c) => c.name === 'seat_fl_base') as Mesh
    const mat = seat.material as MeshStandardMaterial
    // Body paint is bright red (0xff0000); the seat must stay dark trim.
    expect(mat.color.getHex()).not.toBe(0xff0000)
    expect(() => assertVehicleContract(group).dispose()).not.toThrow()
  })
})
