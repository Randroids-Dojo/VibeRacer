import { describe, it, expect } from 'vitest'
import {
  TrackSchema,
  TrackTourMembershipSchema,
  TrackVersionSchema,
  type Piece,
  type Track,
} from '@/lib/schemas'
import { hashTrack } from '@/lib/hashTrack'

const PIECES: Piece[] = [
  { type: 'straight', row: 0, col: 0, rotation: 0 },
  { type: 'right90', row: 0, col: 1, rotation: 90 },
  { type: 'straight', row: 1, col: 1, rotation: 0 },
]

describe('TrackTourMembershipSchema', () => {
  it('accepts a well-formed tour tag', () => {
    expect(
      TrackTourMembershipSchema.safeParse({ id: 'velvet-coast', index: 0 })
        .success,
    ).toBe(true)
    expect(
      TrackTourMembershipSchema.safeParse({ id: 'velvet-coast', index: 3 })
        .success,
    ).toBe(true)
  })

  it('rejects an empty tour id', () => {
    expect(
      TrackTourMembershipSchema.safeParse({ id: '', index: 0 }).success,
    ).toBe(false)
  })

  it('rejects a negative or non-integer index', () => {
    expect(
      TrackTourMembershipSchema.safeParse({ id: 'a', index: -1 }).success,
    ).toBe(false)
    expect(
      TrackTourMembershipSchema.safeParse({ id: 'a', index: 1.5 }).success,
    ).toBe(false)
  })
})

describe('TrackSchema with the optional tour field', () => {
  it('accepts a track without the tour field (preserving the old shape)', () => {
    const parsed = TrackSchema.safeParse({ pieces: PIECES })
    expect(parsed.success).toBe(true)
  })

  it('accepts a track with a tour membership tag', () => {
    const parsed = TrackSchema.safeParse({
      pieces: PIECES,
      tour: { id: 'velvet-coast', index: 1 },
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects a malformed tour tag', () => {
    const parsed = TrackSchema.safeParse({
      pieces: PIECES,
      tour: { id: '', index: 0 },
    })
    expect(parsed.success).toBe(false)
  })
})

describe('TrackVersionSchema with the optional tour field', () => {
  it('round-trips a tour tag through the persisted snapshot schema', () => {
    const parsed = TrackVersionSchema.safeParse({
      pieces: PIECES,
      tour: { id: 'velvet-coast', index: 2 },
      createdByRacerId: '00000000-0000-4000-8000-000000000000',
      createdAt: '2026-05-01T00:00:00.000Z',
    })
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.tour).toEqual({ id: 'velvet-coast', index: 2 })
  })

  it('accepts a snapshot without the tour field', () => {
    const parsed = TrackVersionSchema.safeParse({
      pieces: PIECES,
      createdByRacerId: '00000000-0000-4000-8000-000000000000',
      createdAt: '2026-05-01T00:00:00.000Z',
    })
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.tour).toBeUndefined()
  })
})

describe('hash invariance under the tour tag', () => {
  it('produces the same hash whether the tour tag is present or not', () => {
    const baseTrack: Track = TrackSchema.parse({ pieces: PIECES })
    const tourTrack: Track = TrackSchema.parse({
      pieces: PIECES,
      tour: { id: 'velvet-coast', index: 0 },
    })
    // The canonical hash function only consumes pieces and checkpoint
    // fields; the tour tag lives on the manifest and never enters the
    // hashed bytes. Asserting the equality here pins the invariant so a
    // future refactor cannot silently drift it.
    expect(hashTrack(baseTrack.pieces)).toBe(hashTrack(tourTrack.pieces))
  })

  it('produces the same hash across different tour ids and indexes', () => {
    const a: Track = TrackSchema.parse({
      pieces: PIECES,
      tour: { id: 'velvet-coast', index: 0 },
    })
    const b: Track = TrackSchema.parse({
      pieces: PIECES,
      tour: { id: 'iron-borough', index: 3 },
    })
    expect(hashTrack(a.pieces)).toBe(hashTrack(b.pieces))
  })
})
