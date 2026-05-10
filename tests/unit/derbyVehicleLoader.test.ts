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
  it('REQUIRED_SUBMESHES enumerates 13 named meshes', () => {
    expect(REQUIRED_SUBMESHES).toHaveLength(13)
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
})
