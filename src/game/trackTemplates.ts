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
  { type: 'sweepRight', row: 0, col: 0, rotation: 0 },
  { type: 'straight', row: 1, col: 0, rotation: 0 },
  { type: 'straight', row: 2, col: 0, rotation: 0 },
  { type: 'sweepRight', row: 3, col: 0, rotation: 180 },
  { type: 'sweepRight', row: 3, col: -1, rotation: 0 },
  { type: 'straight', row: 4, col: -1, rotation: 0 },
  { type: 'scurve', row: 5, col: -1, rotation: 0 },
  { type: 'sweepRight', row: 6, col: -1, rotation: 180 },
  { type: 'scurveLeft', row: 6, col: -2, rotation: 90 },
  { type: 'straight', row: 6, col: -3, rotation: 90 },
  { type: 'straight', row: 6, col: -4, rotation: 90 },
  { type: 'sweepRight', row: 6, col: -5, rotation: 270 },
  { type: 'scurve', row: 5, col: -5, rotation: 0 },
  { type: 'straight', row: 4, col: -5, rotation: 0 },
  { type: 'sweepRight', row: 3, col: -5, rotation: 0 },
  { type: 'sweepRight', row: 3, col: -4, rotation: 180 },
  { type: 'sweepRight', row: 2, col: -4, rotation: 0 },
  { type: 'sweepRight', row: 2, col: -3, rotation: 180 },
  { type: 'scurve', row: 1, col: -3, rotation: 0 },
  { type: 'straight', row: 0, col: -3, rotation: 0 },
  { type: 'straight', row: -1, col: -3, rotation: 0 },
  { type: 'sweepRight', row: -2, col: -3, rotation: 0 },
  { type: 'straight', row: -2, col: -2, rotation: 90 },
  { type: 'straight', row: -2, col: -1, rotation: 90 },
  { type: 'scurveLeft', row: -2, col: 0, rotation: 90 },
  { type: 'straight', row: -2, col: 1, rotation: 90 },
  { type: 'straight', row: -2, col: 2, rotation: 90 },
  { type: 'sweepRight', row: -2, col: 3, rotation: 90 },
  { type: 'straight', row: -1, col: 3, rotation: 0 },
  { type: 'straight', row: 0, col: 3, rotation: 0 },
  { type: 'scurve', row: 1, col: 3, rotation: 0 },
  { type: 'sweepRight', row: 2, col: 3, rotation: 180 },
  { type: 'sweepRight', row: 2, col: 2, rotation: 270 },
  { type: 'scurve', row: 1, col: 2, rotation: 0 },
  { type: 'sweepRight', row: 0, col: 2, rotation: 90 },
  { type: 'straight', row: 0, col: 1, rotation: 90 },
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
    description: 'Large replica layout with a top straight, stacked right side, and tight infield.',
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
