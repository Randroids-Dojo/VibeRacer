import { createHash } from 'node:crypto'
import type { Piece } from './schemas'

export function canonicalizePieces(pieces: Piece[]): Piece[] {
  return [...pieces].sort((a, b) => {
    if (a.row !== b.row) return a.row - b.row
    if (a.col !== b.col) return a.col - b.col
    if (a.type !== b.type) return a.type < b.type ? -1 : 1
    return a.rotation - b.rotation
  })
}

export function canonicalTrackJson(pieces: Piece[]): string {
  return JSON.stringify(
    canonicalizePieces(pieces).map((p) => ({
      type: p.type,
      row: p.row,
      col: p.col,
      rotation: p.rotation,
    })),
  )
}

export function hashTrack(pieces: Piece[]): string {
  return createHash('sha256').update(canonicalTrackJson(pieces)).digest('hex')
}
