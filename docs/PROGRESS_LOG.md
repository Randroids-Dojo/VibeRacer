# Progress Log

Newest entries first. Every implementation slice adds an entry.

## 2026-05-14, Security Dependency Patch

- Branch: `chore/security-next-15-5-18`
- Changed: bumped `next` from `15.5.15` to `15.5.18`, upgraded `vitest` from `2.1.9` to `3.2.4`, and added npm overrides for `postcss@8.5.14`, `vite@6.4.2`, and `esbuild@0.28.0`. The resolved dependency graph now clears both production and dev audit findings while keeping the app on Next 15.
- Security review: addressed the reported Next advisory set, the PostCSS stringify XSS advisory, Vite optimized-deps path traversal advisory, and esbuild dev-server advisory. `npm audit` now reports zero vulnerabilities.
- Test maintenance: updated the music-editor Playwright smoke to match the current Roll and save-confirmation UI instead of asserting stale copy that is no longer rendered.
- Verification: `npm audit`, `npm ls next postcss vitest vite esbuild`, dash checks, `git diff --check`, `npm run type-check`, `npm test`, `npm run build`, and `PORT=3108 npx playwright test tests/e2e/smoke.spec.ts tests/e2e/world-tour.spec.ts tests/e2e/derby.spec.ts` passed. Build still reports the existing Upstash Edge Runtime warning and the existing ESLint plugin conflict message, but exits successfully. Playwright still logs expected missing local KV env errors for routes that are intentionally smoke-tested without KV credentials.
- Assumptions: stayed on the patched Next 15 line to avoid a major framework migration inside a security patch. Vitest 3 keeps Node 18 compatibility and allows the patched Vite 6 line.
- GDD coverage: no core GDD status change. This is dependency hygiene and smoke-test maintenance.

## 2026-05-14, Bump @randroids-dojo/vibekit to v0.2.0

- Branch: `chore/deps/vibekit-0.1.0-to-0.2.0`
- Changed: bumped `@randroids-dojo/vibekit` from `github:Randroids-Dojo/VibeKit#v0.1.0` to `github:Randroids-Dojo/VibeKit#v0.2.0` in `package.json` and `package-lock.json`, and updated `docs/DEPENDENCY_LEDGER.md` to the new pinned release.
- Changelog review: upstream `v0.2.0` adds the `Rng` object form with split, serialize, and deserialize helpers, plus a `KvLike` interface and `adaptUpstashRedis` adapter under the server package. No removals or required VibeRacer migrations were listed, and the existing joystick, editor-history, and confetti imports stay on their prior public APIs.
- Verification: `grep -rn $'\u2014' . --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=test-results`, `grep -rn $'\u2013' . --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=test-results`, `git diff --check`, `npm test -- tests/unit/virtual-joystick.test.ts tests/unit/editorHistory.test.ts tests/unit/confetti.test.ts`, `npm run type-check`, `npm test`, `PORT=3107 npx playwright test tests/e2e/world-tour.spec.ts tests/e2e/derby.spec.ts`, and `npm run build` passed. Build still reports the existing worktree ESLint plugin conflict and the existing Upstash Edge Runtime warning, but exits successfully. `npm audit --omit=dev --json` reports existing production advisories through `next` and `postcss`; that is separate from this VibeKit bump and should be handled in its own framework/security slice.
- Assumptions: this is a compatibility bump only. The new RNG and server KV APIs are available for later migration dots, but this PR does not adopt them to keep the dependency slice narrow.
- GDD coverage: no core GDD status change. This is dependency hygiene for already shipped shared modules.

## 2026-05-14, Derby Camera Parity

- Branch: `fix/derby-camera-parity`
- Changed: wired Derby rounds to the same persisted camera settings path as the main race mode. Derby now builds a live `CameraRigParams` ref from `useControlSettings`, applies camera height, distance, look-ahead, follow speed, camera-forward, target-height, and FOV changes inside the running Three.js loop, and listens to `visualViewport` resize events so phone browser chrome changes do not leave the canvas at a stale size. The Derby canvas now has a stable Playwright selector for mobile viewport coverage.
- Verification: `grep -rn $'\u2014' . --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=test-results`, `grep -rn $'\u2013' . --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=test-results`, `git diff --check`, `npm run type-check`, `npm test -- tests/unit/controlSettings.test.ts tests/unit/cameraPresets.test.ts tests/unit/derbyTick.test.ts`, `PORT=3107 npx playwright test tests/e2e/derby.spec.ts`, `npm test`, and `npm run build` passed. Build still reports the existing React hook lint warnings in `RaceCanvas.tsx`, `TrackEditor.tsx`, and `useGamepad.ts`.
- Assumptions: this keeps Derby's arena renderer and vehicle visuals separate from the main race renderer while sharing the camera-settings contract. Derby already uses the shared touch joystick and gamepad hook, so this slice removes the stale followup that said those controls were missing.
- GDD coverage: no core GDD status change. This is mobile and camera polish for an already shipped optional mode.
- Followups: the dependency gate still reports VibeKit `v0.2.0` while `docs/DEPENDENCY_LEDGER.md` pins `v0.1.0`; the user-requested Derby camera fix takes precedence for this branch, so the dependency bump remains the next dependency slice.

## 2026-05-14, World Tour Mobile Race Parity

- Branch: `feature/world-tour-mobile-parity`
- Changed: updated `/tour/race` to use the same control stack as the main race mode. World Tour now reads persisted key bindings and touch-mode settings through `useControlSettings`, drives through the shared `useKeyboard` ref, renders the shared `TouchControls` joystick, and provides a coarse-pointer-sized pause button. The race canvas is now a fixed full-viewport surface sized from its rendered CSS box and device pixel ratio instead of a hardcoded 720x420 canvas. The 2D tour camera now follows the main game's camera settings for distance, look-ahead, and FOV so phone players keep the same framing intent they use in the main mode.
- Verification: `npm run type-check`, `npm test -- tests/unit/worldTourRaceSession.test.ts tests/unit/controlSettings.test.ts`, and `PORT=3107 npx playwright test tests/e2e/world-tour.spec.ts` passed. The Playwright file now includes a mobile viewport check that verifies the World Tour canvas fills an iPhone-class viewport and that a touch pointer activates the shared joystick overlay.
- Assumptions: this keeps the current 2D World Tour race renderer for a small parity slice. The later 3D renderer port should reuse `RaceCanvas` or a shared race-canvas adapter directly, but this patch removes the immediate mobile usability mismatch without waiting for that larger renderer change.
- GDD coverage: no core GDD status change. This is World Tour mode polish on top of the already shipped controls and camera systems.
- Followups: the dependency gate still reports VibeKit `v0.2.0` while `docs/DEPENDENCY_LEDGER.md` pins `v0.1.0`; that remains the next dependency slice unless a higher-priority user-directed slice takes precedence.

## 2026-05-10, Derby Mode

- Branch: `claude/add-derby-game-mode-fu5ca`
- Changed: added a third top-level mode (Derby) in 11 slices on the same branch. Slice list: (1) schemas, KV keys, and arena/vehicle catalogs; (2) pure-logic damage model with attacker attribution and proportional split; (3) multi-vehicle tick and round state with deterministic init; (4) seek-then-ram AI controller; (5) arena geometry helpers, `dirt` surface key, Three.js disk plus wall mesh; (6) hub UI at `/derby`, per-arena route, and vehicle picker; (7) DerbyRound + DerbyCanvas + DerbyHUD shell with placeholder visuals and damage popup pool; (8) vehicle loader with named-submesh contract (`body`, `door_l/r`, `hood`, `trunk`, `headlight_l/r`, `taillight_l/r`, four `wheel_*`); (9) damage visualization (paint darkening, broken lights, smoke and fire markers, panel detach with ballistic debris); (10) signed-token persistence with `/api/derby/{start,submit,leaderboard}` and per-arena fastest-win KV ZSETs reusing `RACE_SIGNING_SECRET`; (11) docs sweep (this entry, GDD section 20, FOLLOWUPS, GDD coverage row).
- Verification: `npm run type-check`, `npm run test` (full Vitest suite runs green; Derby slices added 89 new unit tests across schemas, catalogs, damage, vehicle state, tick, AI, arena, vehicle loader, damage visuals, debris, and three API routes), `npm run build` (production build green; both `/derby` and the `/derby/[arena]` SSG routes appear in the output). Em-dash and en-dash sweeps clean across every Derby file. Playwright e2e spec at `tests/e2e/derby.spec.ts` covers home -> hub -> arena -> picker -> HUD; not run in this environment.
- Assumptions: vehicle GLB sourcing is a parallel research track. v1 ships placeholder geometry that satisfies the named-submesh contract end to end so damage and panel detach work today; a real GLB swap is a single-branch change to the loader. Cross-domain forgery between loop and derby tokens is blocked by their structurally distinct payloads (derby has `arena` / `vehicle` / `configHash`; loop has `slug` / `versionHash`), so reusing `RACE_SIGNING_SECRET` is safe.
- GDD coverage: added Derby section 20 with subsystem map. New `GDD_COVERAGE.json` row id 20 marks the mode `partial` (followups remain) against shipped catalogs, game logic, UI routes, persistence, and the Playwright smoke. Followups under "Derby mode followups" track real GLB swap, AI difficulty knob, dent decals, particle smoke / fire, touch / gamepad parity, tuning pass, leaderboard pagination plus initials editor, and per-vehicle tabs.
- Followups: see FOLLOWUPS.md "Derby mode followups".

## 2026-05-09, Adopt @randroids-dojo/vibekit v0.1.0

- Branch: `chore/deps/adopt-vibekit-v0.1.0`.
- Changed: added `@randroids-dojo/vibekit` at `github:Randroids-Dojo/VibeKit#v0.1.0` to `package.json` dependencies. Deleted `src/lib/portable/` (the donor copy of `virtual-joystick.ts`, `editorHistory.ts`, `confetti.ts`, plus its README) and rewrote all 7 import sites (`src/components/TouchControls.tsx`, `src/components/ConfettiOverlay.tsx`, `src/components/TrackEditor.tsx`, `src/hooks/useTouchControls.ts`, `tests/unit/virtual-joystick.test.ts`, `tests/unit/editorHistory.test.ts`, `tests/unit/confetti.test.ts`) to import directly from `@randroids-dojo/vibekit`. Public API matched byte-for-byte for `virtual-joystick` and `confetti`; `editor-history` differs only by two trivial `as T` casts on undo/redo present extraction (functionally equivalent). Added `transpilePackages: ['@randroids-dojo/vibekit']` to `next.config.mjs` because VibeKit ships raw TypeScript (`main: src/index.ts`) and Next does not transpile `node_modules` by default. The single-source-of-truth move closes the donor-code drift risk between VibeRacer and the kit.
- Verification: dash checks (no em-dashes / en-dashes hit), `git diff --check`, `pnpm type-check`, `pnpm test --run` passed with 3407 tests (was 3407, no count change because tests just shifted import paths), and `pnpm build` succeeded with all routes prerendering.
- Assumptions: shape (a) (delete folder, rewrite imports) over shape (b) (re-export shim) was the right pick because the kit's public surface matches the donor signatures exactly; no bridge layer was necessary. The kit's tests live in its own repo, so VibeRacer's `tests/unit/{virtual-joystick,editorHistory,confetti}.test.ts` continue to pin behavior at the new import paths and act as a contract check that the kit has not regressed against what VibeRacer needs. `transpilePackages` is preferred over inflating the kit with a build step because the kit is intentionally pure-TypeScript distribution; the consumer is the right place to handle the transform.
- GDD coverage: no GDD section change; this is internal code organization (single source of truth for portable modules).
- Followups: the other VibeKit dots (localStorage, server-kv, math, confetti-rng) remain open. One PR per slice. The kit will publish more tags as features land; the Dependency Upgrade Gate will pick those up in their own PRs.

## 2026-05-09, Spiral Dependency Upgrade Gate adoption + audit pass

- Branch: `main` (direct, doc-only).
- Changed: adopted the spiral skill's Dependency Upgrade Gate. `docs/DEPENDENCY_LEDGER.md` describes per-dep upgrade procedure (skip rule, detect, CHANGELOG, branch, bump, type-check, test, build, smoke, PR title). `AGENTS.md` reading list and Rule 5 loop now reference the gate. `docs/IMPLEMENTATION_PLAN.md` adds the gate as new step 2 (post-pull) and step 9 (pre-PR), and adds slice-selection priority 2 ("pending dep upgrade"). `docs/WORKING_AGREEMENT.md` adds a `chore(deps):` verification minimum. As part of a 10-round audit pass across the sibling-game family (VibeRacer, VibeGear2, Flatline, VibeCity, FrackingAsteroids), em-dash sweep was clean, OPEN_QUESTIONS / FOLLOWUPS structural checks passed, and a new dot was added to track cutting VibeKit `v0.1.0` upstream so this ledger's `Currently pinned: v0.1.0` line becomes truthful (today VibeKit has release-please configured but no tags published).
- Verification: dash checks (no em-dashes / en-dashes hit). No code changes; type-check / test / build skipped.
- Assumptions: the gate is doc-only on this PR; the next iteration that touches `main` is the first one to actually fire it. The `Currently pinned: v0.1.0` line stays as the canonical aspirational target; the upstream-release dot is the unblocker.
- GDD coverage: no GDD section change; process scaffolding only.
- Followups: VibeKit adoption work is tracked in `.dots/` (7 migration dots from the donor-code extraction). The new dot tracks cutting v0.1.0 upstream.

## 2026-05-08, Drag Racing Mode (full mode, six slices in one branch)

- Branch: `claude/add-drag-racing-mode-slvQ7`
- Changed: shipped the drag racing mode end to end at `/drag` and `/drag/<strip>`. Four predefined strips (Salt Flats, Coastal, Alpine, Harbor) each ship with a biome, weather, time of day, and a vertical profile that gives them visible hill shape. Vehicle building is parts based: tires, body, engine, transmission picked from a 5x4x5x4 catalog in `src/lib/dragParts.ts`. The garage UI (`DragGarage`) shows the live derived stats; players cannot edit `CarParams` directly in drag mode. Slope physics is wired through an additive optional `externalLongitudinalAccel` arg on `stepPhysics` (default 0 so closed loop is byte identical) and `dragTick` reads `slopeAt(profile, arcLengthS)` per frame to compute the gravity along slope term. Jump start is "buffet dampening" rather than a DQ: pre GO throttle flips a fouled flag and seeds a heavy accel multiplier that decays exponentially back to normal. Ghost rotation rules (`selectDragGhost`) cover top, next faster, own PB, and none. The submit route accepts `mode: 'drag'`, persists the loadout, top speed, foul flag, and reaction time alongside existing lap meta, and the leaderboard reader surfaces them. The version hash for each strip is computed in pure JS so the same module works in both Node and the browser bundle, and is stable against cosmetic edits but rotates on any physics affecting field. Title screen gains a Drag Racing tile next to Play; the closed loop racing flow is unchanged.
- Verification: dash checks, `tsc --noEmit`, `pnpm test --run` passed with 3392 tests (65 new), `next build` succeeds with all four `/drag/<strip>` routes prerendered as static.
- Assumptions: drag tracks live at reserved slugs under `/drag/`, deliberately exempt from the "every URL is a track" pillar. Loadouts persist to localStorage per strip plus a last loaded fallback. The current visual hill rendering reuses the existing flat road geometry and applies the profile only to the car's y / pitch each frame, so the ground geometry stays flat under the car for now; the slope physics still bites because it is computed from the profile not the geometry.
- GDD coverage: new short section in `docs/GDD.md` describing the four reserved slugs and the parts driven physics. Closed loop pillar gains a brief callout that drag mode is a finite exception.
- Followups: visible road ribbon following the profile (rather than a flat road plus an offset car), a richer christmas tree with staggered ambers, and a weather override toggle inside the strip are all on `docs/FOLLOWUPS.md` for a future slice. The current ghost rotation reuses the closed loop replay infrastructure; surfacing the ghost car's loadout next to the nameplate is also a followup.

## 2026-05-08, Portable Game Modules

- Branch: `claude/portable-game-modules`
- Changed: extracted three already-portable modules out of `src/game/` into `src/lib/portable/` so they can be copy-pasted into other game projects without VibeRacer-specific edits. The three picks (`virtual-joystick.ts`, `editorHistory.ts`, `confetti.ts`) each had zero `@/` imports, no React, no Next.js coupling, and no game-specific types in their public APIs; the move is a pure relocation. Updated 7 import sites (4 source, 3 test) to the new paths. New `src/lib/portable/README.md` documents the portability contract (zero project imports, no framework coupling, pure TypeScript, documented public API) and lists the modules with their public surface. Future candidates that need light decoupling before they qualify (`audioEngine.ts` needs an `AudioSettings` provider interface, `gamepadInput.ts` needs `GamepadBindings` lifted out) are intentionally out of this slice.
- Verification: dash checks, `git diff --check`, `pnpm type-check`, `pnpm test --run` passed with 3331 tests, and `pnpm build` passed. No behavior change is expected (pure relocation), so no new tests; the existing 3 test files for these modules picked up the new import paths and continue to pin behavior.
- Assumptions: `src/lib/portable/` is the right boundary for "drop these files into another TS project and they work". Future tightening (lifting tests next to source, or moving each module into its own subfolder) is a separate concern.
- GDD coverage: no GDD section change; this is internal code organization.
- Followups: `audioEngine.ts` and `gamepadInput.ts` are the next-best candidates and would benefit from a small decoupling refactor before relocation.

