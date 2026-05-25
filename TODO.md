# VibeRacer Stub-Replacement Roadmap

Multi-PR plan to replace every stub, placeholder, or "for now" implementation in the codebase with a real version. Each slice is one branch and one PR. Ordered by impact: correctness fixes first, then high-visibility polish, then per-mode polish.

Triggered by user discovering that World Tour race results were computed from random offsets in `synthesizeFinalState` instead of actual AI driving. An audit turned up 15 stubs across Tour, Derby, Drag, and Destruction Lab.

## Shared rules every slice must follow

- No em or en dashes anywhere (AGENTS.md RULE 1).
- No new dependencies (RULE 3): raw three.js, custom math physics, zod, Vitest, Playwright, Upstash KV.
- Reuse shared primitives (RULE 11): `stepPhysics`, `tickAi`, `worldTourRaceSession`, `mulberry32`, `buildRail`, `buildTrackPath`, `getTrackTemplate`, `MenuPageShell`, `menuStyles`, `MOBILE_GAME_SURFACE_STYLES`, `useKeyboard`, `readPlayerInput`, `useClickSfx`.
- Pure step reducers return new state (RULE 12).
- Verify in a browser per RULE 13 before declaring a slice done.

## Status

### Shipped (PR branches, awaiting merge)

- **Slice 1 (A + B): real race session + curvature-aware AI track view** [`claude/world-tour-real-ai-sim`]
  Replaces `synthesizeFinalState` with the actual `worldTourRaceSession` ticking through `tickAi`, fed by a real curvature-aware `AiTrackView` built from the rail. Adds `src/game/worldTourTrackView.ts`. Fixes a convention inconsistency in the session integrator, the `countdownSeconds: 0` fallback bug, the closing-segment gap in `sampleRailAt`, and the follow-distance deadlock at race-go. Includes a regression test that a stationary player no longer mysteriously wins.

- **Slice 2 (C): per-tour track templates** [`claude/world-tour-per-track-templates`]
  Adds `src/game/worldTourTrackManifest.ts` mapping every championship `trackId` to a `TRACK_TEMPLATES` entry, cycling through the five authored templates so the four races inside a tour have distinct shapes. Tour route resolves pieces via `trackTemplateFor(trackId)` instead of a hard-coded id.

### Remaining (13 slices)

Suggested execution order keeps merge conflicts minimal:

1. Slice 3 (D) AI archetypes -- needs Slice 1 in main first (shared file)
2. Slice 4 (E) Career KV mirror -- independent
3. Slice 5 (F) Derby authored GLBs -- independent
4. Slice 6 (G) Derby AI difficulty -- independent of 5
5. Slice 7 (H) Derby dent decals -- needs 5 in main (shared file)
6. Slice 8 (I) Derby smoke + fire particles -- needs 7 in main (shared file)
7. Slice 9 (J) Derby leaderboard pagination + initials -- independent
8. Slice 10 (N) Drag real road ribbon -- independent
9. Slice 11 (O) Drag staggered amber tree -- independent of 10
10. Slice 12 (P) Drag ghost loadout nameplate -- independent of 10, 11
11. Slice 13 (K) Destruction Lab persistence -- independent
12. Slice 14 (L) Destruction Lab morph-target damage -- needs assets (shape keys on car.glb)
13. Slice 15 (M) Destruction Lab LOD damage swap -- needs a baked-low-res mesh

---

## Slice 3 (D): AI archetypes

### Problem
`src/game/worldTourAi.ts:5` documents "one archetype today (`clean_line`); per-archetype variation is a known followup." All 11 AI drivers run identical tunings.

### Files
- `src/game/worldTourAi.ts` (rebuild `AI_TUNING` into a record keyed by archetype)
- `src/game/worldTourRaceSession.ts` (persist archetype on `aiState` at create time)
- `src/lib/worldTourChampionship.ts` (`AiDriver` gains optional `archetype` field)
- `src/data/worldTourChampionship.ts` (assign archetypes per driver)

### Approach
`type AiArchetype = 'clean_line' | 'aggressive' | 'defensive'` and `AI_TUNING_BY_ARCHETYPE: Record<AiArchetype, typeof AI_TUNING>`. `aggressive` raises `MAX_RACING_LINE_OFFSET`, drops `CLEAN_LINE_CURVE_DECEL`, tightens `FOLLOW_DISTANCE_METERS`. `defensive` widens follow distance and raises curve-decel. `tickAi` reads the tuning record by `state.archetype ?? 'clean_line'`. `createRaceSession` writes the archetype from `GridDriver` onto `aiState.archetype` at create time. Default `'clean_line'` preserves byte-identical replay.

