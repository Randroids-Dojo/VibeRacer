import { describe, it, expect } from 'vitest'
import { hashTrack, canonicalizePieces } from '@/lib/hashTrack'
import type { Piece } from '@/lib/schemas'

const a: Piece = { type: 'straight', row: 0, col: 0, rotation: 0 }
const b: Piece = { type: 'right90', row: 0, col: 1, rotation: 90 }
const c: Piece = { type: 'straight', row: 1, col: 1, rotation: 0 }

describe('hashTrack', () => {
  it('is stable regardless of piece input order', () => {
    expect(hashTrack([a, b, c])).toBe(hashTrack([c, a, b]))
    expect(hashTrack([a, b, c])).toBe(hashTrack([b, c, a]))
  })

  it('changes when any piece rotation changes', () => {
    const altered = { ...b, rotation: 180 as const }
    expect(hashTrack([a, b, c])).not.toBe(hashTrack([a, altered, c]))
  })

  it('changes when any piece type changes', () => {
    const altered = { ...a, type: 'left90' as const }
    expect(hashTrack([a, b, c])).not.toBe(hashTrack([altered, b, c]))
  })

  it('changes when a piece is added or moved', () => {
    const moved: Piece = { ...c, col: 2 }
    expect(hashTrack([a, b, c])).not.toBe(hashTrack([a, b, moved]))
  })

  it('returns 64 hex chars', () => {
    expect(hashTrack([a, b, c])).toMatch(/^[a-f0-9]{64}$/)
  })
})

describe('canonicalizePieces', () => {
  it('sorts by row, then col', () => {
    const sorted = canonicalizePieces([c, a, b])
    expect(sorted.map((p) => [p.row, p.col])).toEqual([
      [0, 0],
      [0, 1],
      [1, 1],
    ])
  })
})