## 2026-05-07, Per-Cell OBBs for Overlap Detection (slice 7 follow-up)

- Branch: `claude/slice-7-piece-polygons`
- Changed: closed the slice 7 OBB false-positives follow-up. New helper `cellObbsOfPiece(piece): OBB[]` in `src/game/pieceObb.ts` returns one CELL_SIZE-on-a-side rotated square per footprint cell instead of one bounding rectangle per piece. Each cell-OBB anchors at `transform.{x,z} + (residual-rotated cell offset)` with the residual angle as its world orientation, so the L-shape of `wideArc45*` no longer claims its missing fourth corner cell and the supercover line of `flexStraight` no longer claims the cells off its road. `findOverlappingPiecePairs` now buckets per cell-OBB rather than per piece, walks cross-piece cell pairs in each shared bucket, and runs strict-inequality SAT on each pair; same-piece cell pairs are never compared so multi-cell pieces never self-flag. The single-OBB `obbOfPiece` stays as a coarse bound for callers that need one rectangle per piece. New unit tests pin: a wideArc45 next to a piece in the L's missing corner cell does NOT flag (was the slice 7 false-positive case), residually-rotated overlap still flags, and `cellObbsOfPiece` produces the right number of cells with the right per-cell rotation. The Playwright OBB-overlap smoke (top straight slid halfway into the west neighbor) still flags as a regression check.
- Verification: dash checks, `git diff --check`, `pnpm type-check`, `pnpm test --run` passed with 3331 tests (4 new in `pieceObb.test.ts`), `pnpm exec playwright test tests/e2e/smoke.spec.ts --grep "overlap warning|Close Loop button"` passed (2/2), and `pnpm build` passed.
- Assumptions: per-cell SAT is bounded by the largest footprint (9 cells for `hairpinWide`); cost stays O(N) per piece for bucket insertion and O(M*N) per overlapping bucket pair, both acceptable for the typical authoring track size (~64 pieces). Strict-inequality SAT preserves the contract that adjacent cell-aligned pieces sharing an edge do not flag, which was the slice 7 invariant the editor relied on.
- GDD coverage: no GDD section change; this is a refinement of the existing slice 7 overlap detection.
- Followups: continuous-angle migration is fully closed. See `docs/FOLLOWUPS.md`.

## 2026-05-07, Loop Reconciliation Rotate-Around-Connected (slice 6 follow-up)

- Branch: `claude/slice-6-rotate-around-connected`
- Changed: closed the slice 6 cascading-reconciliation follow-up. New helper `rotateAroundConnectedToTarget(piece, connectedEndpointIdx, targetFrame, posEpsilon = 0.5)` in `src/game/continuousAngleEdit.ts` rotates a piece around its still-connected endpoint by the angle that aligns the OTHER endpoint's tangent antiparallel to the target, then verifies the dragged endpoint position lands within validator epsilon (0.5 world units). Returns null when both constraints cannot be satisfied by a single rotation around the connected endpoint. `findLoopReconciliation` now tries rotate-around-connected on each candidate first; only when neither candidate's rotation works does it fall back to the prior `snapPieceToTarget` translate+rotate, and even then only when at least one candidate's other endpoint is unconnected (open chain end). Closed loops where rotate-around-connected fails return null instead of offering a button that would cascade. Sign of the rotation matches the codebase invariant `frame.theta + transform.theta = constant within one cardinal cell` (incrementing transform.theta by alpha decreases each tangent by alpha), the same -1 slope `snapPieceToTarget` already exploits. The strengthened unit test asserts every connection survives reconciliation (previously the test only checked the targeted pair, which is what masked the cascade). The Playwright smoke now clicks the Close Loop button and asserts `valid closed loop` returns and the button disappears, so the end-to-end close path is exercised.
- Verification: dash checks, `git diff --check`, `pnpm type-check`, `pnpm test --run` passed with 3327 tests (2 new in `continuousAngleEdit.test.ts`), and the targeted Playwright smoke `track editor surfaces a Close Loop button when two dangling endpoints are within snap range` now asserts the button closes the loop end-to-end.
- Assumptions: the rotation that aligns tangents and the rotation that lands the dragged position on target are the same alpha within a 0.5-unit position tolerance for the typical perturbation case (user rotated a piece around an endpoint by a small angle). Cases where the gap came from a non-rotation cause (translation, multi-piece drift) often fail the 0.5-unit position check and the button stops surfacing; that is preferred over offering a button that cascades the gap. The closed-form is exact for the inverse-rotation case the docs called out as the typical authoring scenario.
- GDD coverage: no GDD section change; this is a refinement of the existing slice 6 reconciliation behavior.
- Followups: slice 7 OBB false-positives on non-rectangular footprints remains open. See `docs/FOLLOWUPS.md`.

## 2026-05-07, Continuous-Angle Flag Flip (Stage 3)

- Branch: `claude/continuous-angle-stage-3-flip-flag`
- Changed: shipped Stage 3 of the continuous-angle migration. Removed `src/lib/editorFeatureFlags.ts` and `tests/unit/editorFeatureFlags.test.ts` entirely; every `if (!CONTINUOUS_ANGLE_EDITOR_ENABLED) return` early return, every `{CONTINUOUS_ANGLE_EDITOR_ENABLED && ...}` JSX gate, and the `NEXT_PUBLIC_CONTINUOUS_ANGLE_EDITOR=1` injection in `playwright.config.ts` are gone. The continuous-angle UX (rotate handle on selected pieces, free-placement drag with snap, numeric Transform panel via toolbar button or 500ms long-press, Close loop reconciliation button, OBB overlap warning badge) is now the default editor for everyone, no redeploy or env var required to flip on. Tutorial / hint text on the editor entry banner gets a sentence about Select-piece affordances (rotate handle, drag-to-reposition, Transform button) so first-time users discover the new behaviors. Flex Straight stays as a discrete-snap shortcut for rational `atan(p/q)` angles; no deprecation planned.
- Verification: dash checks, `git diff --check`, `pnpm type-check`, `pnpm test --run` passed with 3325 tests (16 fewer than slice 7 because the editorFeatureFlags suite is gone), `pnpm exec playwright test tests/e2e/smoke.spec.ts --grep "track editor"` passed with all 14 tests, and `pnpm build` passed. Smokes that previously depended on the `NEXT_PUBLIC_CONTINUOUS_ANGLE_EDITOR=1` injection now exercise the feature against an unconditional editor build.
- Assumptions: removing the flag is a one-way door. The Vercel Preview environment variables `NEXT_PUBLIC_CONTINUOUS_ANGLE_EDITOR` set on prior branches are now unused; they can be cleaned up via `vercel env rm` whenever, but they have no effect on the build now that the constant is gone. The editor's existing Stage 1 / Stage 2 Workstream A runtime migration handles non-projectable pieces end-to-end, so flipping the editor UX on does not change persistence or rendering for grid-aligned tracks.
- GDD coverage: no GDD section change; this finalizes the continuous-angle migration scaffolding under Section 6 Track system functionality.
- Followups: see `docs/FOLLOWUPS.md` for the slice 6 cascading-reconciliation follow-up and the slice 7 OBB false-positives-on-non-rectangular-footprints follow-up; both are quality-of-life improvements that the shipped behavior accommodates without requiring authors to work around them.

## 2026-05-06, Continuous-Angle OBB Overlap Detection (Stage 2 Workstream B, slice 7)

- Branch: `claude/continuous-angle-stage-2-overlap-detection`
- Changed: shipped slice 7 of Stage 2 Workstream B (oriented bounding box overlap detection). New module `src/game/pieceObb.ts` exports `OBB`, `obbOfPiece`, `aabbOfObb`, `aabbsOverlap`, `obbsOverlap`, and `findOverlappingPiecePairs`. The OBB anchors on `transform.{x,z}` (not the legacy `piece.row` / `piece.col`) and folds the cardinal-rotated footprint offsets into half-extents along the piece's local axes; the residual rotation `transform.theta - cardinalSnap(transform.theta)` becomes the OBB's world orientation, matching `frameOfPortAtTransform`'s decomposition. The pipeline is spatial-hash on the OBB's world AABB cells, then AABB pre-check, then full SAT, with each stage a strict superset of the next so the cost stays bounded for the typical authoring track size. Strict-inequality comparisons in both AABB and SAT mean adjacent grid-aligned cells that share an edge are not flagged (the typical valid-track case) while sub-cell perturbations that put one piece's OBB into another's are caught. UI integration in `src/components/TrackEditor.tsx`: a memo on the pieces array surfaces the overlapping pair count in the editor's status row when `CONTINUOUS_ANGLE_EDITOR_ENABLED` is on. The badge uses the same warning style as the open-connector hint, with a `title` attribute listing the offending piece-index pairs for debugging. Save is NOT blocked on OBB overlap because that would change behavior for grid-aligned tracks too. New unit tests cover the OBB construction (single-cell, multi-cell, residual-rotated), AABB and SAT primitives (touching boundaries, axis-rotated separation, rotation-induced overlap), and `findOverlappingPiecePairs` (closed loop reports nothing, duplicate placement reports one pair, far-apart pieces skip the bucket entirely, multi-cell same-anchor returns each pair exactly once). New Playwright smoke `track editor surfaces an overlap warning when two pieces overlap geometrically` loads Starter oval, slides the top straight halfway toward its west neighbor via the numeric Transform panel, and asserts the overlap badge appears.
- Verification: dash checks, `git diff --check`, `pnpm type-check`, `pnpm test --run` passed with 3341 tests (17 new in `pieceObb.test.ts`), `pnpm exec playwright test tests/e2e/smoke.spec.ts --grep "track editor"` passed with 14 tests (one new), and `pnpm build` passed.
- Assumptions: the OBB approximation uses the AABB of the cardinal-rotated footprint, which is conservative for pieces with curved geometry (corners, sweeps, S-curves) but never under-covers. The spatial-hash buckets by the world AABB rather than `footprintCells`, since for non-projectable pieces the legacy `piece.col` / `piece.row` may not move with the transform; bucketing by AABB closes that hole and falls back to the footprint cells for grid-aligned input. Strict-inequality comparisons treat touching pieces as non-overlapping; floats of zero-length pieces (defensive null-footprint case) report no overlap with anything, matching the old cell-based behavior.
- GDD coverage: no GDD section change; this is internal scaffolding under Section 6 Track system functionality.
- Followups: Stage 3 (flip the feature flag, update tutorials, decide on Flex angle deprecation). After slice 7 merges, Stage 2 Workstream B is complete.

## 2026-05-06, Continuous-Angle Loop Reconciliation (Stage 2 Workstream B, slice 6)

- Branch: `claude/continuous-angle-stage-2-loop-reconciliation`
- Changed: shipped slice 6 of Stage 2 Workstream B (loop reconciliation pass for nearly-closed chains). New helpers in `src/game/continuousAngleEdit.ts`: `LOOP_RECONCILIATION_RADIUS = 6` world units and `LOOP_RECONCILIATION_ANGLE_RAD = 8 degrees` define when reconciliation engages (wider than the validator's 0.5 / 2 degrees so authoring drift is caught early; narrower than free-placement's 15 / 30 because the reconciled snap moves only one piece). `findLoopReconciliation(pieces, radius?, angleRad?)` walks `unconnectedEndpoints`, returns null unless exactly two dangling endpoints sit within the radius and antiparallel-compatible within the angle, and otherwise produces a `snapPieceToTarget`-driven plan that moves the higher-piece-index dangling end onto the lower-index frame. `applyLoopReconciliation(pieces, plan)` rewrites the moving piece's transform via `setPieceTransform`. The same PR also fixed a sign bug in `snapPieceToTarget`: within one cardinal cell `frame.theta + transform.theta` is constant (slope -1 with respect to transform.theta), so the earlier "newPieceTheta = (target.theta + PI) - (frame.theta - transform.theta)" produced a `2 * residual` heading error for non-cardinal targets. The fix reads "newPieceTheta = draggedFrame.theta + currentTransform.theta - (target.theta + PI)" and is bit-equal to the prior formula for cardinal targets (so the existing slice 4 free-placement snap test stays green) while landing the dragged endpoint exactly antiparallel for non-cardinal targets. UI integration in `src/components/TrackEditor.tsx`: a Close loop button surfaces on the toolbar when `CONTINUOUS_ANGLE_EDITOR_ENABLED` is on, the validator rejects the loop, and `findLoopReconciliation` returns non-null. Clicking dispatches `applyLoopReconciliation` through `setPieces` so the move lands as a single undo step. New unit tests cover the four reconciliation cases (closed loop returns null, more than two opens returns null, gap wider than radius returns null, perturbed-by-1.9-degrees fixture round-trips through `framesConnect`) and a non-cardinal-target regression for `snapPieceToTarget`. New Playwright smoke `track editor surfaces a Close Loop button when two dangling endpoints are within snap range` loads Starter oval, perturbs the top straight by 1.9 degrees around its west endpoint via the numeric Transform panel, and asserts the Close loop button surfaces.
- Verification: dash checks, `git diff --check`, `pnpm type-check`, `pnpm test --run` passed with 3324 tests (six new in `continuousAngleEdit.test.ts`), `pnpm exec playwright test tests/e2e/smoke.spec.ts --grep "track editor"` passed with 13 tests (one new), and `pnpm build` passed.
- Assumptions: in a CLOSED loop where only one piece is perturbed off its grid alignment, the reconciliation snaps the perturbed connection shut by moving the neighbor, which then moves that neighbor's other endpoint and breaks the next connection downstream. The gap shifts around the loop rather than closing. The single-piece snap is still useful for OPEN chains the user is building piece-by-piece (the spec's intended scenario), where the moving piece sits at the chain end and its other endpoint is unconnected; the cascading / multi-piece distribute-drift case is queued in `docs/FOLLOWUPS.md` as the slice 6 cascade follow-up. The smoke pins only the UI wiring (button surfaces in the right state) because reproducing the multi-piece distribute case in a smoke is hard without injecting state directly into the editor; the math correctness is covered by the unit tests.
- GDD coverage: no GDD section change; this is internal scaffolding under Section 6 Track system functionality.
- Followups: OBB-vs-OBB overlap detection (slice 7), cascading reconciliation for closed-loop perturbations.

## 2026-05-06, Continuous-Angle Numeric Transform Editor (Stage 2 Workstream B, slice 5)

- Branch: `claude/continuous-angle-stage-2-numeric-input`
- Changed: shipped slice 5 of Stage 2 Workstream B (numeric input for `transform.x`, `transform.z`, `transform.theta`). A new `NumericTransformPanel` component in `src/components/TrackEditor.tsx` renders a floating dialog with three inputs in authoring units (`col` and `row` are `transform.{x,z} / CELL_SIZE`, `theta (deg)` is `transform.theta * 180 / PI`) plus Apply / Cancel buttons; Apply parses the values, multiplies back into world units / radians, and dispatches `setPieceTransform` from `src/game/continuousAngleEdit.ts`. The dialog opens via two paths, both gated by `CONTINUOUS_ANGLE_EDITOR_ENABLED`: the selection toolbar exposes a `Transform` button when exactly one piece is selected (driven off the existing `rotateHandlePieceWithIndex`), and a `LONG_PRESS_MS = 500` timer armed by `handlePointerDown` opens the same dialog on touch. The long-press timer is cleared by `advancePieceDrag` and `finalizePieceDrag` so a drag, tap, or long-press transition each cancel any pending counterpart. The panel uses `position: absolute; top: 12; right: 12` inside `gridOuter` (which is already `position: relative`) so it pins to the top-right of the canvas without occluding the toolbar. New Playwright smoke `track editor numeric Transform panel rotates a piece by typed degrees` places a straight, opens the dialog, types `25` into theta, clicks Apply, and asserts `data-non-projectable-piece-type="straight"` appears (a non-cardinal theta forces non-projectable rendering).
- Verification: dash checks, `git diff --check`, `pnpm type-check`, `pnpm test --run` passed with 3318 tests, `pnpm exec playwright test tests/e2e/smoke.spec.ts --grep "track editor"` passed with 12 tests (one new numeric-transform smoke), and `pnpm lint` showed only pre-existing warnings.
- Assumptions: Apply silently no-ops when any input parses as `NaN` (empty string, garbage). Cancel just closes; no preview is committed during editing so there is nothing to revert. The dialog re-mounts whenever the selected piece index changes, so its initial input values track the live transform on open. The long-press fires the dialog from a `pieceDrag.mode === 'pending'` state, so a quick tap that releases before 500 ms never triggers it; once the drag escalates to active mode (movement past `CELL_SIZE / 4`) the timer is cleared and the drag proceeds normally.
- GDD coverage: no GDD section change; this is internal scaffolding under Section 6 Track system functionality.
- Followups: reconciliation pass for nearly-closed loops (slice 6), OBB-vs-OBB overlap detection (slice 7).

## 2026-05-06, Continuous-Angle Free-Placement Drag (Stage 2 Workstream B, slice 4)