### Tests
- Vitest: `aggressive` produces a higher steer magnitude than `clean_line` for the same `lateralError`; `defensive` brakes earlier on a unit-curve corner.
- Vitest: seeded archetype assignment is deterministic.
- Playwright: a tour with mixed archetypes finishes successfully.
- Browser smoke: watch aggressive AI rear-end while defensive AI brakes early at T1.

### Size
Medium.

### Dependencies
Slice 1 must be in main (it overhauls `worldTourAi.ts` and the session); otherwise this slice merges immediately into a conflict.

---

## Slice 4 (E): World Tour career KV mirror

### Problem
`src/lib/worldTourCareerStorage.ts:11` flags KV mirror as a known followup. Career save is `localStorage`-only; no cross-device resume.

### Files
- `src/lib/worldTourCareerStorage.ts` (fire a best-effort mirror call on every write)
- New route `src/app/api/world-tour-career/route.ts` (GET + POST handlers)
- New module `src/lib/worldTourCareerKv.ts` (KV read/write keyed by initials, zod-validated)
- `src/lib/schemas.ts` (export `WorldTourCareerSchema`)

### Approach
Mirror the leaderboard pattern (`src/lib/derbyLeaderboard.ts` + `src/app/api/...`). Key is `worldTour:career:<initials>` from `readStoredInitials()`; payload is the serialized `WorldTourCareer` validated through `migrateCareer`. `writeCareer` fires `fetch('/api/world-tour-career', { method: 'POST' })` without awaiting (best effort; `localStorage` is still the source of truth). Add a small `pullCareerFromKv()` helper invoked once on home-page mount when local storage is at defaults but initials exist.

### Tests
- Vitest: `tests/unit/api.worldTourCareer.test.ts` with `_fakeKv.ts` covers POST writes, GET reads, malformed payload rejection, rate limiting.
- Vitest: extend `worldTourCareerStorage.test.ts` to assert `writeCareer` schedules a fetch (mocked).
- Playwright: post a career via API, read it back.
- Browser smoke: enter initials, race, clear localStorage, refresh, career restores from KV.

### Size
Medium.

### Dependencies
None.

---

## Slice 5 (F): Derby authored GLBs, kill silent procedural fallback

### Problem
`src/game/derbyVehicleLoader.ts:17, 39, 231, 253` silently falls back to procedural box geometry on GLB failure. Authored Kenney GLBs are in `public/models/derby/` but a load error is invisible.

### Files
- `src/game/derbyVehicleLoader.ts` (real `loadGlbAsset` path; typed error on contract failure)
- `src/lib/derbyVehicles.ts` (each config points at its authored GLB)

### Approach
Use the already-imported `GLTFLoader`. On load, run `assertVehicleContract` against `getObjectByName` for every required submesh. On contract failure, throw a typed error so the loader cannot silently fall back; procedural fallback only behind an explicit env flag (so a regression in shipped assets fails loudly in CI / preview).

### Tests
- Vitest: extend `tests/unit/derbyVehicleLoader.test.ts` with passing + failing fixture stubs.
- Playwright: extend `derby.spec.ts` to confirm an authored model loads with a non-procedural material tag.
- Browser smoke: enter Derby, vehicles render as authored models.

### Size
Medium.

### Dependencies
None.

---

## Slice 6 (G): Derby AI difficulty enum

### Problem
`docs/FOLLOWUPS.md:31`. Derby AI is single-difficulty seek-then-ram with no track-circling tactic.

### Files
- `src/game/derbyAi.ts` (tunings keyed by difficulty)
- `src/lib/schemas.ts` (`DerbyDifficulty` enum)
- `src/app/derby/...` start route (chip-row picker)
- `src/game/derbyTick.ts` (pass difficulty into `stepAi`)

### Approach
`type DerbyDifficulty = 'rookie' | 'pro' | 'havoc'` and `DERBY_TUNING_BY_DIFFICULTY` mirroring the Slice 3 archetype pattern. Vary `RAM_RADIUS`, `APPROACH_RADIUS`, `VELOCITY_LEAD_SECONDS`, `RECOVER_DURATION_MS`. Persist last-used to localStorage.

### Tests
- Vitest: `havoc` rams at greater distance than `rookie`.
- Playwright: switch the chip and start a round.
- Browser smoke: race rookie vs havoc; havoc aggressively pursues.

### Size
Small.

### Dependencies
None.

---

## Slice 7 (H): Derby dent decals

### Problem
`docs/FOLLOWUPS.md:32`. Damage shows only paint darkening; no decal sprites for impact marks.

