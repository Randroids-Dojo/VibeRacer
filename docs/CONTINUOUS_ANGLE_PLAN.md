# Continuous-Angle Track Editor: Plan and Status

This document is the SOLE source of truth for the continuous-angle
migration. Every decision, contract, test wall, and unfinished slice is
captured here so chat history is not load-bearing.

A fresh coding session should read this file plus `AGENTS.md`. Read
`docs/PROGRESS_LOG.md` and `docs/FOLLOWUPS.md` for context only;
contracts referenced there are summaries of this document. If anything
in those files contradicts this one, this one wins and the other should
be fixed.

## Why this exists

The track editor today snaps to a discrete grid: every piece sits on
integer (row, col), every connector points in one of 8 cardinal /
diagonal directions, every rotation is one of 0 / 90 / 180 / 270.

That grid cannot express Miami's back straight at ~25 degrees off
cardinal, or any other real-circuit angle that is not a multiple of 45.
The Flex Straight (commit `01acd8c`, squashed into main as `673a5ec`)
adds a denser-rational angle set via integer length and lateral offsets,
but it is still a discrete snap; it cannot produce 25.0 degrees, only
26.57 degrees (length=2, lateral=1) as the nearest neighbor.

The grand plan, sourced from the user-supplied
"continuousanglespec2.html", replaces integer-cell addressing with
floating-point world transforms and replaces cardinal-port matching with
epsilon-tolerant world-frame matching. After that, free-rotation is just
a UX feature.

## Staging

Three medium PRs, not one giant one. The spec explicitly warns against
trying to land it as a single change. Each stage's failure mode is
distinct so they want separate review attention.

### Stage 0: connection-engine substrate. SHIPPED.

PR #98, squash-merged as `673a5ec`. Replaced cell-equality connector
matching with epsilon-tolerant world-frame matching while every existing
piece still serialised and rendered identically. Cell-aligned pieces hit
zero numerical drift in the new matcher, so every existing track
validated and hashed unchanged.

What landed:

- `src/game/pieceFrames.ts`: `Frame { x, z, theta }`, `frameOfPort`,
  `framesConnect` (epsilon match: 0.5 world units position, 2 degrees
  tangent, antiparallel), `tangentsAreAntiparallel`. The position +
  antiparallel-tangent definition is unambiguous; both `θ_a − θ_b − π`
  and `θ_a + θ_b` formulations were considered; the subtraction form
  with mod-2π wrap is the correct one because frames face outward.
- `src/game/track.ts portsConnect`: rewritten to use frame matching.
- Long-chain regression test (`tests/unit/track.test.ts`): 60-piece
  rectangle validates with maxJoinDistance == 0 and maxTangentDelta == 0
  exactly. Stage 1 v2 transforms must reproduce this bit-for-bit on
  round-trip; Stage 2 continuous loops must stay below
  `DEFAULT_FRAME_EPSILON_POS` so the matcher still closes.
- Wrap-seam antiparallel tests at three points (parallel near +PI seam,
  truly antiparallel near seam, antiparallel with one tangent past +PI).

### Stage 0.5: geometry shim. SHIPPED.

