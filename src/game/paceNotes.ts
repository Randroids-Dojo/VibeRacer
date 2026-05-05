// Pace notes are co-driver style call-outs that announce the upcoming track
// feature ("Sharp left in 2", "S-curve next") so the player can plan a corner
// before they see it. Pure helpers here resolve a track path into a
// per-piece note table once at race-load, then the HUD chip looks up the
// most relevant upcoming note each frame from the player's current piece
// index plus a small look-ahead window.
//
// The notes are derived from the track topology only (piece type + relative
// rotation between consecutive pieces). No physics, no replay data. The
// helpers are defensive against malformed paths so a corrupt cell or empty
// path can never poison the chip.

import type { OrderedPiece, TrackPath } from './trackPath'

// Largest semantic shape the chip ever surfaces. The kind drives the icon /
// arrow glyph in the chip; severity drives the accent color (sharp = red,
// medium = amber, easy = green).
export type PaceNoteKind =
  | 'left'
  | 'right'
  | 'sCurveLeftRight'
  | 'sCurveRightLeft'
  | 'straight'
  | 'finish'

export type PaceNoteSeverity = 'easy' | 'medium' | 'sharp'

export interface PaceNote {
  // Index of the piece this note describes, in path order.
  pieceIdx: number
  kind: PaceNoteKind
  severity: PaceNoteSeverity
  // Short human-readable label. Used in unit tests and as the chip text when
  // the upcoming note is the very next piece.
  label: string
}

// How far ahead the look-ahead window scans for non-straight notes. Beyond
// this distance the chip falls back to the next piece's straight / finish
// note so a long straight does not blank the chip.
export const PACE_NOTE_LOOK_AHEAD_PIECES = 4

// Relative direction change between two pieces, computed from their
// (entryDir, exitDir) tuple so a 90 degree right turn always reads as 'right'
// regardless of the world heading. Modulo wrapping handles the 0 -> 6 case
// (north to west = left) and the 6 -> 0 case (west to north = right).
export type RelativeTurn = 'left' | 'right' | 'straight' | 'reverse'

export function relativeTurnBetween(
  prev: OrderedPiece,
  next: OrderedPiece,
): RelativeTurn {
  const delta = (next.exitDir - prev.exitDir + 8) % 8
  if (delta === 0) return 'straight'
  if (delta > 0 && delta < 4) return 'right'
  if (delta === 4) return 'reverse'
  return 'left'
}

// Build the per-piece note table for a path. One entry per piece in path
// order. The last entry's note is always the 'finish' kind so the chip
// surfaces the lap-end cue cleanly. Returns an empty array on an empty path.
export function buildPaceNotes(path: TrackPath | null | undefined): PaceNote[] {
  if (!path) return []
  const order = path.order
  if (!order || order.length === 0) return []
  const out: PaceNote[] = []
  const finishIdx = order.length - 1
  for (let i = 0; i < order.length; i++) {
    const op = order[i]
    if (i === finishIdx) {
      out.push({
        pieceIdx: i,
        kind: 'finish',
        severity: 'easy',
        label: 'Finish',
      })
      continue
    }
    out.push(noteForPiece(op, i))
  }
  return out
}