### Files
- `src/game/derbyDamageVisuals.ts` (spawn decals on hit)
- New `src/game/derbyDentDecals.ts` (sprite pool, procedural alpha texture)

### Approach
Generate decal alpha at load time via a canvas radial gradient (RULE 3 forbids new deps). Maintain a `Sprite` pool parented to the body; reposition on collision events emitted by `derbyTick`. Each decal scales by impulse magnitude and fades over time. Mirror the `destruction/decals.ts` procedural-canvas pattern.

### Tests
- Vitest: `tests/unit/derbyDentDecals.test.ts` verifies pool reuse and fade.
- Playwright: first contact in `derby.spec.ts` adds `Sprite` children to the body group.
- Browser smoke: ram an opponent, dent appears.

### Size
Small.

### Dependencies
Slice 5 in main (shared file `derbyDamageVisuals.ts`).

---

## Slice 8 (I): Derby smoke and fire particles

### Problem
`docs/FOLLOWUPS.md:33`. Smoke and fire markers are translucent boxes.

### Files
- New `src/game/derbyDamageParticles.ts`
- `src/game/derbyDamageVisuals.ts` (swap box markers for emitter)

### Approach
`Points`-based emitter with procedural radial-gradient `CanvasTexture` for smoke (gray) and fire (orange-to-yellow). Per-instance lifetime ramp via a packed `BufferAttribute('aBirth', ...)` and a `ShaderMaterial` that scales size and alpha from `(uTime - aBirth)`. Driven by the existing damage-visuals slot anchors at hood and trunk.

### Tests
- Vitest: emitter math (lifetime mapping, ring buffer reuse).
- Playwright: fully damaged car has a `Points` object child where the box used to be.
- Browser smoke: drive an AI to full damage; smoke plume appears.

### Size
Medium.

### Dependencies
Slice 7 in main (shared file `derbyDamageVisuals.ts`).

---

## Slice 9 (J): Derby leaderboard pagination + post-round initials editor

### Problem
`docs/FOLLOWUPS.md:35`. Single page of 50, default `'YOU'` initials, no post-round edit.

### Files
- `src/lib/derbyLeaderboard.ts` (expose cursor in `readDerbyLeaderboard`)
- `src/app/derby/results/...` (Next/Prev controls + initials editor)
- New `src/components/InitialsEditor.tsx` (reuses existing prompt patterns)
- `src/lib/initials.ts` (writer)

### Approach
Two parts. Pagination: add `cursor` to `readDerbyLeaderboard`, render Next/Prev. Initials editor: after a round, if stored initials equals the default, surface a 3-character input that writes via `writeStoredInitials` and resubmits the entry under the corrected initials. Reuse `MenuPageShell` and `menuStyles`.

### Tests
- Vitest: `api.derbyLeaderboard.test.ts` covers cursor.
- Playwright: type initials, leaderboard row updates.
- Browser smoke: race, edit initials, see the row reflect the change.

### Size
Medium.

### Dependencies
None.

---

## Slice 10 (N): Drag real road ribbon

### Problem
`docs/PROGRESS_LOG.md:98-101`. Drag strip uses a flat road; only the car's `y` / pitch follows the slope profile.

### Files
- `src/components/DragRace.tsx` (build a profiled ribbon)
- `src/game/sceneBuilder.ts` (extend `profiledTrackSurfaceGeometry` if it does not already accept an arbitrary path)

### Approach
`profiledTrackSurfaceGeometry` already exists. Sample a `TrackPath` along the drag length and pass through `bakeProfileIntoPath` so each sample's `y` reads from `heightAt(profile, s)`. Replace the flat-plane geometry call with the profiled path. Car physics is already slope-aware so no integrator change.

### Tests
- Vitest: extend `sceneBuilderProfile.test.ts` to assert non-flat `y` on a steep strip.
- Playwright: extend `drag.spec.ts` to assert canvas renders without z-fighting.
- Browser smoke: drag down a hilly strip; the road visibly rises.

### Size
Medium.

### Dependencies
None.

---

## Slice 11 (O): Drag staggered amber Christmas tree

### Problem
`docs/PROGRESS_LOG.md:101`. Countdown is a single-bulb start light.

### Files
- `src/components/DragRace.tsx` (countdown component)
- `src/game/dragTick.ts` (countdown state machine)

### Approach
Replace the single light with a vertical stack: 3 ambers then green at a fixed `AMBER_INTERVAL_MS = 500` cadence. Existing `fouledFlag` triggers if the player throttles before green. Rendered as positioned divs in the HUD layer (already absolutely positioned). Reuse `useClickSfx` for the per-bulb click.

