import { describe, expect, it } from 'vitest'
import { buildTrackPath, TRACK_WIDTH } from '@/game/trackPath'
import {
  WHEEL_CONTACT_HALF_TRACK,
  vehicleTrackContact,
  wheelTrackContact,
} from '@/game/wheelContact'
import { DEFAULT_TRACK_PIECES } from '@/lib/defaultTrack'
import type { Piece } from '@/lib/schemas'

const path = buildTrackPath(DEFAULT_TRACK_PIECES)
const start = path.order[0]

describe('wheelTrackContact', () => {
  it('marks a wheel on the centerline as on track', () => {
    const contact = wheelTrackContact(
      path,
      'frontLeft',
      start.center.x,
      start.center.z,
    )
    expect(contact.onTrack).toBe(true)
    expect(contact.pieceIdx).toBe(0)
    expect(contact.distanceToCenterline).toBeLessThan(0.01)
  })

  it('marks a wheel outside every track cell as off track', () => {
    const contact = wheelTrackContact(path, 'frontLeft', 999, 999)
    expect(contact.onTrack).toBe(false)
    expect(contact.pieceIdx).toBeNull()
    expect(contact.distanceToCenterline).toBe(Infinity)
  })

  it('marks a wheel on a hairpin sampled centerline as on track', () => {
    const hairpinLoop: Piece[] = [
      { type: 'hairpin', row: 0, col: 0, rotation: 0 },
      { type: 'right90', row: 1, col: -1, rotation: 270 },
      { type: 'straight', row: 0, col: -1, rotation: 0 },
      { type: 'right90', row: -1, col: -1, rotation: 0 },
    ]
    const hairpinPath = buildTrackPath(hairpinLoop)
    const sample = hairpinPath.order[0].samples![Math.floor(
      hairpinPath.order[0].samples!.length / 2,
    )]
    const contact = wheelTrackContact(
      hairpinPath,
      'frontLeft',
      sample.x,
      sample.z,
    )
    expect(contact.onTrack).toBe(true)
    expect(contact.pieceIdx).toBe(0)
    expect(contact.distanceToCenterline).toBeLessThan(0.01)
  })

  it('marks a wheel on a diagonal sampled centerline as on track', () => {
    const diagonalLoop: Piece[] = [
      { type: 'arc45', row: 0, col: 0, rotation: 0 },
      { type: 'diagonal', row: -1, col: 1, rotation: 0 },
      { type: 'arc45', row: -2, col: 2, rotation: 180 },
      { type: 'left90', row: -3, col: 2, rotation: 0 },
      { type: 'straight', row: -3, col: 1, rotation: 90 },
      { type: 'straight', row: -3, col: 0, rotation: 90 },
      { type: 'left90', row: -3, col: -1, rotation: 270 },
      { type: 'straight', row: -2, col: -1, rotation: 0 },
      { type: 'straight', row: -1, col: -1, rotation: 0 },
      { type: 'straight', row: 0, col: -1, rotation: 0 },
      { type: 'left90', row: 1, col: -1, rotation: 180 },
      { type: 'right90', row: 1, col: 0, rotation: 180 },
    ]
    const diagonalPath = buildTrackPath(diagonalLoop)
    const sample = diagonalPath.order[1].samples![Math.floor(
      diagonalPath.order[1].samples!.length / 2,
    )]
    const contact = wheelTrackContact(
      diagonalPath,
      'frontLeft',
      sample.x,
      sample.z,
    )
    expect(contact.onTrack).toBe(true)
    expect(contact.pieceIdx).toBe(1)
    expect(contact.distanceToCenterline).toBeLessThan(0.01)
  })
})

describe('vehicleTrackContact', () => {
  it('keeps all four wheels on track at the spawn pose', () => {
    const contact = vehicleTrackContact(
      path,
      path.spawn.position.x,
      path.spawn.position.z,
      path.spawn.heading,
    )
    expect(contact.onTrack).toBe(true)
    expect(contact.contacts).toHaveLength(4)
    expect(contact.contacts.every((wheel) => wheel.onTrack)).toBe(true)
  })

  it('fails when one side of the car hangs past the road edge', () => {
    const contact = vehicleTrackContact(
      path,
      start.center.x + TRACK_WIDTH / 2 - WHEEL_CONTACT_HALF_TRACK + 0.1,
      start.center.z,
      Math.PI / 2,
    )
    expect(contact.onTrack).toBe(false)
    expect(contact.contacts.some((wheel) => !wheel.onTrack)).toBe(true)
  })
})