- Branch: `claude/continuous-angle-stage-2-free-placement`
- Changed: shipped slice 4 of Stage 2 Workstream B (free-placement drag with snap-radius nearest-neighbor matching). New helpers in `src/game/continuousAngleEdit.ts`: `unconnectedEndpoints(pieces, excludePieceIdx?)` walks every piece's endpoints and returns the ones no other piece is connected to via `framesConnect` (the dragged piece can be excluded so a drag in flight does not consider its own endpoints as snap targets); `findFreePlacementSnap(draggedPiece, targets, snapRadius?, snapAngleRad?)` picks the nearest-neighbor target endpoint within the snap radius (default 15 world units, 30 degrees) whose tangent is antiparallel-compatible with one of the dragged piece's endpoints; `snapPieceToTarget(piece, draggedEndpointIdx, targetFrame)` is the soft-pull primitive that returns the transform the dragged piece should adopt so its chosen endpoint frame ends up at the target world position with antiparallel tangent. The snap radius is wider than `framesConnect`'s 0.5-unit validator epsilon so the user gets feedback as the piece approaches alignment; on commit the soft-pulled transform satisfies the tighter validator threshold. UI integration in `src/components/TrackEditor.tsx`: pointer-down on a piece with the Select tool active and the continuous-angle editor flag on starts a piece drag in `pending` mode; pointer-move past `CELL_SIZE / 4` upgrades to `active` mode and substitutes the live preview into `displayPieces`; pointer-up commits the preview via `setPieces`. The drag tracks `pointerId` so a second finger landing during a drag cannot hijack the gesture, and a `suppressNextClickRef` swallows the synthetic click that would otherwise re-run the cell's tool action after the drag commits. The flex-straight road overlay now accepts pointer events and carries `data-row` / `data-col` attributes so the user can grab the road directly. A new `SnapTargetIndicator` component renders a green ring at the snap target's endpoint while the drag is in range, so the user can see which endpoint the soft-pull will engage with on release. New Playwright smoke `track editor free-places a piece via drag with the select tool` exercises the full drag flow (place, switch to Select, drag past the threshold to a position with no neighbors to snap to, assert the piece commits as a non-projectable overlay).
- Verification: dash checks, `git diff --check`, `npm run type-check`, `npm test` passed with 3318 tests (8 new in `continuousAngleEdit.test.ts`), `npx playwright test tests/e2e/smoke.spec.ts --grep "track editor"` passed with 11 tests (one new free-placement smoke), and `npm run build` passed.
- Assumptions: `findFreePlacementSnap` is `O(pieces * pieces * endpoints)` because `unconnectedEndpoints` already filters via `framesConnect` once and then the snap step runs over the remaining unconnected set, but the worst-case track has fewer than 64 pieces so this is fine. The drag commits whatever transform the cursor ended at (snapped or not); pointer-cancel drops the preview without committing. Selection state still keys off the original anchor cell, so a piece dragged far from its anchor will still show its selection rect and rotate handle at the new transform position via the existing overlay path.
- GDD coverage: no GDD section change; this is internal scaffolding under Section 6 Track system functionality.
- Followups: long-press numeric input for `x, z, theta` (slice 5), reconciliation pass for nearly-closed loops (slice 6), OBB-vs-OBB overlap detection (slice 7).

## 2026-05-06, Continuous-Angle Rendering and Rotate Handle (Stage 2 Workstream B, slices 2 and 3)

- Branch: `claude/continuous-angle-stage-2-rendering`
- Changed: bundled the rendering refactor (slice 2) and the rotate handle (slice 3) of Stage 2 Workstream B into one PR. `cellMap` keeps every piece so applyTool / erase / start / checkpoint actions still find off-grid pieces by anchor cell, while the cell loop sets `renderedPiece = undefined` whenever `isV1Projectable(piece)` is false so Cell skips the cell-aligned glyph. A new `NonProjectablePieceOverlay` component then renders each off-grid piece at `(transform.x, transform.z, transform.theta)` with the world-to-SVG mapping `svgX = (transform.x / CELL_SIZE - colMin) * CELL`, exposing `data-row` / `data-col` so `cellFromEvent` routes clicks on the rotated glyph back to the anchor cell. `PieceGlyph` gains an optional `rotationDegOverride` prop the overlay passes 0 for so the inner glyph stays in its rotation-0 frame and the outer wrapping `<g>` applies the continuous theta rotation. For grid-aligned pieces the Cell-based render path is unchanged, so the Stage 0.5 snapshot wall and existing template hashes stay pinned. Slice 3 wires the rotate handle: when `CONTINUOUS_ANGLE_EDITOR_ENABLED` is on and exactly one piece is selected, an SVG ring renders at each connector endpoint via the new `RotateHandles` component. Pointer-down on a ring captures the pointer and starts a rotate drag; pointer-move computes the angular delta of the cursor relative to the ring's pivot endpoint and feeds it into `rotatePieceAroundEndpoint`, producing a live preview piece. The drag tracks `pointerId` so a second finger landing during a rotate cannot hijack or commit the active gesture, and the per-frame increment normalises into `[-PI, PI]` before accumulating so a sweep across the +/-PI atan2 branch cut continues smoothly through one or more revolutions. The editor swaps the preview into a `displayPieces` derivation so cellMap and the overlay both render the rotation live without committing to history. Pointer-up advances the cumulative delta to the release coordinates first, then commits via `setPieces` (skipped when `|cumulativeDelta| <= 1e-9` to keep no-op rotations out of undo / redo); pointer-cancel drops the in-flight preview without committing. A new `clientToWorld` helper converts a pointer client coordinate to a world-space point through the SVG's screen CTM, mirroring the world-to-SVG math the overlay uses. `bounds` derives from `displayPieces` and additionally expands to include each non-projectable piece's transform position (rounded to the nearest cell with a 1-cell margin) so the live preview and handle rings stay inside the rendered SVG area through the whole drag. Playwright config now sets `NEXT_PUBLIC_CONTINUOUS_ANGLE_EDITOR=1` for smoke runs so all editor paths exercise alongside the existing grid-snap smokes; production builds default to off until Stage 3.
- Verification: dash checks (no U+2014 or U+2013 anywhere in src / tests / docs), `git diff --check`, `npm run type-check`, `npm test` passed with 3307 tests, `npx playwright test tests/e2e/smoke.spec.ts --grep "track editor"` passed with 10 tests (9 existing plus a new `rotate handle pivots a selected piece around an endpoint` smoke that places a straight, selects it, drags pivot 0 outward, and asserts the piece renders via the non-projectable overlay), and `npm run build` passed.
- Also adds a `FlexStraightRoadOverlay` that paints the full flex-straight road from entry to exit using the same world-space endpoints `endpointsOf(piece)` returns, so a flex straight with a multi-cell offset (default `dr = -3, dc = 1`) shows its actual footprint extent in the editor instead of a single-cell tilt-line glyph. The overlay reads the same endpoint frames the rotate-handle rings render at, so the visible piece and the rings always agree on where the piece sits. Renders for both v1-projectable and non-projectable flex straights.
- Assumptions: the rotate-handle drag captures the pointer via `setPointerCapture` so subsequent move and up events fire on the small circle even when the cursor leaves it. The call is wrapped in try / catch to no-op gracefully in environments without pointer capture (jsdom, edge browsers); the SVG-level `handlePointerMove` / `handlePointerUp` / `handlePointerCancel` filter by `rotateDrag.pointerId` and provide the fallback path so a drag still works (and aborts cleanly on cancel) when capture fails. The ring's pointer handlers `stopPropagation` so the same drag is not also delivered to the SVG fallback (which would push a duplicate undo step). Pointer-up / cancel run through `finalizeRotateDrag` which computes the release-position preview directly from the current `rotateDrag` rather than chaining `advanceRotateDrag` (a setState) into `commitRotateDrag` (which would read the pre-advance closure) so the committed angle matches where the pointer actually ended. The Cell render path masks off `cellIsSelected` / `cellIsStart` / `cellHasCheckpoint` for every cell covered by a non-projectable piece's footprint (not just the anchor) so selection / START / checkpoint visuals do not leak onto stale footprint cells when a wide piece selected through one of its non-anchor cells rotates past a cardinal snap. `NonProjectablePieceOverlay` carries the START label, the start-direction arrow (rotated by `startExitDir * 45 - cardinalSnapDeg` so the inner rotation does not double-count the cardinal portion of `transform.theta`), the checkpoint marker, and the selection rectangle inside its rotated `<g>`, so all four indicators travel with the rotated piece. `rotateHandlePieceWithIndex` pins to `rotateDrag.pieceIdx` while a drag is active so rotating a multi-cell piece selected through a non-anchor footprint cell does not lose its rings mid-drag when the rotated footprint stops covering the original selection cell. Both clicking the original cell AND clicking the rotated overlay glyph route to the same piece because the overlay carries `data-row` / `data-col` matching the anchor.
- GDD coverage: no GDD section change; this is internal scaffolding under existing Section 6 Track system functionality.
- Followups: free-placement drag with snap-radius nearest-neighbor matching (slice 4), long-press numeric input (slice 5), reconciliation pass for nearly-closed continuous-angle loops (slice 6), OBB-vs-OBB overlap detection (slice 7). See `docs/CONTINUOUS_ANGLE_PLAN.md` for the authoritative plan.

## 2026-05-05, Continuous-Angle Editor Foundation (Stage 2 Workstream B, slice 1)

- Branch: `claude/continuous-angle-stage-2-editor-ux`
- Changed: shipped the foundation slice of Stage 2 Workstream B (the editor UX behind a feature flag). New module `src/lib/editorFeatureFlags.ts` exports `CONTINUOUS_ANGLE_EDITOR_ENABLED`, read from `NEXT_PUBLIC_CONTINUOUS_ANGLE_EDITOR` via a `parseBooleanEnv` helper so missing values default to off and the literal string `"false"` reads as falsey. Because the flag uses a `NEXT_PUBLIC_*` env var, the value is baked into the client bundle at build time; flipping it on requires a redeploy, which is acceptable for the staged rollout (Stage 3 flips it on for everyone). New module `src/game/continuousAngleEdit.ts` exports the four piece-level mutations the rotate handle and free-placement drag will dispatch: `rotateTransformAroundPoint`, `rotatePieceAroundEndpoint`, `translatePiece`, and `setPieceTransform`. Each runs the v1 to v2 converter on its result so legacy `(row, col, rotation)` re-derive when the new transform is v1-projectable and stay untouched otherwise; the runtime that shipped in PR #103 already handles non-projectable transforms end-to-end. The internal `applyTransform` helper rotates `piece.footprint` by the cardinal turn delta between the old and new transforms via `rotateFootprintClockwise`, so custom multi-cell footprints stay aligned with the piece's new orientation. 11 unit tests in `tests/unit/continuousAngleEdit.test.ts` pin the transform math (deltaTheta = 0 identity, non-origin pivot, endpoint preservation, theta accumulation, non-projectable detection, out-of-range index throw), 4 footprint-rotation tests pin the custom-footprint round-trip across cardinal and non-cardinal deltas, and 16 truthy-string parser tests in `tests/unit/editorFeatureFlags.test.ts` pin the accepted, rejected, and `undefined` cases for the env parser. Records PR #103's merge commit (`9786404`) under the plan's Stage 2 Workstream A entry.
- Verification: dash checks (no U+2014 or U+2013 anywhere in src / tests / docs), `git diff --check`, `npm run type-check`, `npm test` passed with 3289 tests (15 new in `continuousAngleEdit.test.ts` plus 16 new in `editorFeatureFlags.test.ts`), and `npm run build` passed.
- Assumptions: this slice is the math foundation. The remaining Workstream B features (rotate handle UI, free-placement drag with snap-radius matching, long-press numeric input, reconciliation pass for nearly-closed loops, OBB-vs-OBB overlap detection) depend on a rendering refactor in `TrackEditor.tsx` that draws non-projectable pieces at their actual `transform` rather than the cell-snapped position, plus a duplicate-cell replacement that handles arbitrary-angle pieces. Those slices ship as follow-up PRs on the same Stage 2 Workstream B branch family so each can be reviewed independently.
- GDD coverage: no GDD section change; this is internal scaffolding under existing Section 6 Track system functionality.
- Followups: rotate handle UI in `TrackEditor.tsx` (gated by the new flag), free-placement drag, long-press numeric input, reconciliation pass for nearly-closed loops, OBB-vs-OBB overlap detection. See `docs/CONTINUOUS_ANGLE_PLAN.md` for the authoritative plan.

## 2026-05-05, Continuous-Angle Runtime Migration (Stage 2 Workstream A)

- Branch: `claude/continuous-angle-stage-2-runtime`
- Changed: shipped the runtime migration half of Stage 2 in `docs/CONTINUOUS_ANGLE_PLAN.md`. `connectorPortsOf` and `flexStraightPorts` in `src/game/track.ts` no longer key off `piece.rotation`; both now derive their cardinal-snapped turn count from `transform.theta` via `cardinalTurnsOfTheta` (with a `thetaOfPiece` fallback that reads `piece.rotation * PI / 180` for transform-less pieces so direct unit tests still work). `defaultFootprintForPiece` in `src/game/trackFootprint.ts` runs the same cardinal snap on `transform.theta` when a transform is present (via a `snappedRotationFromPiece` helper) so non-projectable pieces with stale `piece.rotation` fields still produce footprint cells that line up with their connector frames. `frameOfPortAtTransform` in `src/game/pieceFrames.ts` now applies the residual rotation `transform.theta minus cardinalSnap(transform.theta)` to the port's local offset and heading; for v1-projectable pieces the residual is exactly zero so the function reduces to the legacy translate-only arithmetic and the Stage 0.5 snapshot wall plus every existing template hash reproduce bit-for-bit. The cardinal snap uses the full rounded quotient `n = Math.round(theta / (PI / 2))` so thetas outside `[0, 2*PI)` (accumulated rotations from group rotate, undo, redo) still resolve to zero residual when they land on a cardinal multiple. The shared `V1_PROJECTABLE_POSITION_EPSILON` and `V1_PROJECTABLE_ROTATION_EPSILON` constants live in the leaf module `src/game/cellSize.ts`; `pieceGeometry.ts` and `pieceFrames.ts` import the same canonical values. The validator's `portsConnect` and `findConnectedNeighbor` swapped the source-side frame from the cell-keyed `frameOfPort` to `frameOfPortAtTransform(transformOf(piece), port)` so non-projectable pieces close correctly. `transformSample` in `src/game/trackPath.ts` now consumes a `{ x, z, theta }` transform directly (radians) instead of degrees, and `buildScurveSamples` / `buildSweepSamples` read `transformOf(piece)` rather than `piece.rotation`. `buildTrackPath` itself now sources `center`, `entry`, `exit`, and `arcCenter` from `transformOf(piece)` and `frameOfPortAtTransform` so non-projectable straight and corner pieces render at the correct world coordinates; for grid-aligned input the converter sets `transform.x = col * CELL_SIZE` and `transform.z = row * CELL_SIZE` exactly, so this is bit-equal to the legacy `cellCenter` and `portMidpoint` arithmetic. With the runtime now transform-driven, the Stage 1 boundary gate (`Stage1NonProjectableError`, `assertAllPiecesV1Projectable`) is gone from `src/lib/trackVersion.ts`, `src/lib/loadTrack.ts`, and `src/app/api/track/[slug]/route.ts`; non-projectable continuous-angle pieces now flow through the load and write paths without rejection. The converter still re-derives `(row, col, rotation)` from a v1-projectable transform on entry because cell fields stay load-bearing for canonical hashing, validator duplicate-cell detection, and footprint enumeration; this normalization is idempotent and harmless for grid-aligned input and is documented in the converter's comment. A new long-chain closure test in `tests/unit/track.test.ts` rotates the existing 60-piece rectangle rigidly by 14 degrees around its centroid and asserts `validateClosedLoop` accepts it with `maxJoinDistance < DEFAULT_FRAME_EPSILON_POS / 10` and `maxTangentDelta < 1e-9`, pinning the float headroom for arbitrary-angle loops. A second new test in `tests/unit/trackPath.test.ts` rotates a 12-piece rectangle and asserts `buildTrackPath` puts every piece center at its `transform` and every consecutive `exit` / `entry` pair within `1e-9` world units. New regression tests in `tests/unit/pieceFrames.test.ts` pin `residualThetaAfterCardinalSnap` and `cardinalTurnsOfTheta` against thetas outside `[0, 2*PI)` and assert `frameOfPortAtTransform` is bit-equal between `theta = PI/2` and `theta = 5*PI/2`. The original v1-projectable long-chain test still reports zero drift exactly. The test wall in `tests/unit/trackVersion.test.ts` lost the `assertAllPiecesV1Projectable` describe block alongside the gate.
- Verification: dash checks (no U+2014 or U+2013 anywhere in src / tests / docs), `git diff --check`, `npm run type-check`, `npm test` passed with 3258 tests (two new continuous-angle closure tests, five residual-snap regression tests, two footprint-snap regression tests), focused `npx playwright test tests/e2e/smoke.spec.ts --grep "track editor"` passed with 9 tests, and `npm run build` passed.
- Assumptions: the residual rotation in `frameOfPortAtTransform` snaps to zero within `V1_PROJECTABLE_ROTATION_EPSILON = 1e-4` radians, sourced from the leaf module `src/game/cellSize.ts` so `pieceGeometry` and `pieceFrames` import the same canonical value. For grid-aligned pieces the residual is exactly zero so the function reduces to translate-only arithmetic, preserving every Stage 0.5 snapshot hash bit-for-bit. The converter keeps re-deriving cells from v1-projectable transforms because the cell fields still drive duplicate detection and footprint enumeration; the editor UX in Workstream B will introduce non-projectable transforms that bypass that normalization and rely on the runtime path that ships here. `buildTrackPath` now sources `center`, `entry`, `exit`, and `arcCenter` from `transformOf(piece)` and `frameOfPortAtTransform` so non-projectable pieces render at the correct world coordinates; for grid-aligned input this is bit-equal to the legacy cell-keyed arithmetic.
- GDD coverage: no GDD section change; this is a runtime refactor under existing Section 6 Track system functionality.
- Followups: Workstream B of Stage 2 (rotate handle, free placement, snap-radius nearest-neighbor matching, optional numeric input, reconciliation pass for nearly-closed loops, OBB-vs-OBB overlap detection) ships behind a feature flag in a separate PR; then Stage 3 flips the flag. See `docs/CONTINUOUS_ANGLE_PLAN.md` for the authoritative plan.