### Tests
- Vitest: extend `dragTick.test.ts` for the new phase enum and timing.
- Playwright: 3 ambers appear in sequence.
- Browser smoke: visible cadence.

### Size
Small.

### Dependencies
None.

---

## Slice 12 (P): Drag ghost loadout nameplate

### Problem
`docs/PROGRESS_LOG.md:101`. Ghost car shows the driver's initials but no parts loadout.

### Files
- `src/game/ghostNameplate.ts` (extend the plate with loadout fields)
- `src/lib/dragGhost.ts` (load loadout meta when a ghost is selected)
- `src/components/DragRace.tsx` (pass loadout into the nameplate builder)

### Approach
Extend `buildGhostNameplate` to render a second canvas line below the initials with a compact `"V8 / Drag Slicks / 5-Speed"` summary, sourced from the existing `dragSubmit` schema (already carries the loadout per `PROGRESS_LOG.md:97`).

### Tests
- Vitest: extend `tests/unit/ghostNameplate.test.ts` to assert the loadout line renders.
- Playwright: extend `drag.spec.ts` to verify the plate text contains a loadout token.
- Browser smoke: pick a ghost; loadout shows under the name.

### Size
Small.

### Dependencies
None.

---

## Slice 13 (K): Destruction Lab persistence

### Problem
`docs/FOLLOWUPS.md:26`. Lab resets on navigation.

### Files
- `src/game/destruction/panels.ts` and `freeBody.ts` (gain `serialize` / `hydrate`)
- New `src/lib/destructionLabStorage.ts` (localStorage round-trip with a zod schema)
- `src/app/destruction-lab/page.tsx` (hydrate on mount, persist debounced)

### Approach
`LabSavePayload = { panelHp: Record<PanelId, number>, freeBodies: SerializedBody[] }` with a zod schema. Debounced persist (300 ms). Hydrate on mount; fall back to fresh state on schema mismatch. Reuse the localStorage key namespace pattern from `worldTourCareerStorage.ts`.

### Tests
- Vitest: `tests/unit/destructionLabStorage.test.ts` round-trips a payload, rejects junk.
- Playwright: extend `destruction.spec.ts` to deform a panel, reload, deformation persists.
- Browser smoke: dent a car, refresh, dent persists.

### Size
Small.

### Dependencies
None.

---

## Slice 14 (L): Destruction Lab morph-target damage

### Problem
`docs/FOLLOWUPS.md:19`. Only CPU vertex dents; no authored crumple states.

### Files
- `src/game/destruction/panels.ts` (`PanelState.morphInfluence`)
- `src/game/destruction/deform.ts` (lerp morph weights on threshold crossings)
- Asset audit: `public/models/car.glb` must ship shape keys `light_crumple`, `hard_crumple`, `hinge_bend`

### Approach
When panel HP crosses 50%, ramp `light_crumple` weight 0 to 0.6 over 250 ms; at 20% blend to `hard_crumple`. Standard three.js morph target API; no GLTF extension needed. CPU deformer stays for free-form impact; morph adds the major-state silhouette change.

### Tests
- Vitest: deform tests assert morph weight transitions at the documented HP thresholds.
- Playwright: confirm `morphTargetInfluences[i] > 0` after enough damage.
- Browser smoke: hammer a panel; mid-damage shows the authored crumple.

### Size
Medium.

### Dependencies
Authored shape keys on `public/models/car.glb`. If they are absent, this slice blocks until a Blender pass adds them; document the asset gap in the PR description and ship the code path with a fallback that silently skips morph blending.

---

## Slice 15 (M): Destruction Lab LOD damage swap

### Problem
`docs/FOLLOWUPS.md:20`. One mesh at all distances; CPU dents run at every range.

### Files
- `src/game/destruction/car.ts` (introduce `LOD` group)
- `src/game/destruction/deform.ts` (skip CPU work past LOD index 1)

### Approach
Build a three.js `LOD` whose level 0 is the subdivided high-res panels and level 1 is a baked-low-res clone. Skip CPU vertex math when the high-res mesh is hidden. Approximate damage on the LOD mesh by darkening its material to match the average panel HP so silhouette degradation still reads at distance. Reuse the camera distance from `cardinalCamera.ts`.

### Tests
- Vitest: `tests/unit/destructionCar.test.ts` covers the LOD swap threshold.
- Playwright: car still draws at far zoom.
- Browser smoke: perf improves at distance.

### Size
Small.

### Dependencies
None for the code path. If a real baked-low-res GLB does not exist, ship a procedural fallback (decimated copy of the high-res mesh built at runtime) and document the asset gap.
