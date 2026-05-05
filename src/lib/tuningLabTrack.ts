import type { Piece } from './schemas'
import { convertV1Pieces } from './trackVersion'

// Curated 12-piece closed loop used by the Tuning Lab. Spawn on a straight
// heading north, drive a top oval, then a southward S-curve detour (right,
// straight, left) that bottoms out at a hairpin and climbs back to the start.
// Pieces in traversal order so buildTrackPath walks them cleanly. Transforms
// are populated at module init to satisfy the post-load v2 invariant.
export const TUNING_LAB_TRACK_PIECES: Piece[] = convertV1Pieces([
  { type: 'straight', row: 1, col: 0, rotation: 0 },
  { type: 'right90', row: 0, col: 0, rotation: 0 },
  { type: 'straight', row: 0, col: 1, rotation: 90 },
  { type: 'right90', row: 0, col: 2, rotation: 90 },
  { type: 'straight', row: 1, col: 2, rotation: 0 },
  { type: 'right90', row: 2, col: 2, rotation: 180 },
  { type: 'left90', row: 2, col: 1, rotation: 270 },
  { type: 'straight', row: 3, col: 1, rotation: 0 },
  { type: 'right90', row: 4, col: 1, rotation: 180 },
  { type: 'left90', row: 4, col: 0, rotation: 180 },
  { type: 'straight', row: 3, col: 0, rotation: 0 },
  { type: 'straight', row: 2, col: 0, rotation: 0 },
])

export const TUNING_LAB_TRACK_DESCRIPTION =
  'Short test loop: long straights, two right turns, an S-curve detour, and a hairpin.'
