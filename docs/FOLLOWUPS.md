# Followups

Backlog spillover discovered during implementation. Keep items PR-sized when possible.

## High Priority

- None recorded.

## Medium Priority

- None recorded.

## Low Priority

- Gamepad rumble: collision-magnitude impulses. Blocked until gameplay has a real collision event source. Current barriers, cones, trees, and decorations are visual-only, and the physics integrator only emits off-track drag state. Once the vehicle can hit a wall or obstacle, emit an impact magnitude so the rumble path can scale a one-shot cue to contact strength.

## Continuous-angle Stage 1 pre-decisions

These rules are pinned before the Stage 1 proper PR opens so the converter
and the canonicalizer cannot disagree at write time.

**Read `docs/CONTINUOUS_ANGLE_PLAN.md` first.** That document is the
source of truth for the entire continuous-angle migration: what shipped
in Stages 0 and 0.5, what is still ahead in Stages 1 / 2 / 3, the file
map, the risks, and the order-of-work for the next slice. The two rules
below are reproduced inside it; this section duplicates them here only
because `AGENTS.md` mandates reading `docs/FOLLOWUPS.md` before each
implementation slice. Treat any mismatch between the two as a doc bug
and fix it.

### Rule 1: "exactly back to integer cells" means snap-on-save with epsilon.

A v2 piece's transform is considered grid-aligned (and therefore eligible
to canonicalize as v1 in the hash) when:

- `transform.x / CELL_SIZE` rounds to an integer within `1e-6` (about
  `0.00002` world units of slop on a 20-unit cell).
- `transform.z / CELL_SIZE` rounds to an integer within the same epsilon.
- `transform.theta` mod `PI / 2` is within `1e-4` radians of zero (about
  `0.006` degrees of slop).

The position epsilon is sub-micron (effectively bit-equal float) while
the rotation epsilon is two orders of magnitude looser. The asymmetry is
deliberate: rotation accumulates more representation error than position
because every rotate operation runs through sin / cos, and the editor's
group-rotate / undo / redo paths can compose several rotations before a
save. A `1e-6` rotation epsilon would reject pieces that are visually
indistinguishable from grid-aligned. Pin a comment to that effect on the
constants when they land in `pieceGeometry.ts` so the next contributor
sees the reasoning at the call site.

These epsilons are defined as constants in `pieceGeometry.ts` so the
converter, the canonicalizer, and the editor's snap-on-save path read the
same numbers. A piece that fails any check is a true v2 piece and goes
into the canonical JSON with its full transform.

The editor's save path runs a snap-to-grid pass before serialisation:
every piece whose transform is within these epsilons gets its transform
snapped exactly to the nearest integer / `PI/2` multiple, then hashed.
This means a Stage 2 user who rotates a piece `0.0001°` and back ends up
with a hash-identical track, not a near-miss.

### Rule 2: per-piece preservation in v1 tracks.

When a Stage 2 user opens a v1 track and edits one piece, the other
unchanged pieces must serialise back in their v1-projectable form so the
canonical JSON for those pieces is byte-identical to the original load.
Concretely:

- "v1-projectable" is a DERIVED PROPERTY, not a stored tag. The piece
  schema does not carry an `isV1Projectable` field. Every read computes
  it fresh by running Rule 1's checks against the current transform.
  Implementation contract: a single `function isV1Projectable(piece):
  boolean` reads the transform and returns the answer; nothing else
  stores or caches this state.
- Why derived: the alternative ("each editor operation manually clears
  or preserves the tag") is brittle. Someone forgets to update the tag
  in the rotate handler, or the undo handler, or the new flip operation
  added next quarter, and a single missed call site silently breaks the
  hash-stability contract. Derived means correct by construction:
  operations that preserve grid alignment automatically preserve the
  derivation; operations that don't, don't.
- On save, the canonical JSON for a piece where `isV1Projectable(piece)`
  is true omits the `transform` field and emits the legacy
  `(row, col, rotation)` form (computed from the projection). Pieces
  where it is false emit `transform`.
- Result: a 50-piece v1 track where the user rotates one piece by 14°
  produces a v2 hash that differs only in that one piece's bytes; the
  other 49 pieces hash identically to the v1 form. UX-visible "this
  track changed" indicators only fire for the piece the user actually
  touched.

Editor tests for Stage 1: place a piece on the grid, run every editor
operation that mutates a piece (rotate, translate, group rotate, flip,
undo, redo, snap-on-save) against an algebraically known input, and
assert `isV1Projectable` returns the correct answer. Because the
property is derived, the test is a single algebraic check rather than a
per-op tag-update audit.

Fallback safety valve: if a future change makes `isV1Projectable` unsafe
to compute (for example a non-deterministic transform), the converter
falls back to "every piece in a saved v2 track emits `transform`" and
the hash changes for all pieces that pass through any v2 save. With the
property derived, this fallback is dead code; it should never trigger.

### Out of scope for Stage 1, deferred to Stage 2:

- Reconciliation pass for nearly-closed continuous-angle loops. Detect
  "loop closes within wider epsilon" and snap the last endpoint exactly
  to the first before save. Belongs with the rotate-handle UX.
- OBB-vs-OBB overlap detection. The footprint contract stays a list of
  cells in Stage 1; arbitrary-angle pieces enumerate cells via the
  existing supercover.

