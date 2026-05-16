import { DEFAULT_TRACK_PIECES } from '@/lib/defaultTrack'
import { MAX_PIECES_PER_TRACK, type Piece } from '@/lib/schemas'
import { convertV1Pieces } from '@/lib/trackVersion'

export interface TrackTemplate {
  id: string
  label: string
  description: string
  pieces: Piece[]
}

const SWEEP_LOOP: Piece[] = convertV1Pieces([
  { type: 'straight', row: 1, col: 0, rotation: 0 },
  { type: 'sweepRight', row: 0, col: 0, rotation: 0 },
  { type: 'straight', row: 0, col: 1, rotation: 90 },
  { type: 'sweepRight', row: 0, col: 2, rotation: 90 },
  { type: 'straight', row: 1, col: 2, rotation: 0 },
  { type: 'sweepRight', row: 2, col: 2, rotation: 180 },
  { type: 'straight', row: 2, col: 1, rotation: 90 },
  { type: 'sweepRight', row: 2, col: 0, rotation: 270 },
])

const S_CURVE_LOOP: Piece[] = convertV1Pieces([
  { type: 'scurve', row: 1, col: 0, rotation: 0 },
  { type: 'right90', row: 0, col: 0, rotation: 0 },
  { type: 'scurveLeft', row: 0, col: 1, rotation: 90 },
  { type: 'right90', row: 0, col: 2, rotation: 90 },
  { type: 'scurveLeft', row: 1, col: 2, rotation: 0 },
  { type: 'right90', row: 2, col: 2, rotation: 180 },
  { type: 'scurve', row: 2, col: 1, rotation: 90 },
  { type: 'right90', row: 2, col: 0, rotation: 270 },
])

const REFERENCE_GP_LOOP: Piece[] = convertV1Pieces([
  { type: 'arc45Left', row: 0, col: 0, rotation: 180 },
  { type: 'diagonal', row: 1, col: 1, rotation: 90 },
  { type: 'diagonal', row: 2, col: 2, rotation: 90 },
  { type: 'arc45Left', row: 3, col: 3, rotation: 0 },
  { type: 'arc45', row: 4, col: 3, rotation: 180 },
  { type: 'arc45Left', row: 5, col: 2, rotation: 90 },
  { type: 'kinkLeft', row: 5, col: 1, rotation: 90 },
  { type: 'kinkRight', row: 5, col: 0, rotation: 90 },
  { type: 'arc45Left', row: 5, col: -1, rotation: 270 },
  { type: 'diagonal', row: 6, col: -2, rotation: 0 },
  { type: 'diagonal', row: 7, col: -3, rotation: 0 },
  { type: 'arc45', row: 8, col: -4, rotation: 0 },
  { type: 'arc45Left', row: 9, col: -4, rotation: 180 },
  { type: 'arc45', row: 10, col: -3, rotation: 270 },
  { type: 'kinkRight', row: 10, col: -2, rotation: 90 },
  { type: 'straight', row: 10, col: -1, rotation: 90 },
  { type: 'kinkLeft', row: 10, col: 0, rotation: 90 },
  { type: 'straight', row: 10, col: 1, rotation: 90 },
  { type: 'arc45Left', row: 10, col: 2, rotation: 90 },
  { type: 'diagonal', row: 9, col: 3, rotation: 0 },
  { type: 'arc45', row: 8, col: 4, rotation: 180 },
  { type: 'kinkRight', row: 7, col: 4, rotation: 0 },
  { type: 'kinkLeft', row: 6, col: 4, rotation: 0 },
  { type: 'arc45', row: 5, col: 4, rotation: 0 },
  { type: 'diagonal', row: 4, col: 5, rotation: 0 },
  { type: 'diagonal', row: 3, col: 6, rotation: 0 },
  { type: 'diagonal', row: 2, col: 7, rotation: 0 },
  { type: 'diagonal', row: 1, col: 8, rotation: 0 },
  { type: 'diagonal', row: 0, col: 9, rotation: 0 },
  { type: 'arc45', row: -1, col: 10, rotation: 180 },
  { type: 'kinkRight', row: -2, col: 10, rotation: 0 },
  { type: 'arc45', row: -3, col: 10, rotation: 0 },
  { type: 'arc45Left', row: -4, col: 11, rotation: 270 },
  { type: 'arc45', row: -4, col: 12, rotation: 90 },
  { type: 'arc45Left', row: -3, col: 13, rotation: 0 },
  { type: 'kinkRight', row: -2, col: 13, rotation: 0 },
  { type: 'arc45', row: -1, col: 13, rotation: 180 },
  { type: 'arc45Left', row: 0, col: 12, rotation: 90 },
  { type: 'sweepRight', row: 0, col: 11, rotation: 270 },
  { type: 'arc45', row: -1, col: 11, rotation: 0 },
  { type: 'arc45', row: -2, col: 12, rotation: 180 },
  { type: 'arc45', row: -3, col: 12, rotation: 0 },
  { type: 'diagonal', row: -4, col: 13, rotation: 0 },
  { type: 'arc45', row: -5, col: 14, rotation: 180 },
  { type: 'sweepRight', row: -6, col: 14, rotation: 90 },
  { type: 'kinkRight', row: -6, col: 13, rotation: 90 },
  { type: 'straight', row: -6, col: 12, rotation: 90 },
  { type: 'kinkLeft', row: -6, col: 11, rotation: 90 },
  { type: 'straight', row: -6, col: 10, rotation: 90 },
  { type: 'kinkRight', row: -6, col: 9, rotation: 90 },
  { type: 'straight', row: -6, col: 8, rotation: 90 },
  { type: 'kinkLeft', row: -6, col: 7, rotation: 90 },
  { type: 'straight', row: -6, col: 6, rotation: 90 },
  { type: 'kinkRight', row: -6, col: 5, rotation: 90 },
  { type: 'straight', row: -6, col: 4, rotation: 90 },
  { type: 'kinkLeft', row: -6, col: 3, rotation: 90 },
  { type: 'straight', row: -6, col: 2, rotation: 90 },
  { type: 'arc45Left', row: -6, col: 1, rotation: 270 },
  { type: 'arc45', row: -5, col: 0, rotation: 0 },
  { type: 'arc45Left', row: -4, col: 0, rotation: 180 },
  { type: 'arc45Left', row: -3, col: 1, rotation: 0 },
  { type: 'arc45', row: -2, col: 1, rotation: 180 },
  { type: 'arc45', row: -1, col: 0, rotation: 0 },
])

