// Leaf module owning shared geometry constants. Lives here so that
// pieceGeometry, pieceFrames, trackVersion, and trackPath can all import
// without forming a runtime cycle (pieceGeometry imports pieceFrames and
// vice versa for typed helpers, and trackPath imports trackVersion which
// imports pieceGeometry). External consumers can keep importing CELL_SIZE
// from `./trackPath`, which re-exports it.
export const CELL_SIZE = 20

// Projectability epsilons. A piece's transform is "v1-projectable" when:
//   - transform.x / CELL_SIZE rounds to an integer within
//     V1_PROJECTABLE_POSITION_EPSILON, and same for transform.z.
//   - transform.theta mod PI/2 is within V1_PROJECTABLE_ROTATION_EPSILON
//     of zero (or PI/2, since the residual wraps).
//
// Both `pieceGeometry` (the projectability check that gates canonical
// hashing) and `pieceFrames` (the residual rotation step in
// `frameOfPortAtTransform`) read from the same constants here. See
// `docs/CONTINUOUS_ANGLE_PLAN.md` "Rule 1" for the asymmetry rationale:
// the position epsilon is sub-micron because cell-aligned positions are
// integer multiples of CELL_SIZE and never accumulate float error, while
// the rotation epsilon is two orders of magnitude looser because every
// rotate operation runs through sin / cos and editor group-rotate / undo
// / redo paths can compose several rotations before a save.
export const V1_PROJECTABLE_POSITION_EPSILON = 1e-6
export const V1_PROJECTABLE_ROTATION_EPSILON = 1e-4
