# Plan: long turns, double-wide tracks, alternative routes

## Context

Three player requests need scaffolding without breaking the existing single-loop, fixed-width, single-path track system:

1. **Long turns for drifting.** A 90 degree corner traces about 15.7 units of arc, which is roughly 1 second of drift at race speed. The drift score multiplier in `src/game/drift.ts` ramps to its 4.0 cap over 4 seconds, so a single piece can never reward a max-multiplier slide. Players must currently chain corners and risk losing the streak between pieces.
2. **Double-wide tracks** for an upcoming multiplayer / CPU racer mode. Today `TRACK_WIDTH = 8` is a global constant baked into rendering, wheel contact, kerbs, scenery clearance, finish line, and minimap.
3. **Alternative routes** so authors can build city grids, highways with off-road shortcuts, and Forza-style multi-route maps. Today `validateClosedLoop` in `src/game/track.ts:42-103` rejects anything that is not a single connected component, and `TrackPath.order` (`src/game/trackPath.ts:57-66`) is a single ordered array.

The non-negotiable constraint: every existing track must continue to load, race, ghost-replay, and rank with a byte-identical `hashTrack` digest. Any track that does not opt into a new feature must produce the same canonical JSON it produces today.

## Scope decisions

| Question | Decision |
|---|---|
| Long turn shape (Feature 1) | Add the four new pieces from the user's diagram: **Mega Sweep (3x3, 90)**, **Hairpin (2x3, 180)**, **45 Arc (2x2, 45)**, **Diagonal (1x1, 45)**. Diagonals use a new corner-snap connection mode. The 45 Arc is the only bridge between cardinal and corner connectors. |
| Lap policy (Feature 3) | **Any closed path counts.** No primary route, no required checkpoint set. A lap is valid if the player crosses the finish in the forward direction after a closed walk through the track graph. |
| Width transition (Feature 2) | **Tapered.** Width interpolates linearly across the boundary piece so the road has no visible step. |

## Phasing

The diagram pushes Feature 1 into multi-cell footprint territory and adds a brand-new diagonal connector system. That overlap is unavoidable, so the phasing below front-loads the structural work into a Phase 0 that all three features depend on. Each phase is a PR-sized slice.

### Phase 0: shared scaffolding (must land first)

Pure refactor. No user-visible change. Existing tracks hash and play identically.

**0a. Per-piece width resolution. Done.** New module `src/game/trackWidth.ts` exports `DEFAULT_TRACK_WIDTH = 8`, `widthAt(op, t)`, and `halfWidthAt(op, t)`. The default implementation returns `DEFAULT_TRACK_WIDTH` for every piece. The road-contact, kerb, scenery, scene-geometry, finish-line, checkpoint-marker, minimap, and thumbnail width reads now route through the width helpers where piece context exists. `trackPath.ts` re-exports legacy `TRACK_WIDTH` so existing imports compile unchanged.

**0b. Segment-based TrackPath. Done.** `TrackPath` now carries `segments: PathSegment[]` where `PathSegment = { id, order: OrderedPiece[], closesLoop: boolean }`, plus `cellToLocators: Map<string, Locator[]>` where `Locator = { segmentId, idx }`. The legacy `path.order` and `cellToOrderIdx` fields remain intact for current single-loop callers. Existing tracks build to one `main` segment whose order is the same array as `path.order`, and each cell locator mirrors the legacy index.

**0c. Multi-cell footprint. Done.** `PieceSchema` now accepts `footprint?: { dr: number; dc: number }[]`, with helper normalization in `src/game/trackFootprint.ts`. Default footprints resolve to `[{ dr: 0, dc: 0 }]` and are omitted from canonical track JSON, so existing tracks keep their hashes. `validateClosedLoop` marks every footprint cell as occupied and rejects overlap, while preventing a footprint cell from satisfying its own connector. Editor placement, removal, selection counts, selected-piece movement, selected-piece rotation, and selected-piece flips now operate on the union of footprint cells per piece atomically.

**0d. 8-direction connector system. Done.** `Dir` now spans `0..7` (`N=0, NE=1, E=2, SE=3, S=4, SW=5, W=6, NW=7`) with corner offsets in `DIR_OFFSETS` and `opposite(d) = (d + 4) % 8`. `connectorsOf` now returns `Dir[]` and rotates 90-degree pieces by two 8-dir steps, which preserves every existing cardinal piece's adjacency while opening the connector arity needed for junctions. The path builder, editor mirror math, pace-note turn deltas, straight geometry orientation, and editor start arrow all read the new encoding.