// Elongated oval with a top-straight chicane, modeled after the corner
// sequence of Top Gear 2's opening track: two long parallel straights
// flanked by four sweeping right-handers, with a single kink-right /
// kink-left pair on the top run to break up the flat-out section.
// The layout is wide and forgiving so it reads as a "level 1" track for
// a player still learning the chase camera.
const TOP_GEAR_OPENER: Piece[] = convertV1Pieces([
  // Start/finish straight, six cells long heading north up col 0.
  { type: 'straight', row: 5, col: 0, rotation: 0 },
  { type: 'straight', row: 4, col: 0, rotation: 0 },
  { type: 'straight', row: 3, col: 0, rotation: 0 },
  { type: 'straight', row: 2, col: 0, rotation: 0 },
  { type: 'straight', row: 1, col: 0, rotation: 0 },
  // T1: wide right-hander into the top run.
  { type: 'sweepRight', row: 0, col: 0, rotation: 0 },
  // Top run with mid-straight chicane (right kink, then left kink).
  { type: 'straight', row: 0, col: 1, rotation: 90 },
  { type: 'kinkRight', row: 0, col: 2, rotation: 90 },
  { type: 'kinkLeft', row: 0, col: 3, rotation: 90 },
  { type: 'straight', row: 0, col: 4, rotation: 90 },
  // T2: wide right-hander onto the back straight.
  { type: 'sweepRight', row: 0, col: 5, rotation: 90 },
  // Back straight, six cells long heading south down col 5.
  { type: 'straight', row: 1, col: 5, rotation: 0 },
  { type: 'straight', row: 2, col: 5, rotation: 0 },
  { type: 'straight', row: 3, col: 5, rotation: 0 },
  { type: 'straight', row: 4, col: 5, rotation: 0 },
  { type: 'straight', row: 5, col: 5, rotation: 0 },
  // T3: wide right-hander onto the bottom run.
  { type: 'sweepRight', row: 6, col: 5, rotation: 180 },
  { type: 'straight', row: 6, col: 4, rotation: 90 },
  { type: 'straight', row: 6, col: 3, rotation: 90 },
  { type: 'straight', row: 6, col: 2, rotation: 90 },
  { type: 'straight', row: 6, col: 1, rotation: 90 },
  // T4: wide right-hander back onto the start/finish straight.
  { type: 'sweepRight', row: 6, col: 0, rotation: 270 },
])

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
    description: 'Miami-style replica with a diagonal start, T1-T3 complex, lower loop, right stack, top straight, and T17-T19 return.',
    pieces: REFERENCE_GP_LOOP,
  },
  {
    id: 'top-gear-opener',
    label: 'Top Gear opener',
    description: 'Wide elongated oval with two long straights, four sweeping right-handers, and a single chicane on the top run.',
    pieces: TOP_GEAR_OPENER,
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
