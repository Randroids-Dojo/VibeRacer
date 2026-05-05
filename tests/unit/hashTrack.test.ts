import { describe, it, expect } from 'vitest'
import {
  canonicalTrackJson,
  canonicalizeBranchEdges,
  canonicalizeCheckpoints,
  canonicalizePieces,
  hashTrack,
  type HashablePiece,
} from '@/lib/hashTrack'
import { TRACK_TEMPLATES } from '@/game/trackTemplates'
import type { Piece } from '@/lib/schemas'

const a: Piece = { type: 'straight', row: 0, col: 0, rotation: 0 }
const b: Piece = { type: 'right90', row: 0, col: 1, rotation: 90 }
const c: Piece = { type: 'straight', row: 1, col: 1, rotation: 0 }
const TEMPLATE_HASHES: Record<string, string> = {
  'starter-oval': 'bf3ea10b943ba5d4eefa822f9b408c50b53fac7076f0db54fca08b0b4e22a799',
  'sweep-loop': '2d3bc0958bea925a6f452cdd64a2759611eda2521a577aacfb5d6fdcb0d4bdaa',
  's-curve-loop': '3953a6ff5ac054540a8d93f178a0e37633b3262acf3b5b16f954d7ff259c9e95',
  'reference-gp': '3f1728077959d69ae0ff8dfb684e15fad1ad1290086b69715acae5866ad12107',
}

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

  it('includes custom checkpoints in the hash regardless of input order', () => {
    const checkpoints = [
      { row: 0, col: 1 },
      { row: 1, col: 1 },
      { row: 1, col: 0 },
    ]
    const reversed = checkpoints.slice().reverse()
    expect(hashTrack([a, b, c], undefined, checkpoints)).toBe(
      hashTrack([a, b, c], undefined, reversed),
    )
    expect(hashTrack([a, b, c], undefined, checkpoints)).not.toBe(
      hashTrack([a, b, c]),
    )
  })

  it('omits the default footprint from legacy hashes', () => {
    const legacy = hashTrack([a, b, c])
    const withDefaultFootprint: Piece[] = [
      { ...a, footprint: [{ dr: 0, dc: 0 }] },
      b,
      c,
    ]
    expect(hashTrack(withDefaultFootprint)).toBe(legacy)
  })

  it('includes non-default footprints in canonical JSON and hashes', () => {
    const footprinted: Piece[] = [
      {
        ...a,
        footprint: [
          { dr: 1, dc: 0 },
          { dr: 0, dc: 0 },
        ],
      },
      b,
      c,
    ]
    expect(canonicalTrackJson(footprinted)).toContain('"footprint"')
    expect(hashTrack(footprinted)).not.toBe(hashTrack([a, b, c]))
  })

  it('keeps current template hashes pinned through Phase 0 scaffolding', () => {
    for (const template of TRACK_TEMPLATES) {
      expect(hashTrack(template.pieces)).toBe(TEMPLATE_HASHES[template.id])
    }
  })

  it('hashes depend only on serialized canonical data (not on legacy cells when transform disagrees)', () => {
    // canonicalTrackJson now sorts by a transform-derived key so a v2 piece
    // whose legacy (row, col, rotation) drift from its transform cannot
    // change the hash purely through sort order. The converter aligns cells
    // with transform at entry, so this regression is academic for Stage 1
    // (every reachable piece has consistent fields), but the test pins the
    // property so a future canonicalizer that re-introduces a legacy-cell
    // sort key cannot silently break hash stability.
    const truthful: Piece = {
      type: 'straight',
      row: 0,
      col: 0,
      rotation: 0,
      transform: { x: 0, z: 0, theta: 0 },
    }
    const driftedCells: Piece = {
      type: 'straight',
      row: 99,
      col: 77,
      rotation: 270,
      transform: { x: 0, z: 0, theta: 0 },
    }
    const second: Piece = {
      type: 'right90',
      row: 0,
      col: 1,
      rotation: 0,
      transform: { x: 20, z: 0, theta: 0 },
    }
    expect(canonicalTrackJson([truthful, second])).toBe(
      canonicalTrackJson([driftedCells, second]),
    )
    expect(hashTrack([truthful, second])).toBe(
      hashTrack([driftedCells, second]),
    )
  })

  it('emits a flex spec for flexStraight pieces and changes the hash', () => {
    const flexPiece: Piece = {
      type: 'flexStraight',
      row: 0,
      col: 0,
      rotation: 0,
      flex: { dr: -3, dc: 1 },
    }
    const json = canonicalTrackJson([flexPiece, b, c])
    expect(json).toContain('"flex"')
    expect(json).toContain('"dr":-3')
    expect(json).toContain('"dc":1')
    const altered: Piece = { ...flexPiece, flex: { dr: -4, dc: 1 } }
    expect(hashTrack([flexPiece, b, c])).not.toBe(hashTrack([altered, b, c]))
  })

  it('keeps non-flex pieces free of any flex field in canonical JSON', () => {
    const json = canonicalTrackJson([a, b, c])
    expect(json).not.toContain('"flex"')
  })

  it('omits standard widthClass from legacy hashes', () => {
    const legacy = hashTrack([a, b, c])
    const withStandardWidth: HashablePiece[] = [
      { ...a, widthClass: 'standard' },
      b,
      c,
    ]

    expect(canonicalTrackJson(withStandardWidth)).not.toContain('widthClass')
    expect(hashTrack(withStandardWidth)).toBe(legacy)
  })

  it('includes non-default widthClass in canonical JSON and hashes', () => {
    const withWidePiece: HashablePiece[] = [
      { ...a, widthClass: 'wide' },
      b,
      c,
    ]

    expect(canonicalTrackJson(withWidePiece)).toContain('"widthClass":"wide"')
    expect(hashTrack(withWidePiece)).not.toBe(hashTrack([a, b, c]))
  })

  it('omits empty branchEdges from legacy hashes', () => {
    const legacy = hashTrack([a, b, c])

    expect(hashTrack([a, b, c], undefined, undefined, {})).toBe(legacy)
    expect(hashTrack([a, b, c], undefined, undefined, { branchEdges: [] })).toBe(
      legacy,
    )
  })

  it('includes branchEdges in stable canonical order', () => {
    const left = [
      { from: '0,0', to: '0,1', kind: 'main' },
      { to: '1,1', kind: 'branch', from: '0,1', hint: undefined },
    ]
    const right = left.slice().reverse()

    expect(canonicalTrackJson([a, b, c], undefined, undefined, {
      branchEdges: left,
    })).toBe(canonicalTrackJson([a, b, c], undefined, undefined, {
      branchEdges: right,
    }))
    expect(hashTrack([a, b, c], undefined, undefined, {
      branchEdges: left,
    })).not.toBe(hashTrack([a, b, c]))
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

describe('canonicalizeBranchEdges', () => {
  it('sorts edges by stable canonical JSON and omits undefined object fields', () => {
    expect(
      canonicalizeBranchEdges([
        { to: 'b', from: 'a', extra: undefined },
        { from: 'a', to: 'a' },
      ]),
    ).toEqual([
      { from: 'a', to: 'a' },
      { from: 'a', to: 'b' },
    ])
  })
})
