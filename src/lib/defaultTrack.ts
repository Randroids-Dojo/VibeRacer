import type { Piece } from './schemas'
import { convertV1Pieces } from './trackVersion'

// 8-piece rectangular loop on a 3x3 grid. Piece 0 is a straight so the car
// spawns cleanly on the track centerline heading north. Transforms populated
// at module init via the v1 to v2 converter so this constant satisfies the
// post-load invariant: every piece carries `transform`.
export const DEFAULT_TRACK_PIECES: Piece[] = convertV1Pieces([
  { type: 'straight', row: 1, col: 0, rotation: 0 },
  { type: 'right90', row: 0, col: 0, rotation: 0 },
  { type: 'straight', row: 0, col: 1, rotation: 90 },
  { type: 'right90', row: 0, col: 2, rotation: 90 },
  { type: 'straight', row: 1, col: 2, rotation: 0 },
  { type: 'right90', row: 2, col: 2, rotation: 180 },
  { type: 'straight', row: 2, col: 1, rotation: 90 },
  { type: 'right90', row: 2, col: 0, rotation: 270 },
])