**0e. Hash canonicalization plumbing. Done.** `src/lib/hashTrack.ts` now centralizes default omission for footprint, future `widthClass`, and future `branchEdges` hash inputs. `widthClass='standard'`, missing `widthClass`, missing branch edges, and empty branch edges all emit the same canonical JSON as existing tracks. Non-default width class and non-empty branch edges are included deterministically, with stable branch-edge key ordering and input-order-independent sorting.

**Phase 0 verification.** Snapshot test against a representative pre-Phase-0 track: identical `hashTrack` digest, identical sceneBuilder vertex counts, identical minimap rect bounds. New unit tests: `tests/unit/trackWidth.test.ts`, `tests/unit/trackPath.test.ts` (single-segment shape), `tests/unit/trackFootprint.test.ts`, `tests/unit/trackConnectors.test.ts` (8-dir cardinal-only behavior unchanged).

### Phase 1: long turns (the four new pieces)

Depends on 0c (multi-cell footprint) and 0d (8-dir connectors).

**1a. Mega Sweep (3x3, 90). Done.** New piece types `'megaSweepRight'` and `'megaSweepLeft'` are in `PieceTypeSchema`. Mega sweeps resolve to an implicit 3x3 footprint around the anchor cell, with connector-neighbor anchors allowed inside that footprint only when the pieces directly connect. Connectors stay `[S, E]` for `megaSweepRight` and `[S, W]` for `megaSweepLeft` at rotation 0. `trackPath.ts` now samples mega sweeps with 49 points, `MEGA_SWEEP_ARC_RADIUS = 1.5 * CELL_SIZE`, and a longer cubic centerline that stays inside the reserved 3x3 footprint.

**1b. Hairpin (2x3, 180). Done.** New piece type `'hairpin'` uses rotation to cover all orientations. Footprint covers a 2-wide x 3-tall block. Connector ports allow both connectors to sit on the same outer edge at different footprint rows: top W and bottom W at rotation 0. `trackPath.ts` now samples the hairpin with 65 points and a long 180-degree centerline inside the reserved footprint.

**1c. 45 Arc (45). Done.** New piece types `'arc45'` and `'arc45Left'` cover the right-hand and left-hand cardinal-to-corner bridges. `arc45` uses S to NE at rotation 0, and `arc45Left` uses S to NW at rotation 0. Their centerlines transition from a cardinal tangent to a 45-degree tangent over smooth sampled arcs. These are the bridges between cardinal pieces and diagonal runs.

**1d. Diagonal (1x1, 45). Done.** New piece type `'diagonal'`. Single-cell footprint. Two corner connectors (SW and NE in rotation 0). Centerline is a straight line across the cell at 45 degrees, length `CELL_SIZE * sqrt(2) ~= 28.3` units. Four rotations are accepted by the existing rotation schema; 180-degree rotations are geometrically equivalent but still harmless.

**Connector validation rule. Done.** A corner connector matches only the opposite corner connector of the diagonal-adjacent cell. `arc45` and `arc45Left` are the bridges: their cardinal connectors validate against cardinally-adjacent cells, and their corner connectors validate against diagonally-adjacent cells. Unit coverage verifies closed right-hand and left-hand diagonal runs bridged by 45 arcs and rejects a direct cardinal-to-diagonal mismatch.

**Editor. Done.** Add the long-turn and diagonal pieces to the `TrackEditor.tsx` palette. `mirroredPieceType()` swaps `megaSweepRight <-> megaSweepLeft` and `arc45 <-> arc45Left`; hairpins and diagonals mirror through rotation. Multi-cell placement reuses the Phase 0c machinery.

**Rendering.** Straight, corner, polyline geometries in `sceneBuilder.ts:276-363` already cover the new shapes if the polyline path is generic. Mega Sweep uses the corner geometry path with a larger radius parameter. Hairpin uses polyline with the new sample array. Arc45 and Diagonal use polyline. Verify thumbnail rasterizer (`lib/trackThumbnail.ts`) handles them.

**Wrong-way and wheel contact.** Both already iterate samples or arc geometry. New pieces drop in.