PR #98 (same merge). Introduced `geometryOf(piece) → { transform,
endpoints, footprint }` as the single accessor downstream code consumes,
so Stage 1 proper changes only one implementation file rather than every
renderer call site. Endpoints locked as connector source of truth: the
validator iterates `endpointsOf(neighbor)` directly; nothing else
iterates `connectorPortsOf` for matching purposes.

What landed:

- `src/game/pieceGeometry.ts`: `geometryOf`, `transformOf`, `endpointsOf`.
  Implementation derives every field from `(row, col, rotation)` today.
  `transform.theta` documented as clockwise (compass-wise) to match the
  existing `piece.rotation` field, so Stage 1 proper can swap the
  derivation without sign-flipping every downstream renderer.
- Validator's `portsConnect` and `findConnectedNeighbor`: switched to
  `endpointsOf(neighbor)` (not `geometryOf(neighbor).endpoints`) so the
  O(n^2) hot path skips the supercover footprint computation that
  `geometryOf` would also do. Caching endpoints across one validation
  pass would shave another constant factor; do that as a follow-up
  only if profiling shows it's still hot.
- `tests/unit/pieceGeometry.test.ts`: SHA-256 baseline hashes for every
  template across three downstream pipelines:
  - sceneBuilder vertex buffer hash + vertex count
  - minimap path string hash
  - thumbnail path string hash
  Plus a meta-test that fails loud if a new template lands without a
  baseline entry. These hashes are the load-bearing wall: Stage 1
  proper must reproduce them exactly or the geometry path silently
  shifted.

### Stage 1 proper: schema swap. NOT STARTED.

Add `transform: { x: number; z: number; theta: number }` to
`PieceSchema` as the authoritative geometry. Bump the schema version.
v1 → v2 converter on load is exact and lossless (`{ row, col, rotation }
→ { x: col*CELL_SIZE, z: row*CELL_SIZE, theta: rotation*PI/180 }`).
Save in v2. Old clients refuse v2 by schema version mismatch (one-way
door, hence the deliberate sequencing after Stage 0.5 stabilises).

**Schema model, pinned.** One model, no fallback path:

- `Piece.transform` is OPTIONAL on the wire format only so v1 payloads
  parse without rewriting historical KV entries. v1 omits `transform`;
  v2 includes it.
- The v1 → v2 converter runs once at load, immediately after schema
  parse, and populates `transform` for every piece using the deterministic
  `(row, col, rotation) → { x: col*CELL_SIZE, z: row*CELL_SIZE,
  theta: rotation*PI/180 }` mapping. This is exact and lossless.
- After load, the in-memory invariant is: every piece has `transform`
  populated. `geometryOf`, `transformOf`, and `endpointsOf` all read
  from `transform` directly; no fallback to cell derivation, no branch
  on whether `transform` is defined. The "fallback to cells" path the
  Stage 0.5 doc gestured at is removed; the converter makes it
  unreachable.
- The version gate lives on `TrackVersionSchema` (the persisted form
  with `createdByRacerId` / `createdAt`), NOT on `TrackSchema`
  (in-memory edit-time only). New optional field
  `schemaVersion: z.literal(1).or(z.literal(2)).optional()` on
  `TrackVersionSchema`; missing or `1` is v1, explicit `2` is v2.
- "Old clients refuse v2" mechanism: the read path explicitly checks
  `parsed.schemaVersion` after parse and throws a typed
  `SchemaTooNew` error when the value exceeds the build's
  `MAX_SCHEMA_VERSION` constant. This is more reliable than relying on
  zod strict mode (current `TrackVersionSchema` is non-strict and
  silently passes unknown fields). The strict-vs-explicit choice is
  recorded so future contributors don't try to "simplify" by adding
  `.strict()` and losing forward-compat for additive fields.

Hash canonicalization preserves v1 hashes for tracks whose transforms
project exactly back to integer cells (every track that exists today).
The Stage 0.5 snapshot hashes are the safety net: if any downstream
output shifts, Stage 1's `geometryOf` or converter is wrong.

#### Stage 1 pre-decisions, locked.

These are duplicated in `docs/FOLLOWUPS.md`; reproduced here so the plan
stays self-contained.

**Rule 1: "exactly back to integer cells" means snap-on-save with
epsilon.** A v2 piece's transform is grid-aligned (and canonicalises as
v1 in the hash) when:

- `transform.x / CELL_SIZE` rounds to an integer within `1e-6`.
- `transform.z / CELL_SIZE` rounds to an integer within `1e-6`.
- `transform.theta mod PI/2` is within `1e-4` radians of zero.

Position epsilon is sub-micron, effectively bit-equal float. Rotation
epsilon is two orders of magnitude looser because rotation accumulates
more representation error through sin / cos and through composed
operations (group rotate, undo, redo). A `1e-6` rotation epsilon would
reject pieces visually indistinguishable from grid-aligned. Define
constants in `pieceGeometry.ts` with a comment explaining the asymmetry
at the call site.

The editor's save path runs a snap-to-grid pass before serialisation:
every piece whose transform is within these epsilons gets its transform
snapped exactly to the nearest integer / `PI/2` multiple, then hashed.
A user who rotates a piece `0.0001°` and back ends up with a
hash-identical track.

**Rule 2: per-piece preservation in v1 tracks.** "v1-projectable" is a
DERIVED PROPERTY, not a stored tag.

- The piece schema does not carry an `isV1Projectable` field.
- Implementation contract: a single
  `function isV1Projectable(piece): boolean` reads the transform and
  returns the answer. Nothing else stores or caches this state.
- Why derived: manual tag management (rotate handler clears it,
  translate handler clears it, undo restores it, ...) is brittle. A
  single missed call site silently breaks hash stability for users.
  Derived means correct by construction.
- On save, canonical JSON for a piece where `isV1Projectable(piece)`
  is true omits `transform` and emits legacy `(row, col, rotation)`
  computed from the projection. Otherwise emits `transform`.
- Result: a 50-piece v1 track where the user rotates one piece by 14°
  produces a v2 hash that differs only in that one piece's bytes.

Editor tests for Stage 1: run every mutating operation against an
algebraically known input and assert `isV1Projectable` returns the
expected answer. The property is derived, so the test is a single
algebraic check rather than a per-op tag-update audit.

Fallback safety valve: if a future change makes `isV1Projectable` unsafe
to compute (non-deterministic transform), the converter falls back to
"every piece in a saved v2 track emits transform". With the property
derived, this fallback is dead code; should never trigger.

### Stage 2: editor UX, behind a feature flag. NOT STARTED.

- Translate handle (already exists for selection drag).
- Rotate handle: a small ring around an endpoint. Drag rotates the
  entire piece around that endpoint, preserving connection at the other
  end. This is the key affordance for "I want this straight at exactly
  this angle".
- Free-placement mode: drop a piece anywhere; nearest-neighbor query
  against unconnected endpoints in a snap radius (~15 world units, 30
  degrees); soft pull rotates and translates so the dragged endpoint
  frame matches exactly.
- Optional numeric input on long-press for `x, z, theta`. Power users.
- Feature-flag gated. Internal testing without exposing it.
- Reconciliation pass for nearly-closed continuous-angle loops: detect
  "loop closes within wider epsilon" and snap the last endpoint exactly
  to the first before save. Belongs here, not Stage 1.
- OBB-vs-OBB overlap detection: spatial hash + AABB pre-check before
  full OBB. Footprint contract stays a list of cells in Stage 1 and
  arbitrary-angle pieces enumerate cells via the existing supercover.

### Stage 3: flip the flag. NOT STARTED.

- Update tutorials.
- Decide whether Flex angle becomes a discrete-snap shortcut (rational
  `atan(p/q)` angles) or gets deprecated. Probably keep it: some
  authors prefer the constraint.

## Risks captured

1. **Floating-point drift in long chains.** Stage 0 long-chain test
   pins zero drift on cell-aligned v1 input. Stage 1's converter must
   reproduce that bit-for-bit. If it doesn't, the converter is wrong.
2. **Reconciliation pass for nearly-closed loops.** Stage 2 territory
   but the spec lives in Stage 1's pre-decisions for completeness.
3. **OBB-vs-OBB collision once footprint is no longer cells.** Spatial
   hash + AABB pre-check before OBB. Stage 2.

## File-by-file map

| File | Role |
|---|---|
| `src/game/pieceFrames.ts` | Stage 0 substrate. `Frame`, `frameOfPort`, `framesConnect`, antiparallel matcher. |
| `src/game/pieceGeometry.ts` | Stage 0.5 shim. `geometryOf`, `transformOf`, `endpointsOf`. Stage 1 changes the implementation. |
| `src/game/track.ts` | Validator. `portsConnect` and `findConnectedNeighbor` consume `endpointsOf`. |
| `src/lib/schemas.ts` | `PieceSchema`. Stage 1 adds `transform` field, bumps version. |
| `src/lib/hashTrack.ts` | Canonical JSON. Stage 1 implements Rule 1 + Rule 2 here. |
| `src/components/TrackEditor.tsx` | Stage 2 adds rotate handle + free-placement mode. |
| `tests/unit/pieceFrames.test.ts` | Stage 0 contract tests. |
| `tests/unit/pieceGeometry.test.ts` | Stage 0.5 baseline hashes. The wall Stage 1 must not break. |
| `tests/unit/track.test.ts` | Long-chain closure test, sub-45 angled flex straight test. |
| `tests/unit/hashTrack.test.ts` | Existing template hash pins (Stage 0a). |
| `docs/FOLLOWUPS.md` | Stage 1 pre-decisions (Rule 1, Rule 2). |
| `docs/PROGRESS_LOG.md` | One entry per shipped slice. Read for context, not for plan. |

## Picking up where this left off

Next slice is Stage 1 proper. Order of work matches the pinned schema
model above; do not deviate without updating that section first.

1. Add `transform: { x: number; z: number; theta: number }` to
   `PieceSchema` as optional in the wire format. Optional only because
   v1 payloads omit it; the in-memory invariant (after step 4 runs) is
   that every piece has it populated.
2. Add `schemaVersion: z.literal(1).or(z.literal(2)).optional()` to
   `TrackVersionSchema` (the persisted form, NOT `TrackSchema`). Define
   `MAX_SCHEMA_VERSION = 2` as a constant. Missing or `1` is v1;
   explicit `2` is v2.
3. Add an explicit `if (parsed.schemaVersion !== undefined &&
   parsed.schemaVersion > MAX_SCHEMA_VERSION) throw new SchemaTooNew()`
   check on every read path that parses `TrackVersionSchema`. Do NOT
   add `.strict()` to the schema; it would lose forward-compat for
   future additive fields. The explicit check is the version gate.
4. Build the v1 → v2 converter as a single function (recommend new
   module `src/lib/trackVersion.ts`):
   `convertV1Piece(piece) → { ...piece, transform: derivedFromCells }`.
   Deterministic, exact, lossless. Call this immediately after schema
   parse on every load path so downstream code can rely on `transform`
   being populated.
5. Implement `isV1Projectable(piece): boolean` in `pieceGeometry.ts` as
   a pure derived check using the two epsilons defined as constants in
   the same file. Add the asymmetry-rationale comment beside the
   constants.
6. Change `transformOf` and `endpointsOf` in `pieceGeometry.ts` to read
   ONLY from `transform`. Drop the cell-derivation path; the converter
   makes it unreachable. Stage 0.5 snapshot hashes must still reproduce
   exactly, since the converter is exact.
7. Change `canonicalTrackJson` in `src/lib/hashTrack.ts`: pieces where
   `isV1Projectable` is true emit legacy `(row, col, rotation)` and
   omit `transform`; otherwise emit `transform`. Track-level emits
   `schemaVersion: 2` only when at least one piece is non-v1-projectable
   (so an unedited v1 track round-trips to byte-identical v1 JSON).
8. Run the Stage 0.5 snapshot test wall. Every hash must reproduce
   exactly. If any shifts, the converter or `geometryOf` is wrong.
9. Editor tests: place piece on grid, run every mutating operation
   (rotate, translate, group rotate, flip, undo, redo, snap-on-save)
   against algebraically known input, assert `isV1Projectable` returns
   correctly. Because the property is derived, this is a single
   algebraic check rather than a per-op tag-update audit.
10. Document the one-way door in PROGRESS_LOG: bumping
    `MAX_SCHEMA_VERSION` is now a deploy-coordinated change.

If profiling shows `findConnectedNeighbor` is slow on big tracks, add a
per-validation endpoint cache as a follow-up before Stage 2.
