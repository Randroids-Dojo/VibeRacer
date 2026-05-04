import { cellKey, DIR_OFFSETS } from './track'
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
  const candidateIdxs = new Set<number>()
  const cellsToCheck = [{ dr: 0, dc: 0 }, ...Object.values(DIR_OFFSETS)]
  for (const offset of cellsToCheck) {
    const key = cellKey(cell.row + offset.dr, cell.col + offset.dc)
    const locators = path.cellToLocators.get(key)
    if (locators !== undefined && locators.length > 0) {
      for (const locator of locators) candidateIdxs.add(locator.idx)
    } else {
      const idx = path.cellToOrderIdx.get(key)
      if (idx !== undefined) candidateIdxs.add(idx)
    }
  }
  if (candidateIdxs.size === 0) {
    return {
      id,
      x,
      z,
      onTrack: false,
      distanceToCenterline: Infinity,
      pieceIdx: null,
    }
  }
  let pieceIdx = candidateIdxs.values().next().value ?? 0
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
