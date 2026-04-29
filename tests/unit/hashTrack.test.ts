import { describe, it, expect } from 'vitest'
import {
  canonicalizeCheckpoints,
  canonicalizePieces,
  hashTrack,
} from '@/lib/hashTrack'
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

  it('preserves legacy hash when checkpointCount equals piece count', () => {
    const legacy = hashTrack([a, b, c])
    expect(hashTrack([a, b, c], 3)).toBe(legacy)
    expect(hashTrack([a, b, c], undefined)).toBe(legacy)
  })

  it('produces a different hash when checkpointCount differs from piece count', () => {
    const legacy = hashTrack([a, b, c])
    const overridden = hashTrack([a, b, c], 3)
    const oval: Piece[] = [
      { type: 'straight', row: 0, col: 0, rotation: 0 },
      { type: 'right90', row: 0, col: 1, rotation: 0 },
      { type: 'straight', row: 1, col: 1, rotation: 0 },
      { type: 'right90', row: 1, col: 0, rotation: 0 },
    ]
    expect(hashTrack(oval, 3)).not.toBe(hashTrack(oval))
    expect(legacy).toBe(overridden)
  })

  it('preserves legacy hash for automatic transmission', () => {
    expect(hashTrack([a, b, c], undefined, 'automatic')).toBe(hashTrack([a, b, c]))
  })

  it('produces a different hash for manual transmission', () => {
    expect(hashTrack([a, b, c], undefined, 'manual')).not.toBe(
      hashTrack([a, b, c]),
    )
  })

  it('includes custom checkpoints in the hash regardless of input order', () => {
    const checkpoints = [
      { row: 0, col: 1 },
      { row: 1, col: 1 },
      { row: 1, col: 0 },
    ]
    const reversed = checkpoints.slice().reverse()
    expect(hashTrack([a, b, c], undefined, 'automatic', checkpoints)).toBe(
      hashTrack([a, b, c], undefined, 'automatic', reversed),
    )
    expect(hashTrack([a, b, c], undefined, 'automatic', checkpoints)).not.toBe(
      hashTrack([a, b, c]),
    )
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

describe('canonicalizeCheckpoints', () => {
  it('sorts by row, then col', () => {
    expect(
      canonicalizeCheckpoints([
        { row: 2, col: 1 },
        { row: 0, col: 4 },
        { row: 0, col: 2 },
      ]),
    ).toEqual([
      { row: 0, col: 2 },
      { row: 0, col: 4 },
      { row: 2, col: 1 },
    ])
  })
})