**Drift.** No code change. The longer arcs naturally let `drift.ts:67-71` ramp the multiplier higher within a single piece.

**Phase 1 verification.** New tests: `tests/unit/trackPath.test.ts` cases for each new piece (sample count, endpoint positions, tangent at each connector matches its declared Dir). `tests/unit/track.test.ts` cases for connector matching across cardinal/corner boundaries and rejection of misaligned chains. `tests/unit/wheelContact.test.ts` sweeps for all four pieces. `tests/unit/drift.test.ts` simulates a high-steer hold across a Hairpin and asserts multiplier exceeds 3.0. `tests/unit/hashTrack.test.ts` confirms a track with no new pieces hashes unchanged. Playwright `tests/e2e/long-turns.spec.ts` smoke-tests placing each new piece in the editor and racing a lap.

### Phase 2: double-wide tracks

Depends on Phase 0a.

**2a. Per-piece width.** Extend `PieceSchema` with `widthClass?: z.enum(['standard', 'wide'])`. Default omitted; `hashTrack.ts` emits per-piece value only when at least one piece is `'wide'`. Wide width = `2 * DEFAULT_TRACK_WIDTH = 16` units. Wide pieces still occupy the same cell footprint (`CELL_SIZE = 20`), so wide stays inside the cell with 2 units of margin per side, no `CELL_SIZE` change.

**2b. Tapered transition.** `widthAt(op, t)` resolves not only the piece's own widthClass but also blends with neighbors. For each piece, find the upstream and downstream piece via `cellToLocators`. If the neighbor's widthClass differs, interpolate linearly across the first/last 30% of the piece (`t in [0, 0.3]` blends from neighbor to self, `t in [0.7, 1.0]` blends from self to neighbor). Cubic-smooth easing later if the linear taper looks too geometric.

**2c. Variable-width extrusion.** Geometry builders in `sceneBuilder.ts:276-328` already extrude per-sample for polyline pieces. Change straight (`276-295`) and corner (`297-328`) geometries to sample width along the piece using `widthAt(op, t)` rather than a constant. Polyline (`330-363`) automatically picks up variable width once `widthAt` accepts variable `t`.

**2d. Wheel contact.** `wheelContact.ts:104` becomes `distance <= halfWidthAt(op, t)`. `distanceToCenterline` already finds the closest sample/angle; expose `t` (closest sample index normalized) alongside the distance.

**2e. Kerbs, scenery, finish line, minimap.** All read width via `widthAt` after Phase 0a. Verify kerb apex math at `kerbs.ts:60-128` interpolates correctly through transitions. Verify scenery clearance (`scenery.ts:38`) keeps trees off wide pieces. Finish stripe width (`sceneBuilder.ts:2158`) uses width at the finish piece.

**2f. Editor.** Add a `widthClass` toggle button in `TrackEditor.tsx` palette. New helper `setWidthOnSelectedPieces()` in `editor.ts` mirroring `rotateSelectedPieces` (`editor.ts:207-218`).

**Phase 2 verification.** New tests: `tests/unit/trackWidth.test.ts` for taper interpolation (8 to 16 over the boundary piece). `tests/unit/wheelContact.test.ts`: a car at `x=6` from centerline is on-track on a wide piece, off-track on a standard piece, on-track at the midpoint of a transition. `tests/unit/sceneBuilder.test.ts`: ribbon vertex count scales with widthClass; finish stripe width matches. `tests/unit/minimap.test.ts`: stroke pixel width tracks per-piece width. `tests/unit/scenery.test.ts`: trees stay clear of wide road. `tests/unit/hashTrack.test.ts`: track with all-standard pieces hashes unchanged; track with at least one wide piece produces a new hash. `tests/unit/api.track.test.ts`: server accepts and rejects malformed widthClass. Playwright `tests/e2e/wide-track.spec.ts`: place a wide section, race a lap, assert visible road width changes mid-lap.

### Phase 3: branching routes (any-path lap policy)

Depends on Phases 0b, 0c, 0d.

**3a. Junction piece type.** New piece type `'junction'` with three open connectors. Connectors are `Dir[]` of length 3 (Phase 0d). Rotation rotates all three. Footprint is one cell. Adjacency validation already accepts variable-length connector lists once Phase 0d lands.