function noteForPiece(op: OrderedPiece, idx: number): PaceNote {
  const type = op.piece.type
  if (type === 'straight') {
    return { pieceIdx: idx, kind: 'straight', severity: 'easy', label: 'Flat out' }
  }
  if (type === 'left90') {
    return { pieceIdx: idx, kind: 'left', severity: 'sharp', label: 'Sharp left' }
  }
  if (type === 'right90') {
    return {
      pieceIdx: idx,
      kind: 'right',
      severity: 'sharp',
      label: 'Sharp right',
    }
  }
  if (type === 'sweepLeft') {
    return { pieceIdx: idx, kind: 'left', severity: 'medium', label: 'Sweep left' }
  }
  if (type === 'sweepRight') {
    return {
      pieceIdx: idx,
      kind: 'right',
      severity: 'medium',
      label: 'Sweep right',
    }
  }
  if (type === 'megaSweepLeft') {
    return {
      pieceIdx: idx,
      kind: 'left',
      severity: 'medium',
      label: 'Mega sweep left',
    }
  }
  if (type === 'megaSweepRight') {
    return {
      pieceIdx: idx,
      kind: 'right',
      severity: 'medium',
      label: 'Mega sweep right',
    }
  }
  if (type === 'hairpin') {
    return { pieceIdx: idx, kind: 'right', severity: 'sharp', label: 'Hairpin' }
  }
  if (type === 'hairpinTight') {
    return { pieceIdx: idx, kind: 'right', severity: 'sharp', label: 'Tight hairpin' }
  }
  if (type === 'hairpinWide') {
    return { pieceIdx: idx, kind: 'right', severity: 'sharp', label: 'Wide hairpin' }
  }
  if (type === 'arc45') {
    return {
      pieceIdx: idx,
      kind: 'right',
      severity: 'medium',
      label: '45 arc right',
    }
  }
  if (type === 'arc45Left') {
    return {
      pieceIdx: idx,
      kind: 'left',
      severity: 'medium',
      label: '45 arc left',
    }
  }
  if (type === 'diagonal') {
    return { pieceIdx: idx, kind: 'straight', severity: 'easy', label: 'Diagonal' }
  }
  if (type === 'wideArc45Right') {
    return { pieceIdx: idx, kind: 'right', severity: 'medium', label: 'Wide 45 right' }
  }
  if (type === 'wideArc45Left') {
    return { pieceIdx: idx, kind: 'left', severity: 'medium', label: 'Wide 45 left' }
  }
  if (type === 'diagonalSweepRight') {
    return { pieceIdx: idx, kind: 'right', severity: 'medium', label: 'Diagonal sweep right' }
  }
  if (type === 'diagonalSweepLeft') {
    return { pieceIdx: idx, kind: 'left', severity: 'medium', label: 'Diagonal sweep left' }
  }
  if (type === 'kinkRight') {
    return { pieceIdx: idx, kind: 'right', severity: 'easy', label: 'Kink right' }
  }
  if (type === 'kinkLeft') {
    return { pieceIdx: idx, kind: 'left', severity: 'easy', label: 'Kink left' }
  }
  if (type === 'offsetStraightRight') {
    return { pieceIdx: idx, kind: 'right', severity: 'easy', label: 'Offset right' }
  }
  if (type === 'offsetStraightLeft') {
    return { pieceIdx: idx, kind: 'left', severity: 'easy', label: 'Offset left' }
  }
  if (type === 'grandSweepRight') {
    return { pieceIdx: idx, kind: 'right', severity: 'medium', label: 'Grand sweep right' }
  }
  if (type === 'grandSweepLeft') {
    return { pieceIdx: idx, kind: 'left', severity: 'medium', label: 'Grand sweep left' }
  }
  if (type === 'flexStraight') {
    return { pieceIdx: idx, kind: 'straight', severity: 'easy', label: 'Flex straight' }
  }
  if (type === 'scurve') {
    return {
      pieceIdx: idx,
      kind: 'sCurveRightLeft',
      severity: 'medium',
      label: 'S-curve right then left',
    }
  }
  if (type === 'scurveLeft') {
    return {
      pieceIdx: idx,
      kind: 'sCurveLeftRight',
      severity: 'medium',
      label: 'S-curve left then right',
    }
  }
  // Defensive fallback so an unknown piece type does not crash the table.
  return { pieceIdx: idx, kind: 'straight', severity: 'easy', label: 'Flat out' }
}

// Resolve the piece index from the player's current cell key. Returns null
// when the cell is off-track (the chip hides cleanly in that case rather
// than locking onto a stale note).
export function pieceIdxForCellKey(
  path: TrackPath | null | undefined,
  cellKey: string | null | undefined,
): number | null {
  if (!path || !cellKey) return null
  const idx = path.cellToOrderIdx.get(cellKey)
  return idx === undefined ? null : idx
}

// Format the chip text as "<note>" / "<note> next" / "<note> in N" depending
// on how many pieces sit between the player and the upcoming corner.
// `distance` is the count of pieces between the current piece (exclusive) and
// the note's piece (inclusive), so 0 means the player is already on it.
export function formatPaceNoteChipText(
  note: PaceNote | null,
  distance: number,
): string | null {
  if (!note) return null
  if (!Number.isFinite(distance) || distance < 0) return null
  if (distance === 0) return note.label
  if (distance === 1) return `${note.label} next`
  return `${note.label} in ${Math.floor(distance)}`
}

// Hex accent palette per severity. Mirrors the medal / racing-line family so
// the chip feels native to the rest of the HUD: sharp = red, medium = amber,
// easy = green. The HUD picks the color through this table so a future tweak
// to the palette propagates everywhere at once.
export const PACE_NOTE_SEVERITY_COLORS: Record<PaceNoteSeverity, string> = {
  sharp: '#e84a5f',
  medium: '#f3a93b',
  easy: '#5cd672',
}

// Resolve the most relevant upcoming note for the chip. Looks ahead up to
// `windowPieces` pieces from `currentPieceIdx` (inclusive of the current
// piece, so the chip still surfaces the corner the player is mid-way through)
// and prefers any non-'straight' note. Falls back to the very next piece's
// note (which may be 'straight' / 'finish') when no corner sits inside the
// window so the chip is never empty mid-track. Wraps around the path so the
// last few pieces of a lap still surface the next lap's first corner.
export function lookAheadPaceNote(
  notes: readonly PaceNote[] | null | undefined,
  currentPieceIdx: number | null | undefined,
  windowPieces: number = PACE_NOTE_LOOK_AHEAD_PIECES,
): { note: PaceNote; distance: number } | null {
  if (!notes || notes.length === 0) return null
  if (currentPieceIdx === null || currentPieceIdx === undefined) return null
  if (!Number.isFinite(currentPieceIdx)) return null
  const startIdx =
    ((Math.floor(currentPieceIdx) % notes.length) + notes.length) % notes.length
  const window = Math.max(
    1,
    Math.min(notes.length, Math.floor(Number.isFinite(windowPieces) ? windowPieces : 1)),
  )
  let fallback: { note: PaceNote; distance: number } | null = null
  for (let step = 0; step < window; step++) {
    const idx = (startIdx + step) % notes.length
    const note = notes[idx]
    if (!note) continue
    if (fallback === null) fallback = { note, distance: step }
    if (note.kind !== 'straight') {
      return { note, distance: step }
    }
  }
  return fallback
}