## 2026-05-05, Continuous-Angle Schema Swap (Stage 1 proper)

- Branch: `claude/continuous-angle-stage-1-Vho8x`
- Changed: shipped Stage 1 of the continuous-angle migration described in `docs/CONTINUOUS_ANGLE_PLAN.md`. `PieceSchema` now carries an optional `transform: { x, z, theta }` on the wire format; v1 payloads omit it. `TrackVersionSchema` carries an optional `schemaVersion` (parsed as any positive integer; the runtime gate `assertSchemaVersionSupported` rejects values greater than `MAX_SCHEMA_VERSION = 2` with a typed `SchemaTooNewError`). The new module `src/lib/trackVersion.ts` exports the deterministic v1 to v2 converter (`convertV1Piece`, `convertV1Pieces`, `convertV1Track`) plus a typed `SchemaTooNewError` and `assertSchemaVersionSupported` gate. `loadTrack` runs the gate immediately after schema parse and converts every piece, so the in-memory invariant is "every piece has `transform` populated"; `transformOf` and `endpointsOf` in `pieceGeometry.ts` now read from `transform` directly with no fallback. `endpointsOf` builds frames through a new `frameOfPortAtTransform` helper in `pieceFrames.ts` so the geometry layer is decoupled from cell coordinates. `isV1Projectable(piece)` is a pure derived check (FOLLOWUPS Rule 2: never a stored tag) gated by the new `V1_PROJECTABLE_POSITION_EPSILON = 1e-6` and `V1_PROJECTABLE_ROTATION_EPSILON = 1e-4` constants in `pieceGeometry.ts`, with the asymmetry rationale comment pinned at the call site. `canonicalTrackJson` now emits legacy `(row, col, rotation)` for v1-projectable pieces (omitting `transform`) and emits `transform` for non-projectable pieces, and adds `schemaVersion: 2` at the track level only when at least one piece is non-projectable, so unedited v1 tracks round-trip to byte-identical canonical JSON and the existing template hashes stay pinned. `validateClosedLoop`, `buildTrackPath`, and `canonicalTrackJson` normalize raw piece input via the converter at entry so callers (templates, defaults, in-place tests) keep working without per-test boilerplate. Editor mutations (`withPiecePlaced`, `withPieceRotated`, `moveSelectedPieces`, `rotateSelectedPieces`, `flipSelectedPieces`) re-derive `transform` after every grid-aligned change, and `DEFAULT_TRACK_PIECES`, `TRACK_TEMPLATES`, `TUNING_LAB_TRACK_PIECES` apply the converter at module init. New tests cover the converter, the version gate, the long-chain converter round-trip (still zero drift after the converter), the epsilon edges of `isV1Projectable`, and editor mutations preserving v1 projection. The Stage 0.5 snapshot wall and existing template hashes reproduce exactly.
- Verification: dash checks, `git diff --check`, `npm run type-check`, `npm test` passed with 3257 tests, focused `npx playwright test tests/e2e/smoke.spec.ts --grep "track editor"` passed with 9 tests, and `npm run build` passed.
- Assumptions: the v1 to v2 converter populates `transform` on every load path so the geometry layer never branches on whether `transform` is defined. Bumping `MAX_SCHEMA_VERSION` from 2 is a one-way door: any client running with a smaller `MAX_SCHEMA_VERSION` rejects newer payloads via `SchemaTooNewError`, so coordinate the rollout end-to-end before increasing it. Editor mutations intentionally re-derive `transform` from cell coordinates to keep grid-aligned operations v1-projectable; Stage 2's free-placement and rotate handle UI will mutate transforms directly without the projection.
- GDD coverage: no GDD section change; this is a refactor under existing Section 6 Track system functionality.
- Followups: Stage 2 (rotate handle, free placement behind a feature flag, reconciliation pass for nearly-closed continuous-angle loops, OBB-vs-OBB overlap detection); then Stage 3 (flip the flag, decide on Flex angle deprecation). See `docs/CONTINUOUS_ANGLE_PLAN.md` for the authoritative plan.

## 2026-05-04, Geometry Shim and Output Snapshots (Stage 0.5)

