import { cellKey } from './track'
import { halfWidthAt } from './trackWidth'
import { distanceToCenterline, worldToCell, type TrackPath } from './trackPath'

export const WHEEL_CONTACT_FRONT_OFFSET = 1.55
export const WHEEL_CONTACT_REAR_OFFSET = 1.35
export const WHEEL_CONTACT_HALF_TRACK = 0.95

export type WheelContactId =
  | 'frontLeft'
  | 'frontRight'
  | 'rearLeft'
  | 'rearRight'

export interface WheelContact {
  id: WheelContactId
  x: number
  z: number
  onTrack: boolean
  distanceToCenterline: number
  pieceIdx: number | null
}

export interface VehicleTrackContact {
  onTrack: boolean
  contacts: WheelContact[]
}

const WHEEL_OFFSETS: {
  id: WheelContactId
  forward: number
  right: number
}[] = [
  {
    id: 'frontLeft',
    forward: WHEEL_CONTACT_FRONT_OFFSET,
    right: -WHEEL_CONTACT_HALF_TRACK,
  },
  {
    id: 'frontRight',
    forward: WHEEL_CONTACT_FRONT_OFFSET,
    right: WHEEL_CONTACT_HALF_TRACK,
  },
  {
    id: 'rearLeft',
    forward: -WHEEL_CONTACT_REAR_OFFSET,
    right: -WHEEL_CONTACT_HALF_TRACK,
  },
  {
    id: 'rearRight',
    forward: -WHEEL_CONTACT_REAR_OFFSET,
    right: WHEEL_CONTACT_HALF_TRACK,
  },
]

export function vehicleTrackContact(
  path: TrackPath,
  x: number,
  z: number,
  heading: number,
): VehicleTrackContact {
  const forwardX = Math.cos(heading)
  const forwardZ = -Math.sin(heading)
  const rightX = Math.sin(heading)
  const rightZ = Math.cos(heading)
  const contacts = WHEEL_OFFSETS.map((wheel): WheelContact => {
    const wx = x + forwardX * wheel.forward + rightX * wheel.right
    const wz = z + forwardZ * wheel.forward + rightZ * wheel.right
    return wheelTrackContact(path, wheel.id, wx, wz)
  })
  return {
    onTrack: contacts.every((contact) => contact.onTrack),
    contacts,
  }
}

export function wheelTrackContact(
  path: TrackPath,
  id: WheelContactId,
  x: number,
  z: number,
): WheelContact {
  const cell = worldToCell(x, z)
  const key = cellKey(cell.row, cell.col)
  const locators = path.cellToLocators.get(key)
  const candidateIdxs =
    locators !== undefined && locators.length > 0
      ? locators.map((locator) => locator.idx)
      : path.cellToOrderIdx.has(key)
        ? [path.cellToOrderIdx.get(key)!]
        : []
  if (candidateIdxs.length === 0) {
    return {
      id,
      x,
      z,
      onTrack: false,
      distanceToCenterline: Infinity,
      pieceIdx: null,
    }
  }
  let pieceIdx = candidateIdxs[0]
  let distance = Infinity
  for (const idx of candidateIdxs) {
    const candidateDistance = distanceToCenterline(path.order[idx], x, z)
    if (candidateDistance < distance) {
      distance = candidateDistance
      pieceIdx = idx
    }
  }
  return {
    id,
    x,
    z,
    onTrack: distance <= halfWidthAt(path.order[pieceIdx], 0.5),
    distanceToCenterline: distance,
    pieceIdx,
  }
}