**3b. Track validator: drop single-component requirement.** Replace `validateClosedLoop` (`track.ts:42-103`) with `validateBranchedTrack`. New rule: every connector must match a neighbor's opposite connector (unchanged), and every piece must be reachable from `pieces[0]` (unchanged). Drop the implicit assumption that the graph is a simple cycle; allow nodes of degree 3 (junctions). Validate that every junction has exactly 3 matched connectors.

**3c. Multi-segment path build.** `buildTrackPath` (`trackPath.ts:484-576`) becomes a graph walker that emits a `PathSegment` for each chain of pieces between junctions (or the full loop if no junctions). Each segment knows its start junction id, its end junction id, and whether it closes back to a junction or to the starting piece. `cellToLocators` lists every locator a cell appears in.

**3d. Wrong-way at junctions.** `wrongWay.ts:35-49` collects all candidate tangents from segments whose closest-point distance is within tolerance. Wrong-way fires only if the car heading opposes EVERY candidate tangent. Single-segment tracks reduce to today's behavior.

**3e. Wheel contact at junctions.** `wheelContact.ts:81-108` iterates `cellToLocators.get(key)` and reports on-track if ANY candidate's distance is within `halfWidthAt`. Single-segment tracks reduce to today's behavior.

**3f. Lap detection (any-path).** Existing finish-line crossing detection is geometry-based and doesn't need topology awareness. The lap is "any closed walk between two finish-line crossings in the forward direction." Server-side: `src/app/api/race/submit/route.ts` and `src/lib/anticheat.ts` continue to validate timing, max-speed, and continuity; they do not need to validate which pieces were visited in any particular order. Document this lap policy in `docs/OPEN_QUESTIONS.md` so future leaderboard work knows the policy.

**3g. Checkpoints in a branched track.** `cpTriggerPieceIdx` is per-segment-array under Phase 0b. For branched tracks, distribute checkpoints across the union of all pieces (or let authors place explicit `checkpoints` via the existing `TrackCheckpoint` schema, which already overrides `checkpointCount`). Lap-best splits become "best time between consecutive checkpoint hits, regardless of which segments were traversed."

**3h. Editor.** Junction in palette. Multi-cell footprint not needed (junction is 1 cell). Selection / move / rotate / flip work because Phase 0c made the editor footprint-aware.

**3i. Ghost replays.** No format change. Replays are `[x, z, heading]` time series, topology-agnostic. Old replays continue to play on their original track-version-hash; new versions get fresh leaderboards as today.

**Phase 3 verification.** New tests: `tests/unit/track.test.ts` validates a fork-merge loop, rejects orphan dead-ends. `tests/unit/trackPath.test.ts` builds multi-segment graph, asserts segment count and connectivity. `tests/unit/wrongWay.test.ts`: at a junction, opposing only one branch is not wrong-way; opposing all branches is. `tests/unit/wheelContact.test.ts`: car at junction-host cell is on-track when within half-width of any segment. `tests/unit/api.raceSubmit.test.ts`: any-path submission accepted as long as finish-line crossing is valid. `tests/unit/hashTrack.test.ts`: track with no junctions hashes unchanged. Playwright `tests/e2e/branching-track.spec.ts`: build a fork, race both routes, assert both complete a lap.

## Cross-feature interactions

| Combination | Resolution |
|---|---|
| Hairpin + wide | A wide hairpin has inner radius `30 - 8 = 22` units (still positive). Geometry is sound. Verify visually. |
| Mega Sweep + wide | Inner radius `30 - 8 = 22` units, outer `30 + 8 = 38` units. Footprint is 3x3 = 60 units; outer edge stays inside the footprint with 22 units of margin. Fine. |
| 45 Arc / Diagonal + wide | Cardinal-to-corner transition pieces with width 16 may visually overlap their cell boundaries at the corner snap. Block `widthClass='wide'` on `arc45`, `arc45Left`, and `diagonal` in `schemas.ts` superRefine for v1; lift later if visual review approves. |
| Junction + wide | Three wide connectors meeting at one cell creates a large floor plate. Block `widthClass='wide'` on junction pieces for v1. |
| Junction + diagonal connectors | Allow but defer to v2: a junction with one cardinal and two corner connectors is geometrically valid but introduces editor-UX questions. v1 ships junction with cardinal-only connectors. |
| Ghost replay across topology change | Each version hash gets its own leaderboard and ghost pool (existing behavior). New piece types or junctions invalidate the version hash for tracks that use them, so no replay is silently invalidated. |
| Hash invalidation | Phase 0 alone produces zero hash drift. Each subsequent feature invalidates only the tracks that opt into it. |

