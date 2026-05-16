import { describe, expect, it } from 'vitest'
import { Group, Mesh, BoxGeometry, MeshStandardMaterial } from 'three'
import {
  REQUIRED_SUBMESHES,
  assertVehicleContract,
  buildPlaceholderVehicleGroup,
  ensureDoors,
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
})

describe('ensureDoors', () => {
  function bareGroupWithBody(): Group {
    // Simulate a Kenney-sliced GLB that exposes a body node but no doors.
    // A box 4 wide, 1.2 tall, 5 long centered at origin gives realistic
    // bbox numbers for the door slab sizing.
    const group = new Group()
    const body = new Mesh(
      new BoxGeometry(4, 1.2, 5),
      new MeshStandardMaterial({ color: 0x336699, roughness: 0.6 }),
    )
    body.name = 'body'
    body.position.y = 0.6
    group.add(body)
    return group
  }

  it('adds door_l and door_r when both are missing', () => {
    const group = bareGroupWithBody()
    ensureDoors(group, 0xff0000)
    const left = group.children.find((c) => c.name === 'door_l')
    const right = group.children.find((c) => c.name === 'door_r')
    expect(left).toBeInstanceOf(Mesh)
    expect(right).toBeInstanceOf(Mesh)
  })

  it('places the left door on the -X side and the right door on the +X side', () => {
    const group = bareGroupWithBody()
    ensureDoors(group, 0xff0000)
    const left = group.children.find((c) => c.name === 'door_l')!
    const right = group.children.find((c) => c.name === 'door_r')!
    expect(left.position.x).toBeLessThan(0)
    expect(right.position.x).toBeGreaterThan(0)
    // Symmetric around the body center.
    expect(Math.abs(left.position.x + right.position.x)).toBeLessThan(1e-4)
  })

  it('skips synthesis when both doors are already present', () => {
    const group = bareGroupWithBody()
    const presetLeft = new Mesh(
      new BoxGeometry(0.3, 1, 1.5),
      new MeshStandardMaterial({ color: 0x000000 }),
    )
    presetLeft.name = 'door_l'
    presetLeft.position.set(-2.5, 0.6, 0)
    group.add(presetLeft)
    const presetRight = new Mesh(
      new BoxGeometry(0.3, 1, 1.5),
      new MeshStandardMaterial({ color: 0x000000 }),
    )
    presetRight.name = 'door_r'
    presetRight.position.set(2.5, 0.6, 0)
    group.add(presetRight)
    ensureDoors(group, 0xff0000)
    // Still exactly one door_l and one door_r, and they remain the
    // original presets (not replaced).
    const lefts = group.children.filter((c) => c.name === 'door_l')
    const rights = group.children.filter((c) => c.name === 'door_r')
    expect(lefts).toHaveLength(1)
    expect(rights).toHaveLength(1)
    expect(lefts[0]).toBe(presetLeft)
    expect(rights[0]).toBe(presetRight)
  })

  it('is a no-op when the body node is absent', () => {
    const group = new Group()
    expect(() => ensureDoors(group, 0xff0000)).not.toThrow()
    expect(group.children.find((c) => c.name === 'door_l')).toBeUndefined()
    expect(group.children.find((c) => c.name === 'door_r')).toBeUndefined()
  })
})
