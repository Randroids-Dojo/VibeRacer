import type { OrderedPiece } from './trackPath'

export const DEFAULT_TRACK_WIDTH = 8

export function widthAt(_op: OrderedPiece, _t: number): number {
  return DEFAULT_TRACK_WIDTH
}

export function halfWidthAt(op: OrderedPiece, t: number): number {
  return widthAt(op, t) / 2
}