## Critical files

Schema and topology:
- `src/lib/schemas.ts:27-52` (PieceTypeSchema, PieceSchema, footprint)
- `src/lib/hashTrack.ts:36-60` (canonical JSON, default-omitted fields)
- `src/game/track.ts:5-103` (Dir, BASE_CONNECTORS, connectorsOf, validator)

Path and physics:
- `src/game/trackPath.ts:25-576` (TrackPath, samplers, buildTrackPath)
- `src/game/wheelContact.ts:60-108` (on-track threshold)
- `src/game/wrongWay.ts:35-115` (tangent comparison)
- `src/game/trackWidth.ts` (NEW, Phase 0a)

Rendering and feedback:
- `src/game/sceneBuilder.ts:276-363, 1201-1202, 2158-2176` (geometry, finish line)
- `src/game/kerbs.ts:60-128`
- `src/game/scenery.ts:38, 309, 335, 373`
- `src/game/minimap.ts:90-145`
- `src/lib/trackThumbnail.ts:13-21`

Editor:
- `src/game/editor.ts:14-50, 127-218, 255-360` (footprint-aware ops, mirror map)
- `src/components/TrackEditor.tsx` (palette, width toggle, junction placement)

Server-side:
- `src/app/api/race/submit/route.ts` (lap submission)
- `src/lib/anticheat.ts` (lap-validity)

## Risks and open questions

1. **Phase 0d connector arity change** is load-bearing. Audit grep for `connectorsOf(` and `BASE_CONNECTORS[` before merging the Phase 0 PR. The four known consumers are listed above; verify no others exist.
2. **Phase 0c multi-cell editor refactor** is the riskiest single PR. Selection, move, rotate, flip all change. Add `tests/unit/editor.test.ts` cases for every operation against a multi-cell piece before shipping.
3. **Phase 1c (45 Arc) mixes connector kinds.** Unit coverage verifies chains through both `arc45` and `arc45Left`, and verifies that direct cardinal-to-diagonal adjacency is rejected.
4. **Phase 2b tapered transitions** may produce visible artifacts at corner pieces if the inner and outer kerb radii do not interpolate consistently. Schedule a visual QA pass on the Phase 2 PR with kerbs enabled.
5. **Phase 3 any-path lap policy** means a player can take a 5-piece shortcut around a 50-piece "main" loop and have it count as a lap. This is the chosen behavior, but document it clearly in the in-game How To Play and in `docs/GDD.md` so authors understand that branches affect competitive balance. Note in `docs/OPEN_QUESTIONS.md` that future work may need a per-route leaderboard split.
6. **Mega Sweep arc length (~47 units)** is roughly 3 seconds of drift at race speed. This pushes the drift score curve toward saturation. Decide later whether to expose `MULTIPLIER_GROWTH_MS` per-track. Out of scope for Phase 1.

## Recommended ship order

1. Phase 0a (per-piece width via `widthAt`)
2. Phase 0b (segment-based TrackPath)
3. Phase 0c (multi-cell footprint)
4. Phase 0d (8-dir connectors, `Dir[]` arity)
5. Phase 0e (hash plumbing)
6. Phase 1a-d (the four new pieces)
7. Phase 2 (double-wide with taper)
8. Phase 3 (junctions and branching)

Each phase is one PR. Phase 0 PRs are pure refactors with no user-facing change and must produce identical hashes for all existing tracks. Phases 1, 2, 3 each invalidate the version hash only for tracks that opt into the feature.

## Verification

For each phase:

- Unit tests listed under each phase pass (`npx vitest`).
- The dash-check pre-commit guard passes: `grep -rn $'\\u2014' src tests docs` returns nothing.
- `npx vitest run` is green for all `src/game/` units.
- The Playwright smoke for the phase passes (`npx playwright test`).
- A manual smoke: open the editor, place the new pieces (or toggle the new feature), race one lap, ghost replay it, confirm the leaderboard registers the time.
- For Phase 0 only: `hashTrack` digest of every track in `src/game/trackTemplates.ts` matches the pre-Phase-0 digest, asserted in a snapshot test.
