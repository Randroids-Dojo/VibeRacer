import { describe, expect, it } from 'vitest'
import { buildTrackPath } from '@/game/trackPath'
import type { TrackPath } from '@/game/trackPath'
import { DEFAULT_TRACK_PIECES } from '@/lib/defaultTrack'
import type { Piece } from '@/lib/schemas'
import {
  PACE_NOTE_LOOK_AHEAD_PIECES,
  PACE_NOTE_SEVERITY_COLORS,
  buildPaceNotes,
  formatPaceNoteChipText,
  lookAheadPaceNote,
  pieceIdxForCellKey,
  relativeTurnBetween,
  type PaceNote,
} from '@/game/paceNotes'

const defaultPath = buildTrackPath(DEFAULT_TRACK_PIECES)

function note(
  pieceIdx: number,
  kind: PaceNote['kind'],
  severity: PaceNote['severity'],
  label: string,
): PaceNote {
  return { pieceIdx, kind, severity, label }
}

function noEmDashes(value: string): boolean {
  return !/[\u2014\u2013]/.test(value)
}

describe('PACE_NOTE_LOOK_AHEAD_PIECES', () => {
  it('is a positive integer larger than 1 so a single corner can be previewed', () => {
    expect(Number.isInteger(PACE_NOTE_LOOK_AHEAD_PIECES)).toBe(true)
    expect(PACE_NOTE_LOOK_AHEAD_PIECES).toBeGreaterThan(1)
  })
})

