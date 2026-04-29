import { cellKey } from './track'
import {
  TRACK_WIDTH,
  distanceToCenterline,
  worldToCell,
  type TrackPath,
} from './trackPath'

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
  const pieceIdx = path.cellToOrderIdx.get(cellKey(cell.row, cell.col)) ?? null
  if (pieceIdx === null) {
    return {
      id,
      x,
      z,
      onTrack: false,
      distanceToCenterline: Infinity,
      pieceIdx,
    }
  }
  const distance = distanceToCenterline(path.order[pieceIdx], x, z)
  return {
    id,
    x,
    z,
    onTrack: distance <= TRACK_WIDTH / 2,
    distanceToCenterline: distance,
    pieceIdx,
  }
}
