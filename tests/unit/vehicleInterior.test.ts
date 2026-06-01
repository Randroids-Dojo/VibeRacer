import { describe, expect, it } from 'vitest'
import {
  Box3,
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from 'three'
import { addVehicleInterior } from '@/game/vehicleInterior'

// Build a minimal GLB-like vehicle group: a body shell, a solid cabin_core
// filler, and a couple of other interior fillers that must be left alone.
function makeCarGroup(): Group {
  const group = new Group()
  const mat = () => new MeshStandardMaterial()

  const body = new Mesh(new BoxGeometry(2, 1, 4), mat())
  body.name = 'body'
  body.position.y = 0.5
  group.add(body)

  const cabinCore = new Mesh(new BoxGeometry(1.8, 1.6, 1.5), mat())
  cabinCore.name = 'cabin_core'
  cabinCore.position.set(0, 1.4, 0.5)
  group.add(cabinCore)

  const engine = new Mesh(new BoxGeometry(1.5, 0.8, 1.0), mat())
  engine.name = 'engine_block'
  engine.position.set(0, 0.6, -1.6)
  group.add(engine)

  const trunk = new Mesh(new BoxGeometry(1.5, 0.3, 0.8), mat())
  trunk.name = 'trunk_floor'
  trunk.position.set(0, 0.4, 1.7)
  group.add(trunk)

  return group
}

// Under jsdom the steering-wheel GLB fetch fails, so addVehicleInterior falls
// back to its procedural wheel — still a group named `steering_wheel`.
describe('addVehicleInterior', () => {
  it('removes the cabin_core filler and adds an interior group', async () => {
    const group = makeCarGroup()
    await addVehicleInterior(group)

    expect(group.children.find((c) => c.name === 'cabin_core')).toBeUndefined()
    const interior = group.children.find((c) => c.name === 'interior')
    expect(interior).toBeDefined()
  })

  it('builds the full furniture set', async () => {
    const group = makeCarGroup()
    await addVehicleInterior(group)
    const interior = group.children.find((c) => c.name === 'interior')!
    const names = interior.children.map((c) => c.name)
    for (const expected of [
      'interior_floor',
      'seat_fl_base',
      'seat_fl_back',
      'seat_fl_headrest',
      'seat_fl_back_bolster_l',
      'seat_fr_base',
      'seat_rear_base',
      'console',
      'dashboard',
      'steering_wheel',
      'steering_column',
    ]) {
      expect(names).toContain(expected)
    }
  })

  it('leaves engine_block and trunk_floor fillers intact', async () => {
    const group = makeCarGroup()
    await addVehicleInterior(group)
    expect(group.children.find((c) => c.name === 'engine_block')).toBeDefined()
    expect(group.children.find((c) => c.name === 'trunk_floor')).toBeDefined()
  })

  it('fits the furniture inside the cabin_core cavity', async () => {
    const group = makeCarGroup()
    const cavity = new Box3().setFromObject(
      group.children.find((c) => c.name === 'cabin_core')!,
    )
    // pad for the slight recline / headrest / bolster overhang
    cavity.expandByVector(new Vector3(0.06, 0.12, 0.12))

    await addVehicleInterior(group)
    const interior = group.children.find((c) => c.name === 'interior')!
    const furniture = new Box3().setFromObject(interior)

    expect(cavity.containsBox(furniture)).toBe(true)
  })

  it('keeps furniture out of the body paint set (distinct dark trim colours)', async () => {
    const group = makeCarGroup()
    await addVehicleInterior(group)
    const interior = group.children.find((c) => c.name === 'interior')!
    const seat = interior.children.find(
      (c) => c.name === 'seat_fl_base',
    ) as Mesh
    // Tan upholstery, not a hot paint colour.
    expect((seat.material as MeshStandardMaterial).color.getHex()).not.toBe(
      0xffffff,
    )
  })

  it('no-ops on a group with neither cabin_core nor body', async () => {
    const group = new Group()
    const wheel = new Mesh(new BoxGeometry(0.5, 0.5, 0.5), new MeshStandardMaterial())
    wheel.name = 'wheel_fl'
    group.add(wheel)
    await addVehicleInterior(group)
    expect(group.children.find((c) => c.name === 'interior')).toBeUndefined()
  })
})