describe('PACE_NOTE_SEVERITY_COLORS', () => {
  it('exposes a 7-char hex color for every severity', () => {
    for (const sev of ['easy', 'medium', 'sharp'] as const) {
      const hex = PACE_NOTE_SEVERITY_COLORS[sev]
      expect(typeof hex).toBe('string')
      expect(hex).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('has unique colors per severity so the chip can disambiguate at a glance', () => {
    const palette = Object.values(PACE_NOTE_SEVERITY_COLORS)
    expect(new Set(palette).size).toBe(palette.length)
  })
})

describe('relativeTurnBetween', () => {
  it('reads the default oval as alternating right turns and straights', () => {
    const turns: string[] = []
    for (let i = 1; i < defaultPath.order.length; i++) {
      turns.push(relativeTurnBetween(defaultPath.order[i - 1], defaultPath.order[i]))
    }
    // 4 right corners and 3 straight transitions across 7 consecutive pairs.
    expect(turns.filter((t) => t === 'right').length).toBe(4)
    expect(turns.filter((t) => t === 'straight').length).toBe(3)
    expect(turns).not.toContain('reverse')
  })

  it('returns straight when entry and exit directions match', () => {
    const synth = {
      piece: { type: 'straight', row: 0, col: 0, rotation: 0 },
      entryDir: 4,
      exitDir: 0,
      center: { x: 0, y: 0, z: 0 },
      entry: { x: 0, y: 0, z: 0 },
      exit: { x: 0, y: 0, z: 0 },
      arcCenter: null,
      samples: null,
    } as never
    expect(relativeTurnBetween(synth, synth)).toBe('straight')
  })
})

describe('buildPaceNotes', () => {
  it('returns one note per piece', () => {
    const notes = buildPaceNotes(defaultPath)
    expect(notes.length).toBe(defaultPath.order.length)
    notes.forEach((n, i) => {
      expect(n.pieceIdx).toBe(i)
    })
  })

  it('returns an empty array on null / undefined / zero-piece path', () => {
    expect(buildPaceNotes(null)).toEqual([])
    expect(buildPaceNotes(undefined)).toEqual([])
    const empty = { order: [], cellToOrderIdx: new Map(), spawn: null, finishLine: null, cpTriggerPieceIdx: [] } as unknown as TrackPath
    expect(buildPaceNotes(empty)).toEqual([])
  })

  it('flags the last piece as Finish regardless of underlying piece type', () => {
    const notes = buildPaceNotes(defaultPath)
    const last = notes[notes.length - 1]
    expect(last.kind).toBe('finish')
    expect(last.label).toBe('Finish')
  })

  it('classifies left90 / right90 as sharp turns and straights as easy flat-out', () => {
    const notes = buildPaceNotes(defaultPath)
    // The default oval is straight-corner-straight-corner-... starting with a
    // straight at piece 0. The corners are pieces 1, 3, 5, 7. Piece 7 is the
    // last so it gets the Finish override.
    expect(notes[0].kind).toBe('straight')
    expect(notes[0].severity).toBe('easy')
    expect(notes[1].kind).toBe('right')
    expect(notes[1].severity).toBe('sharp')
    expect(notes[2].kind).toBe('straight')
    expect(notes[3].kind).toBe('right')
    expect(notes[3].severity).toBe('sharp')
    expect(notes[5].kind).toBe('right')
    expect(notes[5].severity).toBe('sharp')
  })

  it('uses no em-dashes or en-dashes in any label', () => {
    const notes = buildPaceNotes(defaultPath)
    notes.forEach((n) => {
      expect(noEmDashes(n.label)).toBe(true)
    })
  })

  it('classifies S-curve pieces as medium severity with a distinct kind per direction', () => {
    const sPieces: Piece[] = [
      { type: 'scurve', row: 0, col: 0, rotation: 0 },
      { type: 'scurveLeft', row: 0, col: 0, rotation: 0 },
    ]
    const synthOrder = sPieces.map((p, i) => ({
      piece: p,
      entryDir: 4,
      exitDir: 0,
      center: { x: 0, y: 0, z: 0 },
      entry: { x: 0, y: 0, z: 0 },
      exit: { x: 0, y: 0, z: 0 },
      arcCenter: null,
      samples: null,
    }))
    // Synthesize a minimal track path so we can reuse buildPaceNotes.
    const path = {
      order: synthOrder,
      cellToOrderIdx: new Map(),
      spawn: null,
      finishLine: null,
      cpTriggerPieceIdx: [],
    } as unknown as TrackPath
    const notes = buildPaceNotes(path)
    expect(notes[0].kind).toBe('sCurveRightLeft')
    expect(notes[0].severity).toBe('medium')
    // Last entry rolls up to finish per the build rule.
    expect(notes[1].kind).toBe('finish')
  })

  it('classifies sweep turns as medium left and right notes', () => {
    const sPieces: Piece[] = [
      { type: 'sweepRight', row: 0, col: 0, rotation: 0 },
      { type: 'sweepLeft', row: 0, col: 1, rotation: 0 },
      { type: 'megaSweepRight', row: 1, col: 1, rotation: 0 },
      { type: 'megaSweepLeft', row: 2, col: 1, rotation: 0 },
      { type: 'hairpin', row: 3, col: 1, rotation: 0 },
      { type: 'straight', row: 3, col: 1, rotation: 0 },
    ]
    const synthOrder = sPieces.map((p, i) => ({
      piece: p,
      entryDir: 4,
      exitDir:
        p.type === 'sweepLeft' || p.type === 'megaSweepLeft'
          ? 6
          : p.type === 'sweepRight' || p.type === 'megaSweepRight'
            ? 2
            : 0,
      center: { x: 0, y: 0, z: 0 },
      entry: { x: 0, y: 0, z: 0 },
      exit: { x: 0, y: 0, z: 0 },
      arcCenter: null,
      samples: null,
    }))
    const path = {
      order: synthOrder,
      cellToOrderIdx: new Map(),
      spawn: null,
      finishLine: null,
      cpTriggerPieceIdx: [],
    } as unknown as TrackPath
    const notes = buildPaceNotes(path)
    expect(notes[0]).toMatchObject({
      kind: 'right',
      severity: 'medium',
      label: 'Sweep right',
    })
    expect(notes[1]).toMatchObject({
      kind: 'left',
      severity: 'medium',
      label: 'Sweep left',
    })
    expect(notes[2]).toMatchObject({
      kind: 'right',
      severity: 'medium',
      label: 'Mega sweep right',
    })
    expect(notes[3]).toMatchObject({
      kind: 'left',
      severity: 'medium',
      label: 'Mega sweep left',
    })
    expect(notes[4]).toMatchObject({
      kind: 'right',
      severity: 'sharp',
      label: 'Hairpin',
    })
  })
})

describe('pieceIdxForCellKey', () => {
  it('returns the order index for a known cell', () => {
    const op = defaultPath.order[3]
    const key = `${op.piece.row},${op.piece.col}`
    expect(pieceIdxForCellKey(defaultPath, key)).toBe(3)
  })

  it('returns null when the cell is unknown / off-track', () => {
    expect(pieceIdxForCellKey(defaultPath, '999,999')).toBeNull()
  })

  it('returns null on missing path / cell key', () => {
    expect(pieceIdxForCellKey(null, '0,0')).toBeNull()
    expect(pieceIdxForCellKey(defaultPath, null)).toBeNull()
    expect(pieceIdxForCellKey(defaultPath, '')).toBeNull()
  })
})

describe('formatPaceNoteChipText', () => {
  const sample = note(1, 'right', 'sharp', 'Sharp right')

  it('returns the bare label when the player is on the same piece (distance 0)', () => {
    expect(formatPaceNoteChipText(sample, 0)).toBe('Sharp right')
  })

  it('says "next" when the corner is one piece away', () => {
    expect(formatPaceNoteChipText(sample, 1)).toBe('Sharp right next')
  })

  it('says "in N" for distances of two or more', () => {
    expect(formatPaceNoteChipText(sample, 2)).toBe('Sharp right in 2')
    expect(formatPaceNoteChipText(sample, 3)).toBe('Sharp right in 3')
    expect(formatPaceNoteChipText(sample, 7)).toBe('Sharp right in 7')
  })

  it('floors fractional distances so the chip never reads "Sharp right in 2.7"', () => {
    expect(formatPaceNoteChipText(sample, 2.7)).toBe('Sharp right in 2')
  })

  it('returns null on null note / non-finite / negative distance', () => {
    expect(formatPaceNoteChipText(null, 1)).toBeNull()
    expect(formatPaceNoteChipText(sample, Number.NaN)).toBeNull()
    expect(formatPaceNoteChipText(sample, Number.POSITIVE_INFINITY)).toBeNull()
    expect(formatPaceNoteChipText(sample, -1)).toBeNull()
  })

  it('emits no em-dashes / en-dashes', () => {
    expect(noEmDashes(formatPaceNoteChipText(sample, 5)!)).toBe(true)
  })
})

describe('lookAheadPaceNote', () => {
  const notes = buildPaceNotes(defaultPath)

  it('returns the next non-straight note inside the look-ahead window', () => {
    // From piece 0 (straight), the very next piece is a sharp right corner.
    const result = lookAheadPaceNote(notes, 0)
    expect(result).not.toBeNull()
    expect(result!.note.kind).toBe('right')
    expect(result!.distance).toBe(1)
  })

  it('returns the current piece as distance 0 when the player is mid-corner', () => {
    const result = lookAheadPaceNote(notes, 1)
    expect(result).not.toBeNull()
    expect(result!.distance).toBe(0)
    expect(result!.note.kind).toBe('right')
  })

  it('falls back to the very next piece when no corner sits inside the window', () => {
    const allFlat = [
      note(0, 'straight', 'easy', 'Flat out'),
      note(1, 'straight', 'easy', 'Flat out'),
      note(2, 'straight', 'easy', 'Flat out'),
      note(3, 'finish', 'easy', 'Finish'),
    ]
    const result = lookAheadPaceNote(allFlat, 0, 2)
    expect(result).not.toBeNull()
    expect(result!.distance).toBe(0)
    expect(result!.note.kind).toBe('straight')
  })

  it('wraps around the end of the lap so the last few pieces still surface the next lap`s first corner', () => {
    // Default oval has a corner at piece 1. Starting from the second-to-last
    // piece (a straight), the closest non-straight is the wrap-around finish
    // (piece 7) and then piece 1 (the next-lap corner). The look-ahead window
    // is at least 2 so the finish lands first.
    const result = lookAheadPaceNote(notes, notes.length - 2)
    expect(result).not.toBeNull()
    // Finish is non-straight so it wins over the straight at idx-1.
    expect(['finish', 'right']).toContain(result!.note.kind)
  })

  it('returns null on empty / null inputs', () => {
    expect(lookAheadPaceNote(null, 0)).toBeNull()
    expect(lookAheadPaceNote([], 0)).toBeNull()
    expect(lookAheadPaceNote(notes, null)).toBeNull()
    expect(lookAheadPaceNote(notes, undefined)).toBeNull()
    expect(lookAheadPaceNote(notes, Number.NaN)).toBeNull()
  })

  it('clamps an out-of-range piece index via modulo so a stale index does not crash', () => {
    const result = lookAheadPaceNote(notes, notes.length + 3)
    expect(result).not.toBeNull()
    // (length + 3) % length === 3, which on the default oval is the third
    // right corner.
    expect(result!.note.pieceIdx).toBe(3)
  })

  it('clamps a non-finite window to a single-step search', () => {
    const result = lookAheadPaceNote(notes, 0, Number.POSITIVE_INFINITY)
    expect(result).not.toBeNull()
    // With a clamped 1-piece window from idx 0 the resolver only sees the
    // straight at idx 0, no corner, so it surfaces the fallback (the straight).
    expect(result!.note.pieceIdx).toBe(0)
  })

  it('honors a small custom window so callers can tune look-ahead independently', () => {
    // Window of 1 means we only see piece 2 (a straight) so the result is the
    // fallback (straight at distance 0).
    const result = lookAheadPaceNote(notes, 2, 1)
    expect(result).not.toBeNull()
    expect(result!.distance).toBe(0)
    expect(result!.note.kind).toBe('straight')
  })
})
