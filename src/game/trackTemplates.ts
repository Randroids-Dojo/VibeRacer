import { DEFAULT_TRACK_PIECES } from '@/lib/defaultTrack'
import { MAX_PIECES_PER_TRACK, type Piece } from '@/lib/schemas'

export interface TrackTemplate {
  id: string
  label: string
  description: string
  pieces: Piece[]
}

const SWEEP_LOOP: Piece[] = [
  { type: 'straight', row: 1, col: 0, rotation: 0 },
  { type: 'sweepRight', row: 0, col: 0, rotation: 0 },
  { type: 'straight', row: 0, col: 1, rotation: 90 },
  { type: 'sweepRight', row: 0, col: 2, rotation: 90 },
  { type: 'straight', row: 1, col: 2, rotation: 0 },
  { type: 'sweepRight', row: 2, col: 2, rotation: 180 },
  { type: 'straight', row: 2, col: 1, rotation: 90 },
  { type: 'sweepRight', row: 2, col: 0, rotation: 270 },
]

const S_CURVE_LOOP: Piece[] = [
  { type: 'scurve', row: 1, col: 0, rotation: 0 },
  { type: 'right90', row: 0, col: 0, rotation: 0 },
  { type: 'scurveLeft', row: 0, col: 1, rotation: 90 },
  { type: 'right90', row: 0, col: 2, rotation: 90 },
  { type: 'scurveLeft', row: 1, col: 2, rotation: 0 },
  { type: 'right90', row: 2, col: 2, rotation: 180 },
  { type: 'scurve', row: 2, col: 1, rotation: 90 },
  { type: 'right90', row: 2, col: 0, rotation: 270 },
]

const REFERENCE_GP_LOOP: Piece[] = [
  { type: 'arc45', row: 0, col: 0, rotation: 90 },
  { type: 'diagonal', row: 1, col: 1, rotation: 90 },
  { type: 'diagonal', row: 2, col: 2, rotation: 90 },
  { type: 'arc45Left', row: 3, col: 3, rotation: 0 },
  { type: 'sweepRight', row: 4, col: 3, rotation: 180 },
  { type: 'sweepRight', row: 4, col: 2, rotation: 0 },
  { type: 'sweepRight', row: 5, col: 2, rotation: 180 },
  { type: 'kinkLeft', row: 5, col: 1, rotation: 90 },
  { type: 'kinkRight', row: 5, col: 0, rotation: 90 },
  { type: 'arc45', row: 5, col: -1, rotation: 270 },
  { type: 'arc45', row: 4, col: -2, rotation: 90 },
  { type: 'arc45Left', row: 4, col: -3, rotation: 270 },
  { type: 'diagonal', row: 5, col: -4, rotation: 0 },
  { type: 'arc45', row: 6, col: -5, rotation: 0 },
  { type: 'arc45Left', row: 7, col: -5, rotation: 180 },
  { type: 'arc45', row: 8, col: -4, rotation: 270 },
  { type: 'kinkRight', row: 8, col: -3, rotation: 90 },
  { type: 'straight', row: 8, col: -2, rotation: 90 },
  { type: 'kinkLeft', row: 8, col: -1, rotation: 90 },
  { type: 'straight', row: 8, col: 0, rotation: 90 },
  { type: 'straight', row: 8, col: 1, rotation: 90 },
  { type: 'arc45Left', row: 8, col: 2, rotation: 90 },
  { type: 'diagonal', row: 7, col: 3, rotation: 0 },
  { type: 'diagonal', row: 6, col: 4, rotation: 0 },
  { type: 'diagonal', row: 5, col: 5, rotation: 0 },
  { type: 'diagonal', row: 4, col: 6, rotation: 0 },
  { type: 'arc45Left', row: 3, col: 7, rotation: 270 },
  { type: 'sweepRight', row: 3, col: 8, rotation: 180 },
  { type: 'straight', row: 2, col: 8, rotation: 0 },
  { type: 'arc45', row: 1, col: 8, rotation: 0 },
  { type: 'arc45', row: 0, col: 9, rotation: 180 },
  { type: 'arc45Left', row: -1, col: 9, rotation: 0 },
  { type: 'arc45', row: -2, col: 8, rotation: 90 },
  { type: 'sweepRight', row: -2, col: 7, rotation: 0 },
  { type: 'kinkRight', row: -1, col: 7, rotation: 0 },
  { type: 'kinkLeft', row: 0, col: 7, rotation: 0 },
  { type: 'arc45', row: 1, col: 7, rotation: 180 },
  { type: 'arc45Left', row: 2, col: 6, rotation: 90 },
  { type: 'sweepRight', row: 2, col: 5, rotation: 270 },
  { type: 'kinkLeft', row: 1, col: 5, rotation: 0 },
  { type: 'straight', row: 0, col: 5, rotation: 0 },
  { type: 'kinkRight', row: -1, col: 5, rotation: 0 },
  { type: 'sweepRight', row: -2, col: 5, rotation: 90 },
  { type: 'kinkLeft', row: -2, col: 4, rotation: 90 },
  { type: 'straight', row: -2, col: 3, rotation: 90 },
  { type: 'straight', row: -2, col: 2, rotation: 90 },
  { type: 'kinkRight', row: -2, col: 1, rotation: 90 },
  { type: 'straight', row: -2, col: 0, rotation: 90 },
  { type: 'straight', row: -2, col: -1, rotation: 90 },
  { type: 'kinkLeft', row: -2, col: -2, rotation: 90 },
  { type: 'straight', row: -2, col: -3, rotation: 90 },
  { type: 'arc45Left', row: -2, col: -4, rotation: 270 },
  { type: 'arc45', row: -1, col: -5, rotation: 0 },
  { type: 'arc45Left', row: 0, col: -5, rotation: 180 },
  { type: 'arc45', row: 1, col: -4, rotation: 270 },
  { type: 'arc45Left', row: 1, col: -3, rotation: 90 },
  { type: 'arc45Left', row: 0, col: -2, rotation: 270 },
  { type: 'straight', row: 0, col: -1, rotation: 90 },
]

export const TRACK_TEMPLATES: TrackTemplate[] = [
  {
    id: 'starter-oval',
    label: 'Starter oval',
    description: 'Classic balanced loop with clear corners and straights.',
    pieces: DEFAULT_TRACK_PIECES,
  },
  {
    id: 'sweep-loop',
    label: 'Sweep loop',
    description: 'Same compact shape with smoother, faster corners.',
    pieces: SWEEP_LOOP,
  },
  {
    id: 's-curve-loop',
    label: 'S-curve loop',
    description: 'Compact technical loop with weaving straight sections.',
    pieces: S_CURVE_LOOP,
  },
  {
    id: 'reference-gp',
    label: 'Reference GP',
    description: 'Miami-style replica with subtle kinks, a long top straight, right stack, lower run, and diagonal start sector.',
    pieces: REFERENCE_GP_LOOP,
  },
]

export function cloneTemplatePieces(template: TrackTemplate): Piece[] {
  return template.pieces.map((piece) => ({ ...piece }))
}

export function getTrackTemplate(id: string): TrackTemplate | null {
  return TRACK_TEMPLATES.find((template) => template.id === id) ?? null
}

export function templateFitsTrackLimit(template: TrackTemplate): boolean {
  return template.pieces.length <= MAX_PIECES_PER_TRACK
}