- Branch: `claude/add-flex-straight-piece-9Pjig`
- Changed: added the geometry accessor that Stage 1 proper (the schema swap to a `transform` field) will mutate. New module `src/game/pieceGeometry.ts` exports `geometryOf(piece)` returning `{ transform, endpoints, footprint }`, plus `transformOf(piece)` and `endpointsOf(piece)` helpers. The validator's `portsConnect` and `findConnectedNeighbor` now consume `endpointsOf(piece)` directly (the cheaper accessor that skips footprint computation), locking endpoints as the connector source of truth so the connection engine has zero surface to change in Stage 1 proper. The implementation still derives every field from `(row, col, rotation)`. Snapshot tests in `tests/unit/pieceGeometry.test.ts` bit-lock the v1 baseline for every track template across three downstream pipelines: sceneBuilder vertex buffer hash + vertex count, minimap path string hash, thumbnail path string hash. Stage 1 proper's new geometryOf implementation must reproduce these hashes exactly.
- Verification: dash checks, `git diff --check`, JSON parse for `docs/GDD_COVERAGE.json`, `npm run type-check`, `npm test` passed with 3216 tests including 10 new pieceGeometry tests, focused Playwright track-editor smoke passed with 9 tests, and `npm run build` passed with the existing React hook warnings in `RaceCanvas.tsx`, `TouchControls.tsx`, and `useGamepad.ts`.
- Assumptions: the geometry shim is internal scaffolding; no user-visible change. Existing callers can keep using `connectorPortsOf` (it's the implementation detail behind `endpointsOf`), but new callers and the validator should consume `geometryOf` only. The four track templates are the snapshot wall; new templates need a baseline entry added to `EXPECTED` before they can land.
- GDD coverage: no GDD section change; this is a refactor under existing Section 6 Track system functionality.
- Followups: Stage 1 proper adds `transform: { x, z, theta }` to `PieceSchema` (optional on the wire so v1 omits it; required-after-load via the v1 to v2 converter so downstream code reads only from `transform`); the persisted version gate lives on `TrackVersionSchema`; hash canonicalization preserves v1 hashes for tracks whose transforms project exactly back to integer cells. Then Stage 2 (rotate handle, free placement behind a flag), then Stage 3 (flip the flag, deprecate Flex angle). See `docs/CONTINUOUS_ANGLE_PLAN.md` for the authoritative schema model.

## 2026-05-04, Continuous-Angle Frame Layer (Stage 0 substrate)

- Branch: `claude/add-flex-straight-piece-9Pjig`
- Changed: added the connection-engine substrate the continuous-angle editor will rest on. New module `src/game/pieceFrames.ts` introduces `Frame` (world position plus outward tangent angle), `frameOfPort` (resolves any connector port to its world frame), `framesConnect` (epsilon matcher on position and antiparallel tangent), and `tangentsAreAntiparallel`. `portsConnect` in `src/game/track.ts` is rewritten to delegate to the frame matcher; integer cell-equality is gone, replaced by epsilon-tolerant world-frame matching with default thresholds 0.5 world units on position and 2 degrees on tangent. Cell-aligned legacy pieces hit zero distance, so every existing track and template validates identically and hashes are unchanged.
- Verification: dash checks, `git diff --check`, JSON parse for `docs/GDD_COVERAGE.json`, `npm run type-check`, `npm test` passed with 3201 tests including 15 new pieceFrames tests, focused Playwright track-editor smoke passed with 9 tests, and `npm run build` passed with the existing React hook warnings in `RaceCanvas.tsx`, `TouchControls.tsx`, and `useGamepad.ts`.
- Assumptions: this is the foundation slice, not the full data-model refactor. Pieces still serialize as `(row, col, rotation)` and the editor still places on the integer grid. Only the connection engine swaps under the hood. Subsequent PRs will add the `transform` field on `PieceSchema`, the v1 to v2 converter, the rotate handle, and the free-placement editor mode.
- GDD coverage: no GDD section change; this is a refactor under existing Section 6 Track system functionality.
- Followups: add `transform: { x, z, theta }` to `PieceSchema` with a v1 to v2 converter on load (Stage 1 proper); rotate-handle and free-placement editor UX behind a feature flag (Stage 2); flip the flag and deprecate Flex angle (Stage 3). See `docs/CONTINUOUS_ANGLE_PLAN.md` for the authoritative schema model.

## 2026-05-04, Flex Angle Straight Piece

- Branch: `claude/add-flex-straight-piece-9Pjig`
- Changed: added a new `flexStraight` piece type that breaks the strict 45-degree grid for straight runs. Each flex straight stores a `flex` spec with integer cell offsets `(dr, dc)` from the entry cell to the exit cell; the path between the two cardinal edge midpoints is a single straight line at any sub-45-degree angle. The vertical run is `|dr - 1|` cells (the south edge of the anchor row plus the north edge of the exit row add one full cell beyond `|dr|`), so e.g. `dr=-3, dc=1` produces `atan(1/4) ≈ 14.04` degrees off cardinal, and `dr=-1, dc=1` produces `atan(1/2) ≈ 26.57` degrees. Author picks the spec that matches the corner-to-corner geometry the track needs. Wired the type through `PieceTypeSchema`, `FlexStraightSpecSchema`, connector ports, supercover-line footprint, sampled centerline, hash canonicalization, mirror logic, pace notes, difficulty weights, the editor palette glyph, and a length / lateral / angle control bar in the palette. Existing track JSON, hashes, and pieces remain unchanged.
- Verification: dash checks, `git diff --check`, JSON parse for `docs/GDD_COVERAGE.json`, `npm run type-check`, `npm test` passed with 3186 tests, focused Playwright track-editor smoke passed with 9 tests, and `npm run build` passed with the existing React hook warnings in `RaceCanvas.tsx`, `TouchControls.tsx`, and `useGamepad.ts`.
- Assumptions: a flex straight's endpoints stay on cardinal cell-edge midpoints so the piece connects to existing grid pieces with the unchanged 8-direction connector matching. The path itself is a single straight line, which produces a small tangent kink at the joins with cardinal pieces; smoothing the joins with Bezier endpoints is a future refinement.
- GDD coverage: Section 6 Track system now records the flex-angle straight piece.
- Followups: smooth flex-straight joins with Bezier endpoints; expose a free-rotation drag handle for the place tool; add Miami-style template that uses flex straights for the back straight.

## 2026-05-04, Reference GP Turn Sequence

- Branch: `fix/reference-gp-turn-sequence`
- Changed: rebuilt Reference GP into a 63-piece valid loop that follows the supplied reference sectors turn for turn: diagonal start, T1-T3 complex, lower loop, right-side stack, long top straight, and T17-T19 return. Wheel contact now checks each wheel's current grid cell plus neighboring cells so road that visibly crosses a seam remains driveable.
- Verification: dash checks, `git diff --check`, JSON parse for `docs/GDD_COVERAGE.json`, focused `npm test -- tests/unit/trackTemplates.test.ts tests/unit/hashTrack.test.ts tests/unit/track.test.ts tests/unit/trackPath.test.ts tests/unit/sceneBuilder.test.ts tests/unit/wheelContact.test.ts` passed with 115 tests, `npm test` passed with 3157 tests, `npm run type-check` passed, targeted Playwright track-editor and Reference GP smoke passed with 8 tests, and `npm run build` passed with the existing React hook warnings in `RaceCanvas.tsx`, `TouchControls.tsx`, and `useGamepad.ts`.
- Assumptions: the 64-piece cap remains mandatory, so the replica prioritizes the reference's turn order and sector placement over exact corner radii or every minor visual wiggle.
- GDD coverage: Section 6 Track system records the turn-sequence rebuild and neighbor-cell wheel contact.
- Followups: none.

## 2026-05-04, Reference GP Kink Refresh

- Branch: `feature/reference-gp-smooth-pieces`
- Changed: updated the Reference GP template to use shallow kink pieces through the top straight, lower run, and right-side stack while preserving its 58-piece valid closed loop and the 64-piece cap.
- Verification: dash checks, `git diff --check`, JSON parse for `docs/GDD_COVERAGE.json`, focused `npm test -- tests/unit/trackTemplates.test.ts tests/unit/hashTrack.test.ts tests/unit/track.test.ts tests/unit/trackPath.test.ts tests/unit/sceneBuilder.test.ts` passed with 108 tests, `npm test` passed with 3156 tests, `npm run type-check` passed, targeted Playwright track-editor and Reference GP smoke passed with 8 tests, and `npm run build` passed with the existing React hook warnings in `RaceCanvas.tsx`, `TouchControls.tsx`, and `useGamepad.ts`.
- Assumptions: the first template refresh after the expanded catalog should prefer drop-in kink replacements over moving connector anchors, so the loop stays stable while still softening the most rigid straight runs.
- GDD coverage: Section 6 Track system keeps Reference GP covered and now records the smoother kink refresh.
- Followups: later template passes can use wide 45s, lane offsets, and grand sweeps where they require anchor relocation.

## 2026-05-04, Expanded Smooth Piece Catalog

- Branch: `feature/expanded-track-pieces`
- Changed: added wide 45 arcs, diagonal sweeps, kinks, lane offsets, tight and wide hairpins, and grand sweeps as discrete track piece types. Wired them through schema validation, connector ports, footprints, sampled centerlines, editor labels and glyphs, mirror transforms, pace notes, and difficulty scoring.
- Verification: dash checks, `git diff --check`, JSON parse for `docs/GDD_COVERAGE.json`, focused `npm test -- tests/unit/featureList.test.ts tests/unit/trackConnectors.test.ts tests/unit/schemas.test.ts tests/unit/trackPath.test.ts tests/unit/track.test.ts tests/unit/trackFootprint.test.ts tests/unit/editor.test.ts tests/unit/trackDifficulty.test.ts tests/unit/paceNotes.test.ts tests/unit/tuningLabTrack.test.ts` passed with 277 tests, `npm test` passed with 3156 tests, `npm run type-check` passed, targeted Playwright track-editor smoke passed with 8 tests, and `npm run build` passed with the existing React hook warnings in `RaceCanvas.tsx`, `TouchControls.tsx`, and `useGamepad.ts`.
- Assumptions: discrete piece types are better than per-piece geometry parameters for this catalog pass because they keep saved track JSON simple, hash inputs deterministic, and editor controls familiar.
- GDD coverage: Section 6 Track system now records the expanded smooth piece catalog.
- Followups: rebuild the Reference GP template with the new pieces after this catalog slice is merged.

## 2026-05-04, Continuous Road Surface

- Branch: `fix/continuous-road-strip`
- Changed: race scenes now render the asphalt as one continuous road strip from the ordered track path instead of adding one mesh per piece. Connector samples are deduplicated so diagonal and sweep joins share vertices and do not expose grass seams between adjacent pieces.
- Verification: dash checks, `git diff --check`, JSON parse for `docs/GDD_COVERAGE.json`, focused `npm test -- tests/unit/sceneBuilder.test.ts tests/unit/trackPath.test.ts tests/unit/wheelContact.test.ts tests/unit/minimap.test.ts` passed with 71 tests, `npm test` passed with 3155 tests, `npm run type-check` passed, targeted Playwright track-editor and Reference GP smoke passed with 8 tests, targeted race HUD smoke passed, and `npm run build` passed with the existing React hook warnings in `RaceCanvas.tsx`, `TouchControls.tsx`, and `useGamepad.ts`.
- Assumptions: editor previews and piece-local geometry tests should keep using `pieceGeometry`, while the race scene should use the continuous strip because it is the user-visible road surface.
- GDD coverage: Section 6 Track system now records the continuous road surface renderer.
- Followups: continue with expanded Miami piece families after this seam fix is merged.

## 2026-05-03, Miami Reference Template Revision

- Branch: `fix/miami-template-layout`
- Changed: replaced the rough 36-piece Reference GP layout with a 58-piece Miami-style replica that follows the diagonal start sector, T1-T3 kink, lower-left sector, bottom run, right-side stack, and long top straight more closely.
- Verification: dash checks, `git diff --check`, JSON parse for `docs/GDD_COVERAGE.json`, focused `npm test -- tests/unit/trackTemplates.test.ts tests/unit/hashTrack.test.ts tests/unit/track.test.ts tests/unit/trackPath.test.ts` passed with 103 tests, `npm test` passed with 3153 tests, `npm run type-check` passed, targeted Playwright track-editor smoke passed with 8 tests, `npx playwright test tests/e2e/smoke.spec.ts --grep "Reference GP"` passed, and `npm run build` passed with the existing React hook warnings in `RaceCanvas.tsx`, `TouchControls.tsx`, and `useGamepad.ts`.
- Assumptions: staying under the 64-piece cap is more important than pixel-tracing every radius, so the template uses the existing snapped straight, sweep, 45 arc, and diagonal pieces to preserve the turn sequence.
- GDD coverage: Section 6 Track system keeps Reference GP covered as a template and now records its Miami-style 58-piece revision.
- Followups: none.

## 2026-05-03, Mega Sweep Footprint Hole Fix

- Branch: `fix/footprint-self-overlap`
- Changed: mega sweep pieces now reserve only the swept road quadrant instead of a full 3x3 square. This keeps the visually empty inner cell available for other track pieces and stops the editor from reporting duplicate-cell errors in the hole of the sweep.
- Verification: dash checks, `git diff --check`, JSON parse for `docs/GDD_COVERAGE.json`, focused `npm test -- tests/unit/trackFootprint.test.ts tests/unit/track.test.ts tests/unit/trackPath.test.ts tests/unit/editor.test.ts` passed with 132 tests, `npm test` passed with 3153 tests, `npm run type-check` passed, targeted Playwright track-editor smoke passed with 8 tests, and `npm run build` passed with the existing React hook warnings in `RaceCanvas.tsx`, `TouchControls.tsx`, and `useGamepad.ts`.
- Assumptions: connector target anchors do not need to be inside the long-turn footprint to connect correctly, so the footprint should model road occupancy rather than every cell inside the visual bounding square.
- GDD coverage: Section 6 Track system now records mega sweep quadrant footprints.
- Followups: none.

## 2026-05-03, Editor Anchor Hit Testing

- Branch: `fix/editor-anchor-hit-testing`
- Changed: rotate and erase actions now prefer an exact piece anchor before falling back to footprint cells. This keeps clicks on a visible adjacent piece from rotating or deleting the long-turn piece whose clearance footprint also covers that cell. The editor SVG now exposes piece type and rotation data attributes so hit-test behavior can be asserted directly in smoke tests.
- Verification: dash checks, `git diff --check`, JSON parse for `docs/GDD_COVERAGE.json`, focused `npm test -- tests/unit/editor.test.ts tests/unit/track.test.ts tests/unit/trackFootprint.test.ts` passed with 77 tests, `npm test` passed with 3150 tests, `npm run type-check` passed, targeted Playwright track-editor smoke passed with 7 tests, and `npm run build` passed with the existing React hook warnings in `RaceCanvas.tsx`, `TouchControls.tsx`, and `useGamepad.ts`.
- Assumptions: footprint-cell rotation and erase should still work when no visible anchor is present in the clicked cell, but exact anchors should always win because that is the piece the author can see and intends to edit.
- GDD coverage: Section 6 Track system now records anchor-first editor actions for footprints.
- Followups: none.

## 2026-05-03, Diagonal Connector Target Diagnostics

- Branch: `fix/diagonal-footprint-diagnostics`
- Changed: footprint overlap validation now allows connector target cells to reach connector validation even when the wrong piece type sits there. This keeps diagonals or 45 arcs placed in long-turn target cells from showing as duplicate-cell errors, and instead surfaces the open connector plus the exact target cell.
- Verification: dash checks, `git diff --check`, JSON parse for `docs/GDD_COVERAGE.json`, focused `npm test -- tests/unit/track.test.ts tests/unit/trackPath.test.ts tests/unit/trackFootprint.test.ts` passed with 82 tests, `npm test` passed with 3147 tests, `npm run type-check` passed, targeted Playwright track-editor smoke passed with 6 tests, and `npm run build` passed with the existing React hook warnings in `RaceCanvas.tsx`, `TouchControls.tsx`, and `useGamepad.ts`.
- Assumptions: non-target anchors inside a multi-cell footprint should still be duplicate-cell errors, while target-cell anchors should be diagnosed by connector compatibility so authors get repair guidance.
- GDD coverage: Section 6 Track system now records connector-target footprint diagnostics.
- Followups: none.

## 2026-05-03, Reference GP Template

- Branch: `feature/reference-track-template`
- Changed: added a 36-piece Reference GP template that approximates the supplied circuit image with a long top straight, stacked right side, lower return, left-side sweep, and tight infield using existing straights, sweep turns, and S-curves.
- Verification: dash checks, `git diff --check`, JSON parse for `docs/GDD_COVERAGE.json`, focused `npm test -- tests/unit/trackTemplates.test.ts tests/unit/track.test.ts tests/unit/trackPath.test.ts` passed with 84 tests, focused `npm test -- tests/unit/trackTemplates.test.ts tests/unit/hashTrack.test.ts tests/unit/featureList.test.ts` passed with 29 tests, `npm test` passed with 3148 tests, `npm run type-check` passed, targeted Playwright track-editor smoke passed with 6 tests, and `npm run build` passed with the existing React hook warnings in `RaceCanvas.tsx`, `TouchControls.tsx`, and `useGamepad.ts`.
- Assumptions: this is a grid-piece replica rather than a pixel-perfect tracing, because the editor only supports snapped track pieces and planar cell connectors.
- GDD coverage: Section 6 Track system now records the Reference GP template.
- Followups: none.

## 2026-05-03, Editor Footprint Placement Fix

- Branch: `fix/editor-footprint-placement`
- Changed: `withPiecePlaced` now replaces only an exact anchor-cell match. Placing a new piece into another piece's clearance footprint no longer deletes the existing long-turn piece, so authors can fill adjacent connector targets around mega sweeps and hairpins without losing pieces.
- Verification: dash checks, `git diff --check`, JSON parse for `docs/GDD_COVERAGE.json`, focused `npm test -- tests/unit/editor.test.ts tests/unit/track.test.ts tests/unit/trackFootprint.test.ts` passed with 74 tests, `npm test` passed with 3146 tests, `npm run type-check` passed, targeted Playwright track-editor smoke passed with 5 tests, and `npm run build` passed with the existing React hook warnings in `RaceCanvas.tsx`, `TouchControls.tsx`, and `useGamepad.ts`.
- Assumptions: footprint cells should continue to support erase, rotate, selection, and transform behavior by occupied area, but piece placement must be anchor-only because placement is how authors repair open connectors near multi-cell pieces.
- GDD coverage: Section 6 Track system now records anchor-only editor placement for footprinted pieces.
- Followups: none.

## 2026-05-03, Editor Connector Diagnostics

- Branch: `feature/editor-connector-diagnostics`
- Changed: `validateClosedLoop` now returns structured validation issues for open connectors and duplicate cells. The track editor uses those issues to draw a red marker on the offending connector and a dashed target marker on the grid cell where a matching piece must be placed, plus a footer hint with the target row and column.
- Verification: dash checks, `git diff --check`, JSON parse for `docs/GDD_COVERAGE.json`, focused `npm test -- tests/unit/track.test.ts tests/unit/trackConnectors.test.ts tests/unit/editor.test.ts` passed with 72 tests, `npm test` passed with 3145 tests, `npm run type-check` passed, targeted Playwright track-editor smoke passed with 4 tests, and `npm run build` passed with the existing React hook warnings in `RaceCanvas.tsx`, `TouchControls.tsx`, and `useGamepad.ts`.
- Assumptions: showing the first failing connector is enough to make iterative repair practical, because each fixed connector lets validation advance to the next issue.
- GDD coverage: Section 6 Track system now records editor connector diagnostics.
- Followups: none.

## 2026-05-03, Mirrored 45 Arc

- Branch: `fix/arc45-left-piece`
- Changed: added `arc45Left` so diagonal transitions have both right-hand and left-hand cardinal-to-corner bridge pieces. Mirrored the sampled path, editor glyph, palette label, mirror-transform mapping, pace note, difficulty scoring, and docs.
- Verification: dash checks, `git diff --check`, JSON parse for `docs/GDD_COVERAGE.json`, focused `npm test -- tests/unit/trackConnectors.test.ts tests/unit/schemas.test.ts tests/unit/trackPath.test.ts tests/unit/track.test.ts tests/unit/trackDifficulty.test.ts tests/unit/paceNotes.test.ts tests/unit/editor.test.ts tests/unit/tuningLabTrack.test.ts` passed with 259 tests, `npm test` passed with 3144 tests, `npm run type-check` passed, targeted Playwright track-editor smoke passed, and `npm run build` passed with the existing React hook warnings in `RaceCanvas.tsx`, `TouchControls.tsx`, and `useGamepad.ts`.
- Assumptions: a separate visible palette tool is clearer than hiding handedness behind rotation because rotation alone cannot produce the mirrored 45-degree connector pair.
- GDD coverage: Section 6 Track system now records right and left 45-degree arcs.
- Followups: none.

## 2026-05-03, Diagonal Track Pieces

- Branch: `feature/diagonal-track-pieces`
- Changed: added `arc45` and `diagonal` track pieces. The 45 arc bridges cardinal connectors into corner connectors, and diagonal pieces chain corner-to-corner through the existing 8-direction connector scaffold. Wired both pieces into schema validation, sampled track paths, editor palette glyphs, pace notes, difficulty scoring, wheel contact coverage, player-facing feature copy, and Section 6 GDD coverage.
- Verification: dash checks, `git diff --check`, JSON parse for `docs/GDD_COVERAGE.json`, focused `npm test -- tests/unit/trackConnectors.test.ts tests/unit/schemas.test.ts tests/unit/trackPath.test.ts tests/unit/track.test.ts tests/unit/trackDifficulty.test.ts tests/unit/paceNotes.test.ts tests/unit/wheelContact.test.ts tests/unit/tuningLabTrack.test.ts` passed with 219 tests, `npm test` passed with 3142 tests, `npm run type-check` passed, targeted Playwright track-editor smoke passed, and `npm run build` passed with the existing React hook warnings in `RaceCanvas.tsx`, `TouchControls.tsx`, and `useGamepad.ts`.
- Assumptions: `arc45` should ship with the diagonal slice because it is the bridge that makes diagonal runs connect cleanly back into existing cardinal track pieces.
- GDD coverage: Section 6 Track system now records 45-degree arcs and diagonal straights as shipped track pieces.
- Followups: continue with Phase 2 double-wide tracks after the long-turn and diagonal piece set.

## 2026-05-03, Remove Home Race Calendar

- Branch: `remove-home-race-calendar`
- Changed: removed the race calendar heatmap from the home page while keeping the daily challenge and daily streak widgets. Updated the GDD home-page description to reflect the leaner first screen.
- Verification: dash checks, `git diff --check`, focused `npm test -- tests/unit/featureList.test.ts tests/unit/raceCalendar.test.ts tests/unit/dailyStreak.test.ts tests/unit/dailyChallenge.test.ts` passed with 124 tests, `npm run type-check` passed, and `npm run build` passed with the existing React hook warnings in `RaceCanvas.tsx`, `TouchControls.tsx`, and `useGamepad.ts`.
- Assumptions: the daily streak widget carries the useful "race today" behavior, while the 12-week heatmap is passive history better suited to a future stats surface if it returns.
- GDD coverage: Section 7 home-page scope now records daily challenge and daily streak without the home calendar.
- Followups: decide later whether to delete the dormant race calendar component and helper after a second pass.

## 2026-05-03, Hairpin Track Piece

- Branch: `feature/hairpin-track-piece`
- Changed: added the `hairpin` track piece with rotated connector ports, implicit 2x3 footprints, 65-sample centerlines, editor palette support, pace notes, difficulty scoring, wheel-contact coverage, and connector-port validation for multi-cell edge connectors.
- Verification: dash checks, `git diff --check`, JSON parse for `docs/GDD_COVERAGE.json`, focused `npm test -- tests/unit/trackPath.test.ts tests/unit/track.test.ts tests/unit/trackConnectors.test.ts tests/unit/schemas.test.ts tests/unit/trackDifficulty.test.ts tests/unit/paceNotes.test.ts tests/unit/tuningLabTrack.test.ts tests/unit/wheelContact.test.ts` passed with 211 tests, `npm test` passed with 3134 tests, `npm run build` passed with the existing React hook warnings in `RaceCanvas.tsx`, `TouchControls.tsx`, and `useGamepad.ts`, and `npm run type-check` passed after build.
- Assumptions: one `hairpin` piece type with rotation is simpler than separate up/down variants and matches the existing rotation model.
- GDD coverage: Section 6 Track system now records hairpin turns as a long-turn track piece.
- Followups: continue with Phase 1c 45 Arc.

## 2026-05-03, Mega Sweep Track Pieces

- Branch: `feature/mega-sweep-pieces`
- PR: #80
- Changed: added `megaSweepRight` and `megaSweepLeft` piece types with implicit 3x3 footprints, cardinal sweep connectors, 49-sample centerlines, editor palette entries, mirror support, pace notes, difficulty weights, and focused tests. Track validation now separates anchor-cell connector lookup from footprint occupancy, while still rejecting unrelated anchors inside a mega sweep footprint.
- Verification: dash checks, `git diff --check`, JSON parse for `docs/GDD_COVERAGE.json`, focused `npm test -- tests/unit/trackPath.test.ts tests/unit/track.test.ts tests/unit/trackConnectors.test.ts tests/unit/schemas.test.ts tests/unit/trackDifficulty.test.ts tests/unit/paceNotes.test.ts tests/unit/wheelContact.test.ts` passed with 196 tests, `npm test` passed with 3126 tests, `npm run build` passed with the existing React hook warnings in `RaceCanvas.tsx`, `TouchControls.tsx`, and `useGamepad.ts`, and `npm run type-check` passed after build. The first concurrent type-check attempt failed because `.next/types` files were missing while `next build` was regenerating them, then passed on rerun.
- Post-merge: PR #80 merged at commit `3e769fb`. Main CodeQL passed, Vercel production deployment completed, and `https://vibe-racer.vercel.app/` returned HTTP 200.
- Assumptions: Phase 1a keeps connector matching on anchor-adjacent cells because the current track graph does not support per-connector footprint offsets. The 3x3 footprint reserves clearance around the anchor while direct connector neighbors may occupy the connector cells.
- GDD coverage: Section 6 Track system now records mega sweep turns as a long-turn track piece.
- Followups: continue with Phase 1b Hairpin.

## 2026-05-03, Hash Canonicalization Plumbing

- Branch: `feature/hash-canonicalization-plumbing`
- PR: #79
- Changed: added hash canonicalization helpers for future optional track fields. Default `widthClass` values and empty `branchEdges` are omitted from canonical JSON, while non-default width metadata and non-empty branch edges are emitted deterministically. Current template hashes are pinned in tests to guard Phase 0 hash stability.
- Verification: dash checks, `git diff --check`, JSON parse for `docs/GDD_COVERAGE.json`, focused `npx vitest run tests/unit/hashTrack.test.ts tests/unit/schemas.test.ts tests/unit/trackTemplates.test.ts tests/unit/api.track.test.ts` passed with 94 tests, `npm test` passed with 3117 tests, `npm run build` passed with the existing React hook warnings in `RaceCanvas.tsx`, `TouchControls.tsx`, and `useGamepad.ts`, and `npm run type-check` passed after build.
- Post-merge: PR #79 merged at commit `83f9678`. Main CodeQL passed, Vercel production deployment completed, direct smoke of the project deployment URL was blocked by Vercel SSO with HTTP 401 and `_vercel_sso_nonce`, and `https://vibe-racer.vercel.app/` returned HTTP 200.
- Assumptions: Phase 0e should not add user-facing schema fields yet. It only prepares canonical hashing for Phase 2 width classes and Phase 3 branch metadata.
- GDD coverage: Section 6 Track system now records hash canonicalization plumbing for future optional track fields.
- Followups: continue with Phase 1 long-turn piece work after Phase 0 scaffolding.

## 2026-05-03, Eight Direction Connectors

- Branch: `feature/eight-direction-connectors`
- PR: #78
- Changed: expanded `Dir` to the 8-direction compass with diagonal offsets and `(d + 4) % 8` opposites, changed `connectorsOf` to return `Dir[]`, and kept existing pieces on cardinal connectors. Updated track path traversal, S-curve and sweep direction reversal, editor mirror rotation matching, pace-note turn deltas, straight road orientation, and the editor start arrow to use the new encoding.
- Verification: dash checks, `git diff --check`, JSON parse for `docs/GDD_COVERAGE.json`, focused `npx vitest run tests/unit/trackConnectors.test.ts tests/unit/track.test.ts tests/unit/trackPath.test.ts tests/unit/editor.test.ts tests/unit/paceNotes.test.ts tests/unit/sceneBuilder.test.ts tests/unit/wrongWay.test.ts tests/unit/wheelContact.test.ts tests/unit/tick.test.ts` passed with 182 tests, `npm test` passed with 3111 tests, `npm run build` passed with the existing React hook warnings in `RaceCanvas.tsx`, `TouchControls.tsx`, and `useGamepad.ts`, and `npm run type-check` passed after build.
- Post-merge: PR #78 merged at commit `a67ac0d`. Main CodeQL passed, Vercel production deployment completed, direct smoke of the project deployment URL was blocked by Vercel SSO with HTTP 401 and `_vercel_sso_nonce`, and `https://vibe-racer.vercel.app/` returned HTTP 200.
- Assumptions: Phase 0d should only widen connector representation. Diagonal and corner-connector pieces remain Phase 1 work, so current saved tracks stay cardinal-only and hash inputs do not change.
- GDD coverage: Section 6 Track system now records the 8-direction connector scaffold for future diagonal pieces and junctions.
- Followups: continue with Phase 0e hash canonicalization plumbing.

## 2026-05-03, Track Footprint Scaffold

- Branch: `feature/track-footprint-scaffold`
- PR: #77
- Changed: added optional piece footprints to the schema plus `src/game/trackFootprint.ts` helpers for defaulting, normalization, occupied-cell resolution, rotation, and mirroring. Track validation now treats every footprint cell as occupied, rejects overlap, and does not let a footprint cell satisfy its own connector. Track hashing omits the default footprint and includes non-default footprints in stable normalized order. Editor helpers now place, remove, count, move, rotate, and flip footprinted pieces atomically by occupied cells.
- Verification: dash checks, `git diff --check`, JSON parse for `docs/GDD_COVERAGE.json`, focused `npx vitest run tests/unit/trackFootprint.test.ts tests/unit/editor.test.ts tests/unit/schemas.test.ts tests/unit/hashTrack.test.ts tests/unit/track.test.ts` passed with 130 tests, `npm test` passed with 3106 tests, `npm run build` passed with the existing React hook warnings in `RaceCanvas.tsx`, `TouchControls.tsx`, and `useGamepad.ts`, and `npm run type-check` passed after the build regenerated `.next/types`. The first concurrent type-check attempt failed because `.next/types` files were missing while `next build` was regenerating them, then passed on rerun.
- Post-merge: PR #77 merged at commit `b501cd9`. Main CodeQL passed, Vercel production deployment completed, direct smoke of the deployment URL was blocked by Vercel SSO with HTTP 401 and `_vercel_sso_nonce`, and `https://vibe-racer.vercel.app/` returned HTTP 200.
- Assumptions: Phase 0c should add data-model and editor-helper readiness only. No new multi-cell piece type is exposed yet, and connector placement for future long-turn pieces remains in Phase 1 after the 8-direction connector scaffold lands.
- GDD coverage: Section 6 Track system now records the multi-cell footprint scaffold for future long turns and branching layouts.
- Followups: continue with Phase 0d 8-direction connector support.

## 2026-05-03, Track Path Segments

- Branch: `feature/track-path-segments`
- PR: #76
- Changed: added `PathSegment` and `PathLocator` metadata to `TrackPath`, with current tracks exposed as one closed `main` segment. Added `cellToLocators` as the future branch-aware cell index while preserving the legacy `path.order` array and `cellToOrderIdx` map for existing callers.
- Verification: dash checks, `git diff --check`, JSON parse for `docs/GDD_COVERAGE.json`, focused `npx vitest run tests/unit/trackPath.test.ts tests/unit/minimap.test.ts tests/unit/tick.test.ts tests/unit/wheelContact.test.ts tests/unit/paceNotes.test.ts` passed with 92 tests, `npm test` passed with 3082 tests, `npm run build` passed with the existing React hook warnings in `RaceCanvas.tsx`, `TouchControls.tsx`, and `useGamepad.ts`, and `npm run type-check` passed after the build regenerated `.next/types`. The first concurrent type-check attempt failed because `.next/types` files were missing while `next build` was regenerating them, then passed on rerun.
- Post-merge: PR #76 merged at commit `752b412`. Main CodeQL passed, Vercel production deployment completed, direct smoke of the deployment URL was blocked by Vercel SSO with HTTP 401 and `_vercel_sso_nonce`, and `https://vibe-racer.vercel.app/` returned HTTP 200.
- Assumptions: Phase 0b should expose segment metadata without converting callers yet, so the current single-loop reader surface remains behaviorally identical.
- GDD coverage: Section 6 Track system now records the segment-based path scaffold for future alternative routes.
- Followups: continue with Phase 0c multi-cell footprint support.

## 2026-05-03, Track Width Scaffold

- Branch: `feature/track-width-scaffold`
- PR: #75
- Changed: added `src/game/trackWidth.ts` as the default-width resolver for upcoming wide-track work, re-exported the legacy `TRACK_WIDTH` from `trackPath.ts`, and routed wheel contact, kerbs, scenery, minimap bounds, thumbnails, checkpoint marker placement, finish-line geometry, and road extrusion through width helpers where piece context is available. The default helper still returns width 8 for every piece, so existing tracks remain visually and behaviorally unchanged.
- Verification: dash checks, `git diff --check`, JSON parse for `docs/GDD_COVERAGE.json`, focused `npx vitest run tests/unit/trackWidth.test.ts tests/unit/wheelContact.test.ts tests/unit/kerbs.test.ts tests/unit/minimap.test.ts tests/unit/scenery.test.ts tests/unit/trackThumbnail.test.ts tests/unit/sceneBuilder.test.ts` passed with 73 tests, `npm test` passed with 3080 tests, `npm run build` passed with the existing React hook warnings in `RaceCanvas.tsx`, `TouchControls.tsx`, and `useGamepad.ts`, and `npm run type-check` passed after the build regenerated `.next/types`. The first concurrent type-check attempt failed because `.next/types` files were missing while `next build` was regenerating them, then passed on rerun.
- Post-merge: PR #75 merged at commit `17102a1`. Main CodeQL passed, Vercel production deployment completed, direct smoke of the deployment URL was blocked by Vercel SSO with HTTP 401 and `_vercel_sso_nonce`, and `https://vibe-racer.vercel.app/` returned HTTP 200.
- Assumptions: Phase 0a should preserve all legacy constants and leave `widthClass` schema work to Phase 2, so this slice introduces no track hash input.
- GDD coverage: Section 6 Track system now records the track-width scaffold as Phase 0 groundwork for double-wide tracks.
- Followups: continue with Phase 0b segment-based `TrackPath`.

## 2026-05-01, Music Editor Front-End Redesign

- Branch: `feature/music-editor-redesign`
- Changed: rebuilt the `/music/[slug]` editor around three new components and a live-preview pipeline. New `MusicTransport` is a sticky bar with Play / Stop, a 16-cell playhead driven by the new `getActiveMusicStep()` engine getter, 1 / 2 / 4 bar grouping, simulated intensity (with auto-sweep) / lap / off-track inputs that drive `setGameIntensity` / `setMusicLapIndex` / `setMusicOffTrack` so automation lanes can be auditioned without a real race. New `MusicVibePad` is an XY drag pad that maps energy and mood onto BPM, scale flavor, drum density, voice waves, voice volumes, and the intensity tempo curve via the new pure helper `src/lib/musicVibe.ts`; a slot-machine Roll re-shuffles the rhythm via `generateMusicFromSeed` and re-applies the puck position, while a Lock toggle pins the current vibe. New `MusicLibrary` drawer reads the existing `myMusic` and `knownMusic` stores and surfaces filter chips (All / Mine / This slug / Visited / Defaults), mini bass-pattern cards, audition / load / apply / delete actions, and an active-override badge. The save bar is rebuilt around three scope-explicit actions (🌐 track default, 👤 my override, 🔖 library) each with a one-line audience description and a confirm sheet that recaps audience before committing; a colored scope banner under the title mirrors the active scope so the user always knows who hears the draft. Voice rows gained solo, mute, and audition chips that drive a preview-only mix without dirtying the saved tune; audition uses the new `auditionMusicNote()` engine helper.
- Verification: dash checks, `git diff --check`, `npm run type-check`, `npm test` (3076 tests passing including 16 new across `tests/unit/musicVibe.test.ts` and `tests/unit/musicLibrary.test.ts`), `npm run lint` (only the existing pre-existing hook warnings in `RaceCanvas.tsx`, `TouchControls.tsx`, and `useGamepad.ts` remain), and `npm run build` pass. Spot-check via `next dev` GET on `/music/test-redesign` returned 200.
- Assumptions: looping is the default mode (the engine already loops every 16 steps automatically) so the transport just exposes a Play toggle and the bar grouping is decorative for the counter rather than a separate engine feature; tap-rhythm drum capture was deferred since it would require extending the data model from the current density-only drum config.
- GDD coverage: extends Section 13 Audio with the Music Editor redesign build-log entry.
- Followups: tap-rhythm drum input would land alongside a per-step drum pattern data model upgrade; consider polishing the slot-machine animation and adding rename / duplicate actions to the library drawer.

## 2026-05-01, Settings Ghost Tab Extraction

- Branch: `refactor/settings-ghost-tab`
- Changed: moved the Ghost and guides Settings tab into a dedicated `SettingsGhostTab` component, keeping ghost source selection, ghost readout toggles, and racing-line controls together while reducing `SettingsPane.tsx` ownership.
- Verification: dash checks, `git diff --check`, JSON parse for `docs/GDD_COVERAGE.json`, `npm run type-check`, `npm test`, `npm run lint`, `npm run build`, and focused Playwright settings smoke pass. The first Playwright attempt overlapped with `npm run build` and failed to start from a transient `.next` missing-file race, then passed when rerun after the build completed. Lint and build still report the existing React hook warnings in `RaceCanvas.tsx`, `TouchControls.tsx`, and `useGamepad.ts`.
- Assumptions: the extracted tab should preserve the current controls and copy while making future Settings cleanup less risky.
- GDD coverage: keeps Section 9 menu coverage complete and adds the extracted Ghost tab as Settings evidence.
- Followups: continue extracting Settings tabs that have clear ownership boundaries.

## 2026-05-01, Shared Menu Setting Rows

- Branch: `refactor/menu-setting-row`
- Changed: added a shared `MenuSettingRow` primitive in `MenuUI`, moved Audio tab toggle rows onto it, and replaced the duplicated Settings pane toggle/status row markup for Controls, Ghost, HUD, and Effects sections.
- Verification: dash checks, `git diff --check`, JSON parse for `docs/GDD_COVERAGE.json`, `npm run type-check`, `npm test`, `npm run lint`, `npm run build`, focused `tests/unit/featureList.test.ts`, and focused Playwright settings smoke pass. Lint and build still report the existing React hook warnings in `RaceCanvas.tsx`, `TouchControls.tsx`, and `useGamepad.ts`.
- Assumptions: consolidating the repeated label-and-control row pattern should preserve the current layout while making future Settings tab extraction safer.
- GDD coverage: keeps Section 9 menu coverage complete and records the shared menu row primitive as architecture evidence.
- Followups: continue extracting larger Settings tabs after the shared primitives are in place.

## 2026-05-01, Settings Audio Tab Extraction

- Branch: `refactor/settings-audio-tab`
- Changed: moved Audio settings into a dedicated `SettingsAudioTab` component, grouped controls into Mix, Engine noise, Music identity, and Track music sections, and kept the parent Settings pane responsible for only tab routing and global reset behavior.
- Verification: dash checks, `git diff --check`, JSON parse for `docs/GDD_COVERAGE.json`, focused `tests/unit/audioSettings.test.ts`, focused Playwright settings smoke, `npm run type-check`, `npm test`, `npm run lint`, and `npm run build` pass. Lint and build still report the existing React hook warnings in `RaceCanvas.tsx`, `TouchControls.tsx`, and `useGamepad.ts`.
- Assumptions: this slice should preserve existing audio behavior while improving settings scanability and reducing `SettingsPane.tsx` ownership.
- GDD coverage: keeps Section 13 Audio complete and adds the extracted Audio tab component as evidence.
- Followups: continue extracting settings tabs or shared setting-row primitives in later UI and source-structure slices.

## 2026-04-30, Engine SFX Balance

- Branch: `polish/engine-sfx-balance`
- Changed: switched the default engine-noise profile from Smooth to Warm, reduced the default SFX volume and added a global SFX bus attenuation so existing saved settings also play quieter, made Electric brighter and more animated, and added high-speed tone modulation so full-throttle engine sound fluctuates instead of holding one steady tone.
- Verification: dash checks, `git diff --check`, JSON parse for `docs/GDD_COVERAGE.json`, focused `tests/unit/audio.test.ts` and `tests/unit/audioSettings.test.ts`, `npm run type-check`, `npm test`, `npm run lint`, and `npm run build` pass. Lint and build still report the existing React hook warnings in `RaceCanvas.tsx`, `TouchControls.tsx`, and `useGamepad.ts`.
- Assumptions: global SFX bus attenuation is the correct fix for "all SFX still too loud" because it reduces old saved settings as well as new defaults.
- GDD coverage: extends Section 13 Audio with quieter SFX balancing and high-speed engine modulation.
- Followups: none.

## 2026-04-30, Engine Noise Options

- Branch: `feature/engine-sound-options`
- Changed: added a persisted engine-noise picker to Audio settings with Smooth, Classic, Warm, and Electric profiles. Smooth is now the default and lowers the continuous engine drone's volume and brightness for long full-speed races. Classic preserves the original sawtooth engine behavior as an explicit player choice. Race and Tuning Lab canvases poll the profile through a ref so Settings changes apply without remounting.
- Verification: dash checks, `git diff --check`, JSON parse for `docs/GDD_COVERAGE.json`, focused `tests/unit/audio.test.ts` and `tests/unit/audioSettings.test.ts`, `npm run type-check`, `npm test`, `npm run lint`, `npm run build`, and focused Playwright settings smoke pass. Lint and build still report the existing React hook warnings in `RaceCanvas.tsx`, `TouchControls.tsx`, and `useGamepad.ts`.
- Assumptions: Smooth is the least fatiguing default because it uses a lower-volume triangle profile with a softer filter range, while Classic remains available for players who liked the original aggressive sound.
- GDD coverage: extends Section 13 Audio with engine-noise choices.
- Followups: none.

## 2026-04-30, Keyboard And Gamepad Menu Navigation

- Branch: `claude/controller-keyboard-navigation-xxQnc`
- Changed: built a small `MenuNav` focus-management module (`src/components/MenuNav/`) that registers focusables, walks them with arrow keys, restores focus on close, and runs an rAF gamepad poller mapping DPad / left stick to navigation, A to activate, B to close, LB / RB to step tab bars. Updated `MenuUI.tsx` to register `MenuButton`, `MenuToggle`, `MenuSlider`, and `MenuHeader` close buttons, added a focus ring via `:focus-visible`, and shipped new `MenuRadioRow` and `MenuTabBar` primitives. Wrapped every overlay (Pause, Settings, Session Summary, Race Pane, Achievements, Track Stats, Lap History, PB History, Photo Mode, Tuning Panel, Tune Editor, Leaderboard, Initials Prompt, Feature List, How to Play, Feedback FAB) with `MenuNavProvider`. Replaced SettingsPane's ad-hoc tab bar with `MenuTabBar` and added a capture-mode suppression hook so rebind prompts still receive the next keypress. Added `useKeyboard.ts` early-return guard on `isMenuNavOpen()` so racing input does not leak through a focused menu button. Added a lightweight `TitleGamepadNav` component on the title page that walks the document tab order with DPad and clicks with A.
- Verification: dash checks, `npm run type-check`, `npm test` (3017 tests pass), `npm run lint` (no new warnings), em-dash grep on changed files. New Playwright e2e tests at `tests/e2e/menu-keyboard.spec.ts` and `tests/e2e/menu-gamepad.spec.ts`.
- Assumptions: gamepad menu binds (DPad, A, B, LB / RB) are intentionally not rebindable; race-control rebinding stays untouched. Sliders follow ARIA semantics: Left / Right adjust value, Up / Down move focus.
- GDD coverage: completes Section 4 controls scope for menu-level keyboard and gamepad navigation.
- Followups: none.

## 2026-04-29, Track Tune Automation

- Branch: `feature/tune-automation`
- PR: #61
- Changed: added tune automation for per-lap key changes, off-track scale swaps, off-track volume ducking, custom 8-step finish stinger phrases, race-state wiring from lap and on-track HUD state, and Tune Editor automation controls.
- Verification: dash checks, `git diff --check`, JSON parse for `docs/GDD_COVERAGE.json`, focused `tests/unit/music.test.ts`, `tests/unit/tunes.test.ts`, and `tests/unit/schemas.test.ts`, `npm run type-check`, `npm test`, `npm run build`, and focused Playwright `tests/e2e/smoke.spec.ts --grep "tune editor"` pass. Build reports existing React hook lint warnings in `RaceCanvas.tsx`, `TouchControls.tsx`, and `useGamepad.ts`. PR #61 checks and main CodeQL passed, and the main Vercel production deployment succeeded. Production HTTP smoke against `https://vibe-racer-9btccmzpc-randroid88s-projects.vercel.app` was blocked by Vercel SSO with HTTP 401 and `_vercel_sso_nonce`.
- Assumptions: `hud.lapCount` represents the current lap number, so music uses `lapCount - 1` as the completed-lap count for per-lap key changes. Production smoke may remain blocked by Vercel SSO even when deployment status is green.
- GDD coverage: completes Section 13 Audio for the Track Tune Editor automation scope.
- Followups: none for Track Tune Editor automation.

## 2026-04-29, Track Tune Persistence And Editor

- Branch: `feature/tune-editor-persistence`
- PR: #60
- Changed: added the track tune API and KV keys, server tune loading, personal tune and override localStorage helpers, race-time override resolution, `/tune/[slug]` editor route, a first usable tune editor with step grids, Settings Audio tune selection, and a Track Editor tune entry.
- Verification: dash checks, `git diff --check`, JSON parse for `docs/GDD_COVERAGE.json`, focused `tests/unit/api.trackTune.test.ts`, `tests/unit/myTunes.test.ts`, `tests/unit/tunes.test.ts`, `tests/unit/music.test.ts`, and `tests/unit/schemas.test.ts`, `npm run type-check`, `npm test`, `npm run build`, and focused Playwright `tests/e2e/smoke.spec.ts --grep "tune editor"` pass. Build reports existing React hook lint warnings in `RaceCanvas.tsx`, `TouchControls.tsx`, and `useGamepad.ts`.
- Assumptions: Slice 2 should ship the usable save/apply loop first. Automation-specific editor controls remain in Slice 3 with the engine state wiring.
- GDD coverage: advances Section 13 Audio by closing persistence, personal override, editor route, Settings, and Track Editor entry gaps.
- Followups: Slice 3 automation features remain high priority. Production smoke for PR #57 was blocked locally by Vercel SSO on the GitHub deployment URL even though main CI and deployment status were green.

## 2026-04-29, Track Tune Engine Foundation

- Branch: `feature/tune-engine-foundation`
- PR: #57
- Changed: added the TrackTune value model, Zod schema exports, deterministic seed-word tune generator, shared FNV-1a helper, and a tune-driven game-step renderer with `setActiveTune(tune | null)` for the game music track. The race page now clears any authored tune on slug changes as the Slice 1 integration point, preserving legacy per-slug personalization when no authored tune is active.
- Verification: dash checks, `git diff --check`, JSON parse for `docs/GDD_COVERAGE.json`, focused `tests/unit/tunes.test.ts`, `tests/unit/music.test.ts`, `tests/unit/musicPersonalization.test.ts`, and `tests/unit/schemas.test.ts`, `npm run type-check`, `npm test`, and `npm run build` pass. Build reports existing React hook lint warnings in `RaceCanvas.tsx`, `TouchControls.tsx`, and `useGamepad.ts`.
- Assumptions: authored tunes should own root, scale, and BPM when active. Existing slug and initials personalization continues to apply only to the default tune path until the tune override UX ships.
- GDD coverage: moves Section 13 Audio to partial for the new Track Tune Editor scope and records the engine foundation as implemented.
- Followups: Slice 2 persistence and editor UI, then Slice 3 automation features.

## 2026-04-29, Feature List Credits

- Branch: `feature/feature-list-credits`
- PR: #56
- Changed: added a full-screen scrolling Feature List overlay that can be opened from the direct `/features` route, title screen, or Settings Profile tab, backed by the same player-facing feature catalog as the README.
- Verification: dash checks, `git diff --check`, JSON parse for `docs/GDD_COVERAGE.json`, focused `tests/unit/featureList.test.ts`, `npm run type-check`, `npm test`, `npm run build`, and full Playwright smoke. The first smoke run exposed an existing strict text locator in the leaderboard metadata test; tightening it to the visible `30u/s` setup value made the rerun pass. After adding `/features`, reran the focused feature-list unit test, type-check, full Playwright smoke, and build. Copilot review comments were addressed by raising the modal z-index, stabilizing close callbacks, and preserving Space key activation on focused buttons.
- Assumptions: Feature List belongs with player info on the title screen and Profile tab, while in-race pause stays focused on critical race actions. The direct route is an access path for the Feature List credits screen, not a separate catalog feature.
- GDD coverage: extends Section 9 Title screen, menu, and pause with the Feature List credits entry point.
- Followups: none recorded.

## 2026-04-29, Archived Dot Progress Summary

- Branch: `docs/archive-progress-summary`
- PR: #54
- Changed: summarized older archived Dot entries that predate the current detailed progress-log era, and clarified that collision-magnitude rumble is blocked until the game has a real collision event source.
- Verification: dash checks, `git diff --check`, JSON parse for `docs/GDD_COVERAGE.json`, and `npm run type-check`.
- Assumptions: archived local `.dots` files are useful continuity input but should not be required reading for routine resume. The progress log should carry the durable summary instead.
- GDD coverage: no product behavior changed.
- Followups: removes the deeper progress-history followup.

## 2026-04-29, Gamepad Trigger Rumble

- Branch: `feature/gamepad-trigger-rumble`
- PR: #53
- Changed: added best-effort Xbox One / Series trigger-rumble impulses on top of existing dual-rumble gamepad event cues, with per-pad unsupported-effect suppression so Xbox 360 and unsupported browser paths do not retry after failure.
- Verification: dash checks, `git diff --check`, JSON parse for `docs/GDD_COVERAGE.json`, focused `tests/unit/haptics.test.ts`, `npm run type-check`, `npm test`, `npm run build`, and full Playwright smoke. The first smoke attempt overlapped with `next build` writing `.next` and failed to start its web server with a transient JSON parse error; rerunning after build completed passed.
- Assumptions: trigger-rumble should remain an add-on to the existing dual-rumble path. The strong and weak intensity sliders scale trigger cues by their average so players can still lower the total controller feel without adding another setting.
- GDD coverage: extends Section 13 Audio / haptics with impulse-trigger support.
- Followups: removed the completed Xbox One / Series trigger-rumble item.

## 2026-04-29, Gamepad Rumble Intensity

- Branch: `feature/gamepad-rumble-intensity`
- PR: #52
- Changed: added separate strong and weak motor intensity sliders for gamepad rumble, persisted them in control settings, and applied them to both continuous rumble and one-shot impulses.
- Verification: dash checks, `git diff --check`, JSON parse for `docs/GDD_COVERAGE.json`, focused `tests/unit/haptics.test.ts` and `tests/unit/controlSettings.test.ts`, `npm run type-check`, `npm test`, `npm run build`, and full Playwright smoke.
- Assumptions: one pair of per-motor sliders is simpler than per-cue sliders and covers the real player need: lowering engine / chassis weight independently from slip / warning chatter.
- GDD coverage: extends Section 13 Audio / haptics with player-tunable gamepad rumble intensity.
- Followups: removed the completed per-channel intensity slider item.

## 2026-04-29, Stale Off-track Rumble Followup Cleanup

- Branch: `docs/remove-stale-offtrack-rumble-followup`
- PR: #51
- Changed: removed the stale continuous off-track gamepad rumble followup after confirming `src/lib/gamepadRumble.ts` already adds an off-track strong-motor bias and `tests/unit/gamepadRumble.test.ts` covers the baseline cue.
- Verification: dash checks, `git diff --check`, JSON parse for `docs/GDD_COVERAGE.json`, and `npm run type-check`.
- Assumptions: this is a backlog cleanup slice only; the existing implementation and GDD already document continuous off-track rumble.
- GDD coverage: no coverage change; Section 13 already records the continuous off-track rumble mapper.
- Followups: removed stale continuous off-track rumble item.

## 2026-04-29, Gamepad Event Rumble

- Branch: `feature/gamepad-event-rumble`
- PR: #50
- Changed: added gamepad rumble impulses for wrong-way warning and achievement unlock events, reusing the existing gamepad rumble mode and active-pad capability checks.
- Verification: dash checks, `git diff --check`, JSON parse for `docs/GDD_COVERAGE.json`, focused `tests/unit/haptics.test.ts`, `npm run type-check`, `npm test`, `npm run build`, and full Playwright smoke.
- Assumptions: this is an event-cue slice only; continuous rumble shaping, collision impulses, trigger rumble, and per-channel intensity controls remain separate followups.
- GDD coverage: extends Section 13 Audio / haptics with wrong-way and achievement gamepad impulses.
- Followups: removed the completed wrong-way and achievement-unlock gamepad rumble item.

## 2026-04-29, Architecture Tree Refresh

- Branch: `docs/architecture-tree-refresh`
- PR: #49
- Changed: refreshed the Section 16 architecture tree and build log so they name the current App Router routes, API handlers, RaceCanvas renderer, hooks, game helpers, lib modules, and middleware layout.
- Verification: dash checks, `git diff --check`, JSON parse for `docs/GDD_COVERAGE.json`, and `npm run type-check`.
- Assumptions: this is a docs-only reconciliation slice because the architecture gap was stale documentation, not missing runtime behavior.
- GDD coverage: completes Section 16 Architecture.
- Followups: none recorded.

## 2026-04-29, Feedback Panel Polish

- Branch: `polish/feedback-panel`
- PR: #48
- Changed: polished the pause-menu feedback panel with shared menu styling, clearer header hierarchy, an inline close control, attachment chips, stable textarea sizing, message count feedback, and clearer success / retry states.
- Verification: dash checks, `git diff --check`, JSON parse for `docs/GDD_COVERAGE.json`, `npm run type-check`, focused `tests/e2e/feedback.spec.ts`, full Playwright smoke, and `npm run build`.
- Assumptions: visual polish should preserve the existing single-click open behavior, pause-only mounting, screenshot capture, console log capture, and `/api/feedback` payload shape.
- GDD coverage: completes Section 12 Feedback FAB.
- Followups: none recorded.

## 2026-04-29, Coverage Progress Cleanup

- Branch: `docs/coverage-progress-cleanup`
- PR: #47
- Changed: reconciled stale progress-log PR numbers, promoted shipped GDD sections with no remaining user-visible gaps to done, and expanded the coverage ledger so every active GDD section has explicit status, evidence, and remaining gaps.
- Verification: dash checks, `git diff --check`, JSON parse for `docs/GDD_COVERAGE.json`, and `npm run type-check`.
- Assumptions: sections with live build logs and no recorded remaining product gaps should be marked done rather than left partial indefinitely; Feedback FAB visual polish and the stale architecture diagram remain tracked as explicit docs coverage gaps.
- GDD coverage: closes silent empty-gap partial states for core loop, camera, controls, routing, race flow, and menus; records the remaining Section 12 and Section 16 gaps.
- Followups: none recorded.

## 2026-04-29, Audio SFX Polish

- Branch: `feature/audio-sfx-polish`
- PR: #46
- Changed: added wrong-way and achievement unlock one-shot SFX cues, wired wrong-way playback to the HUD banner rising edge, wired achievement sparkle to the unlock toast flow, and added pure pattern plus Web Audio scheduling tests.
- Verification: dash checks, `git diff --check`, JSON parse for `docs/GDD_COVERAGE.json`, focused `tests/unit/audio.test.ts`, `npm run type-check`, `npm test`, `npm run build`, and full Playwright smoke.
- Assumptions: the best PR-sized deeper SFX polish pass is to cover existing user-visible events that had visual feedback but no sound, rather than adding new settings or changing the music system.
- GDD coverage: completes Section 13 Audio.
- Followups: none recorded.

## 2026-04-29, Editor Track Templates

- Branch: `feature/editor-track-templates`
- PR: #45
- Changed: added a small track template library with Starter oval, Sweep loop, and S-curve loop presets; surfaced a Templates panel in the editor; applying a template replaces the current piece layout with a valid closed loop, clears custom checkpoints and decorations, selects the new loop, and preserves advanced track settings.
- Verification: dash checks, `git diff --check`, JSON parse for `docs/GDD_COVERAGE.json`, focused `tests/unit/trackTemplates.test.ts`, focused `tests/unit/editor.test.ts`, `npm run type-check`, `npm test`, `npm run build`, and full Playwright smoke.
- Assumptions: templates are complete starter loops rather than partial disconnected stamps, which keeps Save governed by existing closed-loop validation and avoids adding repair UX in this slice.
- GDD coverage: completes Section 6 track system for the current grid model. Elevation ramps remain outside the current planar vehicle scope.
- Followups: none recorded.

## 2026-04-29, Selected Track Transforms

- Branch: `feature/selected-track-transforms`
- PR: #44
- Changed: added selected-piece movement, rotation, horizontal flip, and vertical flip actions to the track editor, including collision blocking against unselected track pieces, keyboard shortcuts, checkpoint transform carryover, and focused pure editor tests.
- Verification: dash checks, `git diff --check`, JSON parse for `docs/GDD_COVERAGE.json`, focused `tests/unit/editor.test.ts`, `npm run type-check`, `npm test`, `npm run build`, and full Playwright smoke.
- Assumptions: transforms operate only on selected track pieces. Empty selected cells define the rectangle for flips but do not move decorations; decorations remain cosmetic and are cleared by the existing piece-overlap cleanup when a transformed piece lands on them.
- GDD coverage: advances Section 6 advanced authoring with selected track transforms.
- Followups: track templates remained in `docs/FOLLOWUPS.md` until the next slice.

## 2026-04-29, Editor Rectangle Selection

- Branch: `feature/editor-rectangle-selection`
- PR: #43
- Changed: added a Select tool to the track editor with two-click rectangular cell selection, selected-cell highlighting, anchor feedback, selected piece / cell counts, and a Clear selection action.
- Verification: dash checks, `git diff --check`, JSON parse for `docs/GDD_COVERAGE.json`, focused `tests/unit/editor.test.ts`, `npm run type-check`, `npm test`, `npm run build`, and full Playwright smoke.
- Assumptions: this slice keeps selection non-mutating so later transform tools can build on it without changing track serialization, validation, or save payloads.
- GDD coverage: advances Section 6 advanced authoring with rectangle selection. Selected-piece transforms and templates remain open.
- Followups: selected track transforms and track templates remain in `docs/FOLLOWUPS.md`.

## 2026-04-29, Advanced Track Authoring Plan

- Branch: `docs/plan-advanced-track-authoring`
- PR: #42
- Changed: chose rectangle selection, selected-piece transforms, and reusable templates as the next advanced authoring workflow; updated the GDD, followups, and coverage ledger to describe the implementation sequence without committing local Dot state.
- Verification: dash checks, `git diff --check`, JSON parse for `docs/GDD_COVERAGE.json`, and `npm run type-check`.
- Assumptions: elevation ramps remain outside the current planar vehicle scope, so authoring improvements should first build on the existing grid and piece model.
- GDD coverage: keeps Section 6 advanced authoring open, with public followups split into PR-sized implementation slices.
- Followups: rectangle selection, selected track transforms, and track templates.

## 2026-04-29, Quaternion Heading Evaluation

- Branch: `docs/evaluate-quaternion-heading`
- PR: #41
- Changed: evaluated vehicle quaternion heading against the current planar arcade model, kept scalar yaw as the explicit vehicle heading design, and updated the GDD plus coverage ledger to close the stale Section 5 gap.
- Verification: dash checks, `git diff --check`, JSON parse for `docs/GDD_COVERAGE.json`, and `npm run type-check`.
- Assumptions: vehicle pitch, roll, and elevation dynamics are not part of the current planned scope, while camera orientation already uses quaternion slerp where 3D orientation smoothing matters.
- GDD coverage: completes Section 5 vehicle state for the current planar model.
- Followups: none recorded.

## 2026-04-29, Forza-lite Gamepad Rumble (Xbox 360 dual rumble)

- Branch: `claude/add-haptic-feedback-xbox-01QX1`
- PR: #34
- Changed: extended the existing haptics module with Gamepad API rumble (`vibrationActuator.playEffect('dual-rumble', ...)`, with a legacy `hapticActuators[0].pulse` fallback), added a per-frame continuous mapper (`src/lib/gamepadRumble.ts`) that drives engine purr / off-track chassis bias on the strong motor and slip / brake-lock on the weak motor, wired the per-frame loop in `RaceCanvas.tsx` plus impulse outcomes (`lap`, `pb`, `record`, `offTrack`) from `Game.tsx`, exposed the active pad as a ref from `useGamepad`, and split the Settings haptics control into two pickers (Touch haptics + Gamepad rumble) with backfill defaults for legacy stored payloads.
- Verification: dash checks, `git diff --check`, JSON parse for `docs/GDD_COVERAGE.json`, `npm run test -- haptics gamepadRumble controlSettings gamepadInput`, `npm test`, `npm run type-check`, `npm run build`, `npm run lint` (only pre-existing TouchControls warning remained).
- Assumptions: Xbox 360 controllers expose `vibrationActuator` in modern Chromium and `hapticActuators` on legacy WebKit / Firefox builds, so the dual-path defensive helpers cover both. The `RUMBLE_EPSILON = 0.02` dedupe is small enough that a smoothly-changing speed ramp still feels continuous on the motor without flooding `playEffect` 60x/sec at steady state.
- GDD coverage: advances Section 13 (Audio / haptics) with the new gamepad rumble row alongside the existing Vibration API path.
- Followups: collision-magnitude impulses (require collision events from the physics integrator), wrong-way and achievement-unlock outcomes, per-channel intensity slider, and trigger rumble for Xbox One / Series controllers (`trigger-rumble` effect, not 360).

## 2026-04-29, Leaderboard Admin Tooling

- Branch: `feature/leaderboard-admin-tooling`
- PR: #40
- Changed: added a token-gated leaderboard admin API with preview and exact-member revoke actions, explicit confirmation text, required reason capture, side-key cleanup, conditional top-replay pointer clearing, and an audit log entry.
- Verification: dash checks, `git diff --check`, JSON parse for `docs/GDD_COVERAGE.json`, `npm run type-check`, focused Vitest coverage for admin leaderboard and leaderboard reads, focused Playwright admin-gate smoke, `npm test`, `npm run build`, and full Playwright smoke.
- Assumptions: admin moderation should be API-first and disabled unless `LEADERBOARD_ADMIN_TOKEN` is configured, avoiding any public UI or accidental live KV mutation path.
- GDD coverage: completes Section 11 leaderboard admin tooling.
- Followups: none recorded.

## 2026-04-29, Leaderboard Run Metadata Details

- Branch: `feature/leaderboard-run-metadata`
- PR: #39
- Changed: made leaderboard rows open an accessible lap details panel with rank, input device, date, setup diffs, Copy JSON, and Try this setup, while keeping Chase as a separate row action.
- Verification: dash checks, `git diff --check`, JSON parse for `docs/GDD_COVERAGE.json`, `npm run type-check`, focused Vitest coverage for tuning labels and leaderboard metadata APIs, focused Playwright row-details smoke, `npm test`, `npm run build`, and full Playwright smoke.
- Assumptions: the existing per-lap metadata side key is the right source of truth, so this slice improves surfacing and accessibility rather than changing the leaderboard storage model.
- GDD coverage: advances Section 11 leaderboard metadata and tuning visibility. Admin tooling remains tracked separately.
- Followups: none recorded.

## 2026-04-29, Background Audio Pause

- Branch: `fix/background-audio-pause`
- PR: #38
- Changed: suspended the shared Web Audio context while the page is hidden and resumed it through the existing autoplay-safe path when visible again.
- Verification: dash checks, `git diff --check`, JSON parse for `docs/GDD_COVERAGE.json`, `npm run type-check`, focused Vitest coverage for audio visibility behavior and music helpers, `npm test`, `npm run build`, and full Playwright smoke.
- Assumptions: suspending the single shared `AudioContext` is the lowest-risk fix because music and SFX already route through the same engine.
- GDD coverage: advances Section 13 audio behavior and records background-tab audio suspension in the coverage ledger.
- Followups: none recorded.

## 2026-04-29, Per-Wheel Track Contact

- Branch: `feature/per-wheel-track-contact`
- PR: #37
- Changed: added custom math-based wheel contact sampling and routed `tick()` off-track handling through all four wheel contacts instead of only the car center.
- Verification: dash checks, `git diff --check`, JSON parse for `docs/GDD_COVERAGE.json`, `npm run type-check`, focused Vitest coverage for wheel contact, tick, physics, and track path geometry, `npm test`, `npm run build`, and full Playwright smoke.
- Assumptions: per-wheel contact should use the existing analytic centerline distance helpers instead of Three.js mesh raycasts, preserving the custom physics constraint while matching the GDD behavior.
- GDD coverage: advances Section 5 vehicle adhesion. Quaternion heading remains tracked separately.
- Followups: none recorded.

## 2026-04-29, Angular Velocity Handling

- Branch: `feature/angular-velocity-handling`
- PR: #36
- Changed: added angular velocity to vehicle and game state so steering eases into and out of yaw-rate changes instead of snapping heading directly each tick.
- Verification: dash checks, `git diff --check`, JSON parse for `docs/GDD_COVERAGE.json`, `npm run type-check`, focused Vitest coverage for physics, tick, tuning settings, and the tuning lab track, `npm test`, `npm run build`, and full Playwright smoke.
- Assumptions: angular velocity should remain internal physics state for this slice, preserving the existing tuning schema, replay shape, and anti-cheat payloads.
- GDD coverage: advances Section 5 vehicle state. Quaternion heading and per-wheel raycast remain tracked as separate gaps.
- Followups: created `VibeRacer-evaluate-quaternion-heading-0c71504b` for the remaining quaternion-heading decision.

## 2026-04-29, Editor Decoration Placement

- Branch: `feature/editor-decoration-placement`
- PR: #35
- Changed: added optional per-track decorations on empty editor cells, biome-adaptive decoration palettes, API save/load support, low-poly prop rendering through the scenery layer, and editor smoke coverage.
- Verification: dash checks, `git diff --check`, `npm run type-check`, focused Vitest coverage for decorations, schemas, track API, and scenery, focused Playwright editor decoration smoke, `npm test`, `npm run build`, and full Playwright smoke.
- Assumptions: decorations are visual metadata like biome, so they do not affect physics, lap validity, anti-cheat, version hashes, or leaderboard splits.
- GDD coverage: advances Section 6 track authoring and visual identity.
- Followups: none recorded.

## 2026-04-29, HUD Mirror And Bottom Lane Spacing

- Branch: `fix/hud-mirror-speed-overlap`
- PR: #30
- Changed: kept the rear-view mirror in a fixed top-center band, moved top-center alerts below that band, stacked compact bottom readouts above the speedometer, and added a mobile smoke check for mirror, speedometer, and session-strip overlap.
- Verification: dash checks, `git diff --check`, `npm run type-check`, `npm test`, `npm run build`, focused Playwright HUD lane smoke, and full Playwright smoke.
- Assumptions: compact HUD spacing should prefer stable vertical lanes over squeezing more status text near the speedometer.
- GDD coverage: refines Sections 8 and 9 HUD readability without changing race rules or data.
- Followups: none recorded.

## 2026-04-29, Settings Tab Scroll Containment

- Branch: `fix/settings-tab-scroll`
- PR: #29
- Changed: rendered shared menu overlays through a document-body portal so fixed positioning is viewport-relative, corrected modal box sizing, and made Settings tab panels own their own scroll area while the header and tabs stay in view.
- Verification: dash checks, `git diff --check`, `npm run type-check`, `npm test`, focused Playwright settings smoke, full Playwright smoke, `npm run build`, and browser screenshot at `test-results/settings-vehicle-after.png`.
- Assumptions: moving `MenuOverlay` to a portal is the simplest consistent fix for both title Settings and in-race pause Settings because both use the same menu component.
- GDD coverage: refines Section 9 menu usability without changing game rules or data.
- Followups: none recorded.

## 2026-04-29, Track Biome Selection

- Branch: `feature/track-biomes`
- PR: #28
- Changed: added optional per-track biomes for Snow, Desert, Beach, Mountains, and City; wired editor save/load support; and applied biome styling to sky tint, terrain, asphalt, and roadside scenery.
- Verification: dash checks, `git diff --check`, JSON parse for `docs/GDD_COVERAGE.json`, `npm run type-check`, focused Vitest coverage for biome presets, schemas, API track persistence, and scenery styling, `npm test`, `npm run build`, `npm run test:e2e -- tests/e2e/smoke.spec.ts`, and Playwright editor screenshot at `test-results/biome-editor.png`.
- Assumptions: biome is visual metadata like track mood, so it does not affect physics, lap validity, anti-cheat, version hashes, or leaderboard splits. Leaving biome unset preserves the classic forest look.
- GDD coverage: advances Section 6 track authoring and visual identity.
- Followups: none recorded.

## 2026-04-29, Visual Checkpoint Placement

- Branch: `feature/visual-checkpoints`
- PR: #27
- Changed: added optional custom checkpoint cells to track versions, ordered them by loop path, rendered checkpoint flags on the 3D track and minimap, and added a Checkpoint editor tool with a 3-checkpoint minimum once custom placement begins.
- Verification: dash checks, `git diff --check`, JSON parse for `docs/GDD_COVERAGE.json`, `npm run type-check`, focused Vitest coverage for schemas, hashing, path ordering, tick progression, API persistence, and minimap shape, `npm test`, `npm run build`, `npm run test:e2e -- tests/e2e/smoke.spec.ts`, and Playwright screenshots at `test-results/checkpoints-editor.png` and `test-results/checkpoints-race.png`.
- Assumptions: custom checkpoints are stored as unordered cells and sorted by path order at runtime so authors choose locations without managing fragile checkpoint ids; the finish line remains the final lap-completing trigger.
- GDD coverage: advances Sections 6 and 8 for visual checkpoints and editor placement.
- Followups: none recorded.

## 2026-04-29, Track Editor Mobile Actions

- Branch: `fix/editor-undo-redo-floating`
- PR: #26
- Changed: moved track editor Undo and Redo out of the bottom action bar into a floating canvas toolbar, and allowed the remaining footer actions to wrap cleanly on mobile widths.
- Verification: dash checks, `git diff --check`, JSON parse for `docs/GDD_COVERAGE.json`, `npm test -- tests/unit/editorHistory.test.ts tests/unit/editorZoom.test.ts`, `npm run type-check`, `npm test`, `npm run build`, `npm run test:e2e -- tests/e2e/smoke.spec.ts`, and a mobile Playwright screenshot at `test-results/editor-mobile.png`.
- Assumptions: keeping edit history controls visible over the canvas is preferable to hiding footer actions behind a menu because undo and redo are high-frequency authoring actions.
- GDD coverage: refines Section 6 editor usability without changing track data or race rules.
- Followups: none recorded.

## 2026-04-29, In-Race HUD Declutter

- Branch: `feature/hud-declutter`
- PR: #25
- Changed: reorganized the race HUD into deterministic zones, moved the minimap to the top-right race cluster, capped transient feedback to a two-slot notification stack, and moved ghost / challenge / rival status into a bottom-center live band.
- Verification: dash checks, `git diff --check`, JSON parse for `docs/GDD_COVERAGE.json`, `npm test -- tests/unit/hudNotifications.test.ts`, `npm test`, `npm run type-check`, `npm run build`, `npm run test:e2e -- tests/e2e/smoke.spec.ts`, and desktop / mobile Playwright screenshots at `test-results/hud-desktop.png` and `test-results/hud-mobile.png`.
- Assumptions: the HUD can omit a POS chip for now because VibeRacer does not have live multi-car race position data; LAP and RACER remain in the top-right cluster beside the minimap.
- GDD coverage: refines Sections 8 and 9 HUD readability without changing race rules.
- Followups: none recorded.

## 2026-04-29, Real Headlight Sources

- Branch: `feature/real-headlight-sources`
- PR: #24
- Changed: replaced visible translucent headlight cones with car-mounted Three.js SpotLight sources and scene-lit lens meshes so headlights illuminate nearby road and scenery.
- Verification: dash checks, `git diff --check`, JSON parse for `docs/GDD_COVERAGE.json`, `npm test -- tests/unit/headlights.test.ts`, `npm run type-check`, `npm test`, `npm run build`, and `npm run test:e2e -- tests/e2e/smoke.spec.ts`.
- Assumptions: headlight lighting remains visual only and keeps the existing Off / Auto / On player setting; shadows are not enabled in this slice to avoid an avoidable rendering cost.
- GDD coverage: refines Section 5 headlights from cosmetic beam meshes to actual scene light sources.
- Followups: none recorded.

## 2026-04-29, Roof Number Sticker

- Branch: `fix/roof-number-sticker`
- PR: #23
- Changed: made the roof racing number smaller, lower, and scene-lit with polygon offset so it reads as a car sticker instead of a floating UI panel.
- Verification: dash checks, `git diff --check`, `npm test -- tests/unit/cameraRig.test.ts`, `npm run type-check`, `npm test`, `npm run build`, and `npm run test:e2e -- tests/e2e/smoke.spec.ts`.
- Assumptions: keeping the existing roof-plane approach is the smallest stable fix; a true GLB decal or baked texture can remain a future visual polish path if needed.
- GDD coverage: refines the shipped racing-number cosmetic behavior in Section 5.
- Followups: none recorded.

## 2026-04-29, Stale Garage Task Closure

- Branch: `fix/garage-next-race-layout`
- PR: #21
- Changed: closed the Garage overlap Dot as not applicable because this repo has no Garage screen, World Tour route, or matching copy to patch.
- Verification: `rg` searches for Garage, World Tour, Next race, and the reported copy; dash checks, `git diff --check`, and `npm run type-check`.
- Assumptions: the Dot came from a future or different surface that is not present in the current VibeRacer codebase.
- GDD coverage: no product behavior changed.
- Followups: none recorded.

## 2026-04-29, Close Ghost Nameplate Fade

- Branch: `fix/ghost-name-bubble-close`
- PR: #20
- Changed: made the floating ghost nameplate fade out as the ghost gets close to the player, preventing the label from covering the player's car in chase cameras.
- Verification: dash checks, `git diff --check`, `npm test -- tests/unit/ghostNameplate.test.ts`, `npm run type-check`, `npm test`, `npm run build`, and `npm run test:e2e -- tests/e2e/smoke.spec.ts`.
- Assumptions: distance-based fading preserves the existing Show nameplate setting while solving the close-ghost obstruction without adding another player-facing option.
- GDD coverage: no new GDD requirement; this refines the shipped ghost nameplate behavior in Section 11.
- Followups: none recorded.

## 2026-04-29, Sweep Turn Track Pieces

- Branch: `feature/wide-sweep-turn-piece`
- PR: #19
- Changed: added sweep-right and sweep-left track pieces with sampled centerlines, editor palette glyphs, renderer/path support, difficulty scoring, pace-note labels, and focused tests.
- Verification: dash checks, `git diff --check`, JSON parse for `docs/GDD_COVERAGE.json`, `npm run type-check`, `npm test`, `npm run build`, and `npm run test:e2e -- tests/e2e/smoke.spec.ts`.
- Assumptions: the GDD's wider sweep turn maps to single-cell smooth 90-degree pieces that share connectors with the existing sharp turns, keeping URL track serialization and the editor grid model stable.
- GDD coverage: Section 6 additional track pieces gap is implemented with sweep turns; advanced authoring tools remain open.
- Followups: elevation ramp remains documented as not yet landed.

## 2026-04-29, Leaderboard Pagination

- Branch: `feature/leaderboard-pagination-v2`
- PR: #18
- Changed: added offset-based leaderboard pagination to the API, absolute rank preservation beyond the first page, page metadata, and Prev / Next controls in the paused leaderboard UI.
- Verification: dash checks, `git diff --check`, `npm run type-check`, `npm test`, `npm run build`, and `npm run test:e2e -- tests/e2e/smoke.spec.ts`.
- Assumptions: page sorting remains client-side within the currently loaded page, while server rank remains absolute across the full per-version board.
- GDD coverage: Section 11 pagination beyond top 100 is implemented; admin tooling remains the only recorded leaderboard gap.
- Followups: none recorded.

## 2026-04-29, Optional Per-Track Shifting

- Branch: `feature/optional-track-shifting`
- PR: #16
- Changed: added per-track automatic/manual transmission, Q/E shift bindings, gamepad and touch shift inputs, gear-aware physics, a manual gear HUD chip, editor save/load support, and version hashes that separate manual layouts from automatic layouts.
- Verification: dash checks, `git diff --check`, `npm run type-check`, focused Vitest coverage for transmission, hash, tick, gamepad, controls, how-to-play, and track API.
- Assumptions: manual shifting changes gameplay enough to require its own version hash and leaderboard.
- GDD coverage: Section 4 Q/E shifter keys and manual gearing gaps are implemented; Section 5 records the manual gearing model as implemented.
- Followups: none recorded.

## 2026-04-29, Coverage Gap Backlog Split

- Branch: `docs/split-coverage-gaps`
- PR: #15
- Changed: converted remaining GDD coverage gaps into Dots and linked the created Dots from `docs/GDD_COVERAGE.json`.
- Verification: dash checks, `git diff --check`, JSON parse for `docs/GDD_COVERAGE.json`, `npm run type-check`.
- Assumptions: the Q/E shifter item should clarify whether manual gearing is still a stretch before implementation.
- GDD coverage: no product behavior changed. Coverage ledger now points to backlog IDs for open gaps.
- Followups: medium-priority followup for splitting coverage gaps is complete.

## 2026-04-29, Autonomous PR Loop Docs

- Branch: `docs/autonomous-pr-loop`
- PR: #14
- Changed: added the continuous PR loop to `AGENTS.md`, documented the continuity docs in `README.md`, created the implementation plan, working agreement, progress log, open questions, followups, and GDD coverage ledger.
- Verification: dash checks, `git diff --check`, `npm run type-check`.
- Assumptions: documentation-only workflow changes do not require Vitest, Playwright, or production build.
- GDD coverage: no product behavior changed.
- Followups: use the new loop for the next implementation slice.

## 2026-04-29, GDD Status Cleanup

- Branch: `docs/update-gdd-status`
- PR: #13
- Changed: refreshed stale GDD status text for shipped camera, settings, routing, track editor, leaderboard, setup, and pause-menu organization.
- Verification: dash checks, `git diff --check`, `npm run type-check`, `npm test`, `npm run build`, preview deploy green, production HTTP 200 after merge.
- Assumptions: docs-only changes did not need Playwright.
- GDD coverage: corrected status wording only.
- Followups: none.

## Archived Dot Snapshot Before PR #13

These older archived Dots were present in local `.dots/archive` but did not have full standalone entries in this progress log. They are summarized here so future agents do not need to inspect local task files for baseline continuity.

- Identity settings: added inline initials editing to `SettingsPane`, extracted initials storage helpers, broadcast an initials update event for HUD refresh, and verified with focused unit tests, build, and Playwright.
- Gamepad controls: added Standard Gamepad input, analog trigger support, Start pause handling, Settings detection, leaderboard input-device badge plumbing, GDD notes, and unit coverage.
- Sortable leaderboard columns: added rank / racer / time / date sorting through a pure `sortLeaderboardEntries` helper and `SortHeader` buttons.
- Lap consistency: added the lap consistency feature wiring, HUD chip, session summary tile, summary stats integration, and tests.
- Snowy weather: added a Snowy preset, deterministic falling snow particle helpers, scene-builder wiring, weather settings, GDD coverage, and focused snow / weather tests.
- Manual gearing setup: optional per-track shifting in PR #16 also closed the archived Q/E shifter key and manual gearing model Dots.
- Non-applicable cleanup: archived Garage / World Tour overlap and stray rename Dots were closed as not applicable to this repo.
