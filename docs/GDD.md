# VibeRacer: Game Design Document

> **Before editing:** read the repo root `AGENTS.md`. The em-dash ban applies to this file.

---

## Status (last updated 2026-04-19)

**Status key.** Each section below carries a `**Status.**` line. Sections that have shipped also include a `### Build log` subsection recording what landed, the key files, and any non-obvious decisions. This GDD is intended as a record of truth: when code lands, the relevant section is updated.

| § | Section | Status |
| - | - | - |
| 2 | Core game loop | partial (countdown, race, HUD, lap auto-submit, pause, restart, fresh-slug prompt, PB fanfare with centered HUD burst all work) |
| 3 | Camera and perspective | partial (trailing third-person rig with lerp; tunable sliders pending) |
| 4 | Controls | partial (keyboard WASD/arrows/space + Esc pause + dual-stick or single-stick touch + remappable keyboard bindings; gamepad pending) |
| 5 | Vehicle | partial (arcade integrator + off-track drag; Kenney model + raycast per wheel pending) |
| 6 | Track system | partial (default track renders in 3D; editor UI ships at `/[slug]/edit` with cycle-on-click placement, live validation, and save to `PUT /api/track/[slug]`) |
| 7 | Routing and user-owned paths | partial (middleware + `/[slug]` page + initials prompt + fresh-slug create-or-load + Settings pane on home and pause menu live, with inline initials editing in the Settings pane) |
| 8 | Race flow | partial (countdown with animated red/amber/green traffic light + synth beeps, per-track configurable checkpoint count, lap detection, invalid-lap reset, and the full HUD all live) |
| 9 | Title, menu, pause | partial (pause menu and title screen with Play / Load existing / Settings ship; Settings pane is now live for keyboard remap and dual / single touch mode) |
| 10 | Physics tuning (player Setup panel) | done (per-track sliders, last-loaded carryover, leaderboard-attached setups, Try-this-setup) |
| 11 | Leaderboards | partial (autosubmit, anti-cheat, leaderboard UI with version dropdown + race-this-version + sortable rank / racer / time / date columns, overall record in HUD, PB fanfare and record fanfare with a centered HUD burst all live; admin tooling and pagination beyond top 100 pending) |
| 12 | Feedback FAB | partial (API route + React component ship, pause-only visibility wired; deeper copy testing pending) |
| 13 | Audio | partial (music + countdown beeps + engine drone, tire skid, off-track rumble, lap stinger, PB / record fanfare, UI click variants, and a centered HUD burst on PB / record all ship; deeper SFX polish and SFX volume slider pending) |
| 14 | Data model | done |
| 15 | Tech stack | done (scaffold present) |
| 16 | Architecture | partial (game loop + Three.js scene + PauseMenu + FeedbackFab + track editor + music scheduler + touch controls + SFX layer landed; minor module follow-ups still open) |
| 17 | Deployment (manual setup) | done |
| 18 | Stretch and future | out of scope |

Infrastructure commit: `703f080` (Next.js + KV + anti-cheat + four API routes). Vertical slice commit: `194bf91` (`/[slug]` route drives a default 8-piece oval with countdown, physics, camera, HUD, and auto-submit). 128 Vitest unit tests and 8 Playwright smoke tests passing; production build green.

---

## 1. Vision & Pillars

**Pitch.** A cartoony 3D arcade racer where every URL is a playground. Visit a slug, race the track that lives there, submit a lap time, or fork it into a new version. Tracks are built from toy-like snap pieces. A streaming synth soundtrack plays throughout.

**Design pillars.**

1. **Instant fun.** Open a URL, be driving in seconds. No login walls, no lobbies.
2. **Your track, your URL.** Every path in the domain is someone's creation. Anyone can race or fork any track.
3. **Leaderboards that matter.** Per-version boards. Scores autosubmit. Best-effort anti-cheat keeps times honest.

---

## 2. Core Game Loop

**Status.** Partial. Countdown, race, HUD, per-lap auto-submit, pause (Esc + on-screen button), and restart are live at `/[slug]`. Track editing access, load-existing prompt, and PB celebration are not yet wired.

1. Player lands on `/<slug>`.
2. If a track exists at that slug, the latest version loads. If not, a prompt offers "create new track" or "load existing".
3. Countdown: 3, 2, 1, GO.
4. Player races. Crosses finish line. Lap time shown.
5. Lap auto-submits in the background.
6. Loop continues forever. Best lap stays on the HUD. Any new personal best triggers a small celebration.
7. Player can pause to view leaderboards, edit the track, change settings, or exit.

### Build log

- Orchestrator: `src/components/Game.tsx`. `Game` handles initials lifecycle; `GameSession` owns the Three.js canvas, tick loop, phase state (`countdown` | `racing`), and HUD state.
- Tick: `src/game/tick.ts` is a pure `(state, input, dtMs, nowMs, path, params?) => { state, lapComplete | null }`. Physics is frozen until `startRace()` sets `raceStartMs`. Lap complete event fires when all checkpoints are hit in order and the car re-enters piece 0.
- Render loop: `requestAnimationFrame` drives tick + Three.js render every frame. HUD `setState` is throttled to ~20 Hz with a reference-equality bail-out so the HUD tree doesn't re-render when nothing visible changed.
- Tests: `tests/unit/tick.test.ts` covers init state, frozen physics before start, teleporting through all checkpoints to complete a lap, ignoring unexpected cells, and invalid-lap reset when the car re-enters the start piece mid-lap.
- Pause: `GameSession` owns `paused` state plus `pausedRef`, `pauseStartTsRef`, and `resumeShiftRef`. When paused, the RAF loop short-circuits before `tick()` runs. On resume, the accumulated pause duration is added to `state.raceStartMs` so the current lap timer resumes cleanly without a one-frame jump. Pause is only available during the `racing` phase (Esc is ignored during countdown).
- Restart: `restart()` sets `pendingResetRef.current = true`; the loop re-inits game state, camera rig, and renders one frame. Phase flips back to `countdown` so the READY-SET-GO sequence plays again. Tokens and session PB are cleared; all-time PB (persisted in `localStorage`) is preserved.
- Fresh-slug prompt: `src/app/[slug]/page.tsx` now differentiates "KV configured but no saved track for this slug" from "KV unreachable". In the former case it renders `src/components/SlugLanding.tsx` instead of silently serving the default oval. The landing shows the slug as an eyebrow, a `Create new track` CTA linking to `/<slug>/edit`, and a `Load existing` list of recently-updated slugs read from `track:index` via `src/lib/recentTracks.ts` (`zrange` with `{ rev: true, withScores: true }`, top 10). When KV is empty the list shows a friendly "nothing built yet" message. When KV env vars are missing (local dev without KV), the page keeps falling back to the default track so `npm run dev` remains playable with no setup.
- **Not yet landed.** PB fanfare, "Edit Track" entry point from the pause menu.

---

## 3. Camera & Perspective

**Status.** Partial. Trailing third-person rig with linear position + target lerp is live. Quaternion slerp on orientation and the dev panel sliders (Section 10) are not yet landed.

Trailing third-person camera, Forza Horizon style.

- Position: behind the car, slightly above, car fully in frame.
- Motion: smooth lerp toward car's heading. Position uses linear interpolation, orientation uses quaternion slerp.
- Tunable parameters: offset height, trailing distance, lerp speed, look-ahead bias.
- Implementation: raw Three.js. Camera position and quaternion updated each tick.

### Build log

- `src/game/sceneBuilder.ts` exports `initCameraRig(carX, carZ, heading)`, `updateCameraRig(rig, carX, carZ, heading, params?)` (mutates `rig` in place to avoid per-frame allocations), and `DEFAULT_CAMERA_RIG`.
- Defaults: `height=6`, `distance=14`, `lookAhead=6`, `positionLerp=0.12`, `targetLerp=0.2`.
- The look-at target is projected `lookAhead` units ahead of the car along its heading so the camera anticipates turns rather than trailing dead behind.
- **Not yet landed.** Quaternion slerp for orientation smoothing (the target-lerp approximates this well enough for the vertical slice), tunable dev-panel sliders.

---

## 4. Controls

**Status.** Partial. Keyboard (WASD + arrows + Space, all remappable) plus Esc-to-pause are live. Touch controls support both a dual-stick layout and a single-stick layout, switchable in Settings. Gamepad support (Standard layout: triggers for gas / brake, left stick for steering, RB for handbrake, Start to pause) is live. The reserved Q/E shift keys are still pending.

### Build log

- `src/hooks/useKeyboard.ts` returns `{ current: KeyInput }` (ref-like) where `KeyInput = { forward, backward, left, right, handbrake }`. `keydown`/`keyup` listeners mutate the ref and `preventDefault` for recognized keys. The hook now takes a `KeyBindings` argument (with `DEFAULT_KEY_BINDINGS` as a fallback) and reads it through a ref so changing bindings at runtime does not require rebinding listeners.
- Default mapping: `W`/`ArrowUp` = forward, `S`/`ArrowDown` = backward (brake/reverse), `A`/`ArrowLeft` = steer left, `D`/`ArrowRight` = steer right, `Space` = handbrake.
- The tick loop reads `keys.current` each frame and synthesizes `{ throttle, steer, handbrake }` for `stepPhysics`.
- Esc pause: handled in `Game.tsx` via a window `keydown` listener that is gated on `phase === 'racing'`. First press calls `pause()`, second press calls `resume()`. See Section 9 for the pause lifecycle.
- Touch: `src/game/virtual-joystick.ts` exports pure stick state helpers (`createJoystick`, `beginJoystick`, `moveJoystick`, `endJoystick`, `readJoystick`). `src/hooks/useTouchControls.ts` wires pointer events to one or two sticks depending on `touchMode` and writes booleans into the same `KeyInput` ref the keyboard hook owns so the game loop stays single-source.
  - Dual mode: left half spawns a steering stick, right half spawns a gas/brake stick. Both release on pointerup and respawn at the next tap.
  - Single mode: any touch anywhere spawns one stick. X axis steers, Y axis is gas (up) / brake (down). Only one ring renders.
- `src/components/TouchControls.tsx` takes the same `mode` and renders one or two visual rings + knobs while active. Game container uses `touch-action: none` so the browser does not steal pan/zoom.
- Settings storage: `src/lib/controlSettings.ts` defines `ControlSettings = { keyBindings, touchMode }`, defaults, schema validation, and pure helpers (`actionForCode`, `rebindKey`, `clearBinding`, `formatKeyCode`). Persisted to `localStorage` under `viberacer.controls`. `src/hooks/useControlSettings.ts` exposes `{ settings, setSettings, resetSettings, hydrated }` and listens to the `storage` event so a tweak in one tab reaches the live game in another.
- Settings UI: `src/components/SettingsPane.tsx` is a modal pane. The keyboard section detects `(any-pointer: fine)`; the touch section detects `(any-pointer: coarse)` (with `navigator.maxTouchPoints` fallback). Each action shows two slot buttons. Click a slot then press a key to bind. Reassigning a code that was already bound elsewhere transfers it. Reset to defaults is one click. Esc cancels capture.
- Wiring: `src/components/SettingsLauncher.tsx` exposes the Settings button on the home page (`src/app/page.tsx`). The pause menu (`src/components/PauseMenu.tsx`) gains a Settings entry that switches `pauseView` to `'settings'` in `Game.tsx`.
- Tests: `tests/unit/controlSettings.test.ts` covers default-binding lookup, rebind transfers across actions, immutability of inputs, slot growth past current length, clear bounds, key-code formatting, and the localStorage round-trip (defaults on missing or malformed payloads).
- Initials editing: live. The Settings pane (`SettingsPane`) renders an "Identity" section with the current initials in an inline 3-letter input (uppercase A-Z, same `InitialsSchema` validation as the first-visit prompt). Saving calls `writeStoredInitials(value)` from `src/lib/initials.ts`, which writes the localStorage key `viberacer.initials` and dispatches a `viberacer:initials-changed` CustomEvent. `Game` subscribes to that event plus the cross-tab `storage` event so the HUD's RACER block reflects the new tag on the next frame without restarting the race. Mid-race edits affect future laps only; historical leaderboard entries keep their old tag (per `§7` and `§11`).
- Gamepad: live. `src/game/gamepadInput.ts` is a pure helper that maps the W3C Standard Gamepad layout to a `{axes:{steer,throttle}, keys:{...}, pausePressed}` payload (right trigger = forward, left trigger = brake / reverse, A / B as analog-trigger fallback, left stick X with deadzone for steering, dpad left / right overrides the stick, RB or X for handbrake, Start emits pause on the rising edge). `src/hooks/useGamepad.ts` polls `navigator.getGamepads()` on rAF, treats the first connected pad as active, and writes both the analog axes and the boolean keys onto the same `KeyInput` ref the keyboard owns. When the pad is idle (zero deflection, no buttons), it blanks `keys.current.axes` so a connected-but-unused controller does not lock out arrow keys. `KeyInput` gained an optional `axes` field; `RaceCanvas` reads it each frame and prefers it over the boolean derivation when set, which feeds analog values straight into `stepPhysics`. SFX (`steerAbs`, `throttle`) read from the same combined inputs so engine drone, skid, and rumble cues react to trigger pressure rather than just on / off. Last-input-wins now flips `inputModeRef` to `'gamepad'` whenever the analog axes are populated, so the leaderboard's input-mode badge surfaces a small controller icon (alongside keyboard / touch). `InputModeSchema` extended to `z.enum(['keyboard','touch','gamepad'])`. The Settings pane gained a Gamepad section under Controls that shows whether a controller is detected (live `gamepadconnected` listener plus a 1.5s poll) and explains the bindings. Bindings are not yet remappable. Tuning Lab also calls `useGamepad` so the practice loop benefits.
- **Not yet landed.** Q/E shifter keys, gamepad-binding remap UI.

### Keyboard (defaults, remappable in Settings)

| Action          | Keys                  |
| --------------- | --------------------- |
| Accelerate      | `W` or `Up`           |
| Brake / reverse | `S` or `Down`         |
| Steer left      | `A` or `Left`         |
| Steer right     | `D` or `Right`        |
| Handbrake       | `Space`               |
| Shift up        | `E` (reserved)        |
| Shift down      | `Q` (reserved)        |
| Pause           | `Esc` (or gamepad Start) |

Manual gearing is a stretch feature. Default car is automatic.

### Mobile touch: floats where you tap

Virtual joysticks with no fixed positions. Two layouts, switchable in Settings.

**Single stick (default):**
- Any touch spawns one stick anywhere. Horizontal axis steers, vertical axis is gas (up) / brake (down). Releases on touchend and respawns at the next touch point.

**Dual stick:**
- **Left half of screen.** First touch spawns a steering stick at that point. Horizontal axis steers.
- **Right half of screen.** First touch spawns a gas/brake stick. Up = accelerate, down = brake.
- Both sticks release on touchend and respawn at the next touch point.

Pause button floats in a corner and is always tappable during a race.

---

## 5. Vehicle

**Status.** Partial. Arcade integrator with off-track drag ships in `src/game/physics.ts`. Car renders using the Kenney Car Kit `race.glb` loaded via `GLTFLoader`. Per-wheel raycast and angular velocity are not yet landed.

### Build log

- `src/game/physics.ts` exports `stepPhysics(state, input, dtSec, onTrack, params?)`, `DEFAULT_CAR_PARAMS`, and `PhysicsState` / `PhysicsInput` / `CarParams` types.
- Simplified arcade model: scalar speed + heading, no lateral velocity. Throttle adds `accel * dt`; reverse throttle brakes forward motion first, then accelerates backward at `reverseAccel`. Coasting decays at `rollingFriction`. Handbrake adds a drag proportional to `brake * 1.5`. Off-track applies `offTrackDrag` and caps at `offTrackMaxSpeed`. Steering multiplies by `sign(speed)` so reverse steers naturally.
- Defaults: `maxSpeed=26`, `maxReverseSpeed=8`, `accel=18`, `brake=36`, `reverseAccel=12`, `rollingFriction=4`, `steerRateLow=2.2`, `steerRateHigh=2.2`, `minSpeedForSteering=0.8`, `offTrackMaxSpeed=10`, `offTrackDrag=16`. Steering rate lerps between the low and high values across `[minSpeedForSteering, maxSpeed]`, so a low high-speed value tames twitchiness on straights while keeping low-speed agility.
- On-track detection: `distanceToCenterline(op, x, z) <= TRACK_WIDTH/2` in `tick.ts`. Centerlines: straights use segment distance; corners use `|hypot(x - cx, z - cz) - CELL_SIZE/2|` with `arcCenter` cached on each `OrderedPiece` at build time.
- Car visual: `src/game/sceneBuilder.ts::buildCar` returns an outer Group with an inner Group containing the Kenney `race.glb` scene. The inner Group applies `rotation.y = PI/2` (model's local +Z forward remapped to world +X, matching physics heading 0) and a uniform `scale = 1.65` so the ~2.56-unit model matches the prior 4.2-length footprint. Asset served from `public/models/car.glb` (CC0, Kenney Car Kit v3.1). License note in `public/models/KENNEY-LICENSE.txt`. Orientation via `car.rotation.y = state.heading` on the outer Group.
- Tests: `tests/unit/physics.test.ts` covers throttle, max-speed cap, off-track cap, brake-while-moving, coast-to-zero, low-speed steering lockout, and steering while moving.
- **Not yet landed.** Angular velocity + quaternion heading, per-wheel raycast, dev-panel tuning (Section 10), `mass`/`downforce`/`forwardGrip`/`lateralGrip` fields from the GDD spec.

### Visual style

Cartoony, clean, readable silhouette. Start with free CC0 low-poly glTF models from the Kenney Car Kit. Voxel and custom-mesh paths are open for later iterations.

### Physics (simplified arcade)

Custom tick-based integrator. No Rapier or Cannon. Matches FrackingAsteroids' "custom math" approach in `src/game/collision.ts`.

**Parameters (all tunable via the dev panel, see Section 10).**

- `mass` (kg)
- `engineForce` (N)
- `brakeForce` (N)
- `forwardGrip` (0..1)
- `lateralGrip` (0..1)
- `steeringRate` (radians/sec)
- `steeringReturn` (radians/sec when neutral)
- `handbrakeLockFactor` (0..1 multiplier on lateral grip)
- `downforce` (arbitrary units, scales with speed)
- `maxSpeed` (m/s)

**Track adhesion.** Raycast from each wheel to the ground plane. If any wheel is off-track (fails its raycast against valid track mesh), apply strong lateral drag and a slowdown multiplier. This satisfies the requirement that the car stays on the track, without hard walls that feel cheap.

**State.** Position, velocity, heading (quaternion), angular velocity, throttle, brake, steering angle, handbrake.

---

## 6. Track System

**Status.** Partial. Validation, canonical hashing, default 3D track geometry, path ordering, and cell-based checkpoint generation now ship. Editor UI, save flow wired to `PUT /api/track/[slug]`, and additional piece types are still pending.

### Pieces (starting set)

- Straight
- Left 90
- Right 90

Each piece occupies one cell on an infinite grid. Pieces have entry and exit connectors on cell edges. Later additions: S-curve, wider turn, elevation ramp, chicane.

### Editor

- Top-down 2D view of the grid.
- Click an empty cell to cycle through pieces and rotations.
- Pieces snap to grid. No free placement.
- Save button is disabled until the track forms a valid closed loop.
- **Closed-loop validation.** BFS through connectors starting from any piece. Valid only if every connector matches (a piece's exit connects to another piece's entry) and the resulting graph is a single closed cycle.
- **Piece limit.** 64 per track to start. Keeps playable and rendering budgets bounded.

### Versioning

- On save, serialize the piece array into a canonical form (stable ordering: row then column; include piece type, rotation, and position).
- Compute SHA-256 of the canonical JSON. This hash is the version ID.
- Each version has its own leaderboard. Previous versions remain accessible via `?v=<hash>`.

### Access

"Edit track" appears in the pause menu and on the title screen.

### Build log

- Piece schema (`type`, `row`, `col`, `rotation`) and 64-piece cap: `src/lib/schemas.ts`. Rotations restricted to the set `{0, 90, 180, 270}`.
- Connector math and BFS closed-loop validation: `src/game/track.ts`. Direction encoding is `N=0, E=1, S=2, W=3`. A piece has two open edges; each open edge must face a matching open edge on the neighboring cell. The graph must be a single connected component covering every piece. `DIR_OFFSETS`, `opposite`, and `cellKey` helpers are exported here and reused by `trackPath.ts` and `tick.ts`.
- Validation rejects: empty track, duplicate cell, dangling connector, connector mismatch, disjoint loops, piece count over 64.
- Canonical versioning: `src/lib/hashTrack.ts` sorts pieces by `row, col, type, rotation` before serializing and SHA-256. Hash is stable regardless of input order. Output is a 64-char lowercase hex string that matches the `VersionHashSchema` regex.
- Default track: `src/lib/defaultTrack.ts` exports `DEFAULT_TRACK_PIECES`, an 8-piece rectangular loop on a 3x3 grid (piece 0 is a straight so the car spawns cleanly on the centerline heading north). Served by `/[slug]/page.tsx` when the slug has no saved track. Its hash is hoisted to a module-level `DEFAULT_TRACK` constant to avoid recomputing per request.
- Path ordering: `src/game/trackPath.ts` exports `buildTrackPath(pieces): TrackPath`. Walks connectors from piece 0, producing `OrderedPiece[]` each with precomputed `center`, `entry`, `exit`, and (for corners) `arcCenter`. Also builds `cellToOrderIdx` (cellKey -> index) for O(1) lookups during lap detection. `CELL_SIZE = 20`, `TRACK_WIDTH = 8`.
- 3D geometry: `src/game/sceneBuilder.ts` builds flat ribbon meshes at `y = 0.01`. Straights are rectangles (TRACK_WIDTH x CELL_SIZE). Corners are quarter-annulus tessellations with 20 segments, inner radius 6, outer radius 14. All track pieces share one `MeshStandardMaterial`; `dispose()` dedupes materials via a Set to avoid double-disposal.
- Per-track checkpoints: one checkpoint per piece, expected in loop order. `tick.ts` records `{cpId, tMs}` when the car's cell becomes the next expected piece's cell and fires `LapCompleteEvent` when the car re-enters piece 0 after N-1 intermediate CPs.
- Tests: `tests/unit/track.test.ts`, `tests/unit/hashTrack.test.ts`, `tests/unit/trackPath.test.ts` (default-track validity, piece ordering, spawn, cell map, one-cell-apart centers, corner `arcCenter` placement, null `arcCenter` on straights).
- Editor UI: `src/components/TrackEditor.tsx` renders a top-down SVG grid around the current bounds (plus two cells of padding). Clicking a cell calls `withCellCycled`, which advances that cell through empty, `straight`/0/90/180/270, `left90`/0/90/180/270, `right90`/0/90/180/270, back to empty. Each piece is drawn as a dark road band plus dashed centerline, with a small dot at the south edge so the rotation reads at a glance without implying travel direction. Piece 0 gets a green border and START label since the car spawns on its entry edge. The footer shows piece count versus the 64-piece cap, a live validation line sourced from `validateClosedLoop`, and Cancel, Clear, and Save buttons. Save is disabled until the loop is valid and the editor is not already saving.
- Editor route: `src/app/[slug]/edit/page.tsx` is a server component. It validates the slug, loads the latest saved pieces through the shared `loadTrack(slug)` helper in `src/lib/loadTrack.ts` (falls back to `DEFAULT_TRACK_PIECES` when KV is unset or the slug has no saved track), and hands them to `<TrackEditor />`.
- Save flow: `TrackEditor` posts `{ pieces }` to `PUT /api/track/[slug]`. The four KV writes (`trackVersion`, `trackLatest`, `trackVersions`, `trackIndex`) run in parallel via `Promise.all`. On 200, the editor navigates to `/[slug]?v=<newHash>` so the driver lands on the freshly hashed version. On 4xx, the server's error message is shown in-line. On KV failure the route returns `503 { error: 'storage unavailable' }` instead of a raw 500. The route rejects without a `viberacer.racerId` cookie (middleware guarantees one is set on any page visit).
- Spawn math: `buildTrackPath` spawns the car at piece 0's entry edge stepped `SPAWN_INSET` (2) units inward along the travel direction. This lands on the centerline for straights and on the arc for corners, and avoids `worldToCell` rounding into the neighbor cell.
- Historical version deep-link: `/[slug]?v=<hash>` routes through `src/app/[slug]/page.tsx`. The page reads `searchParams.v`, validates via `VersionHashSchema`, and calls `loadTrack(slug, hash)`. Unknown or malformed hashes trigger `notFound()` rather than silently falling back to latest. The leaderboard UI can hand users between versions (see §11).
- Pause menu: `PauseMenu` gains an Edit Track entry between Restart and Leaderboards. `Game.tsx` wires `onEditTrack` to `router.push('/<slug>/edit')`.
- Helper + tests: `src/game/editor.ts` exports `cycleCell`, `withCellCycled`, and `getBounds`. `tests/unit/editor.test.ts` covers the full cycle order, rotation and type advancement, piece removal on final-state cycle, and bounds across negative and positive coordinates. `tests/unit/trackPath.test.ts` covers corner-start spawn staying on the arc.
- Configurable checkpoint count: `TrackSchema` and `TrackVersionSchema` now carry an optional `checkpointCount` (`MIN_CHECKPOINT_COUNT = 3`, capped at `pieces.length`). `hashTrack(pieces, checkpointCount)` only emits the field in canonical JSON when it differs from `pieces.length`, so legacy tracks without the field keep their existing version hash and leaderboards. `buildTrackPath(pieces, checkpointCount)` precomputes `cpTriggerPieceIdx[k] = round((k+1) * M / K) % M`, and `tick.ts` reads from that array instead of assuming one CP per piece. The editor hides this behind an Advanced toggle in the footer (with an amber dot when an override is active). Opening the panel surfaces a labeled numeric input alongside an explanation of what checkpoints do and when an author would change the count; the default ("one per piece, strictest") is what every legacy track ships with.
- Historical version forking from the editor: `src/app/[slug]/edit/page.tsx` now reads `searchParams.v`, validates with `VersionHashSchema`, and threads the result into `loadTrack(slug, requestedHash)`. An invalid or unknown hash calls `notFound()`. When a hash is supplied, `TrackEditor` renders a small amber "FORKING v<short>" banner explaining that saving creates a new version on the same slug rather than overwriting the original, plus a "Switch to latest" shortcut. The leaderboard pause overlay (`src/components/Leaderboard.tsx`) gained a "Fork this version" / "Edit latest" button next to the existing "Race this version" button so players can jump straight from any version's leaderboard into editing a copy.
- **Not yet landed.** Per-slug create-or-load prompt when visiting an empty slug (editor is reachable from the pause menu today but not from a fresh URL), pan/zoom on very large tracks, S-curve and other new piece types.

---

## 7. Routing & User-Owned Paths

**Status.** Partial. Middleware, `racerId` cookie, `/` home, `/[slug]` race page, and the initials lifecycle all ship. The create-or-load prompt on a fresh slug, the Settings screen, and `?v=<hash>` deep-linking are not yet landed.

Next.js App Router dynamic routes.

### Routes

- `/` Home. Shows "Create new track" and "Load existing" (a list of latest-updated slugs across the site).
- `/[slug]` Main game page. Loads the latest saved version of the track at that slug. If the slug has no track yet, shows a create-or-load prompt scoped to that slug.
- `/[slug]?v=<hash>` Loads a specific historical version of the track at `<slug>`. Used for leaderboard time travel.

### Ownership and editing rules

- There is no account system. Tracks are not owned in the traditional sense.
- Anyone can visit any slug and race the track there.
- Anyone can edit any slug's track. Editing creates a new version (new hash). Previous versions and their leaderboards are preserved.
- Anyone can submit a lap time on any version they actually raced.

### Initials lifecycle

Initials are the player's leaderboard identity. Three uppercase letters, arcade style.

- Stored in `localStorage` under `viberacer.initials`. Set once, reused everywhere.
- **Single rule for every route.** On page load, check `localStorage` for initials. If missing, show the initials prompt immediately, before the game, editor, or any menu appears. Same behavior on `/` and any `/[slug]`.
- Prompt copy is plain and direct: "Enter 3 initials. They will tag your lap times on the leaderboards." No scare text. No legal boilerplate.
- Settings screen exposes initials for editing at any time. Changing them does not rewrite historical submissions.
- Once initials are set, every completed lap auto-submits silently. No additional prompts.

### Build log

- `racerId` cookie set by `src/middleware.ts`. Cookie name is `viberacer.racerId`, value is a UUID v4, flags are `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, `Max-Age = 1 year`.
- `src/lib/racerId.ts` exposes `newRacerId()`, `isValidRacerId()` (strict UUID v4 regex, not just "any UUID"), and `readRacerId()` for RSC use.
- Middleware matcher excludes `_next/static`, `_next/image`, `favicon.ico`, and any path with a file extension. All other routes (pages and APIs) run middleware.
- Middleware best-effort writes `racer:<racerId>:firstSeen` to KV via dynamic import wrapped in try/catch so a KV outage never blocks page responses.
- Playwright smoke in `tests/e2e/smoke.spec.ts` verifies the cookie lands on first visit and matches the UUID v4 regex.
- `/[slug]` page: `src/app/[slug]/page.tsx` is a server component. Validates slug via `SlugSchema`, loads the track from KV (or falls back to `DEFAULT_TRACK` when KV env vars are missing or the slug has no saved track), then renders `<Game slug versionHash pieces />`.
- Initials prompt: `src/components/InitialsPrompt.tsx` reads/writes `viberacer.initials` via `readStoredInitials` / `writeStoredInitials`. Validated through `InitialsSchema`. `Game.tsx` blocks the canvas render until initials exist: on mount it reads `localStorage`; if missing, it shows `InitialsPrompt`; once set, it renders `GameSession` which runs the countdown and race.
- `/` page: `src/app/page.tsx` shows "Play default track" plus two sample slug links. The planned Create / Load existing / Settings home UI is still pending.
- `?v=<hash>` deep-link handling: live. `src/app/[slug]/page.tsx` reads `searchParams.v`, validates through `VersionHashSchema`, and loads that specific version from KV (`track:<slug>:version:<hash>`). Missing or invalid hashes call `notFound()`. The overall-record seeded into the HUD is also scoped to the requested version so history browsing shows correct top times.
- Per-slug create-or-load prompt: live via `SlugLanding`. `src/lib/recentTracks.ts::readRecentTracks(kv, limit, excludeSlug?)` reads `track:index` newest-first (`zrange` with `rev: true, withScores: true`), rejects members that fail `SlugSchema`, and returns typed `{slug, updatedAt}` entries. Unit coverage in `tests/unit/recentTracks.test.ts`.
- Home page: `src/app/page.tsx` is now an async RSC. Primary CTA renamed from `Play default track` to `Play at /start` so it stays truthful when `/start` has no saved track (it lands on `SlugLanding` in that case, same as any other fresh slug). Below the CTA a `RECENT` section reuses `readRecentTracks` to show up to ten recently-updated slugs with their date; when the KV index is empty (or KV env vars are missing in local dev), the section falls back to the `/oval` and `/sandbox` sample slugs so the page still has somewhere to click.
- Settings-screen initials editing: live. `SettingsPane` renders an Identity section with the current initials in an inline 3-letter input. Saving routes through `writeStoredInitials` in `src/lib/initials.ts`, which broadcasts a `viberacer:initials-changed` CustomEvent so `Game` can refresh the HUD's RACER block in-place.

---

## 8. Race Flow

**Status.** Partial. Countdown (now animated traffic light with per-step synth beeps), per-track configurable checkpoint count, lap detection, the full HUD, pause button, and invalid-lap handling are all live.

### Build log

- Countdown: `src/components/Countdown.tsx` cycles `READY -> SET -> GO` on an 800 ms interval, then holds GO for 600 ms and fires `onDone`. Renders a vertical three-lamp traffic-light housing (red, amber, green) with the current step label below. Each step lights exactly one lamp: READY = red, SET = amber, GO = green. Inactive lamps are inset-darkened; the lit lamp glows via `boxShadow`. The label text is gold during READY / SET and green on GO. During countdown, `GameSession` keeps the tick loop running but `state.raceStartMs` is null so physics is frozen and the timer shows 00:00.000.
- Countdown beeps: `playCountdownBeep(isGo)` in `src/game/music.ts` fires a one-shot tone through the shared `AudioContext`, routed to the master gain so it is audible over any active music without piping through the step scheduler. Counting steps use a square wave at A4 (midi 69); GO uses a triangle wave at A5 (midi 81) with a slightly longer decay. Envelope is a 10 ms linear attack then exponential decay to 0.001. Countdown's `useEffect([step])` calls the helper once per step change (mount + each increment), so READY and SET play low beeps and GO plays the higher pitch.
- Lap detection: cell-based. `tick.ts` compares `state.lastCellKey` against the current cell each frame. The expected piece for the next CP comes from `path.cpTriggerPieceIdx[nextCpId]` (precomputed by `buildTrackPath` from the per-track `checkpointCount`, defaulting to one per piece). When the car enters that piece, it records `{cpId, tMs}` where `tMs = nowMs - raceStartMs`. After K CPs, the lap completes (the K-th trigger piece is always piece 0) and resets `nextCpId=0`, `hits=[]`, `raceStartMs=nowMs` for the next lap. Lap count increments.
- HUD: `src/components/HUD.tsx` renders CURRENT (big), LAST LAP, BEST (SESSION), BEST (ALL TIME), RECORD (track-wide top time, loaded from KV in the RSC page and passed through), LAP, RACER, plus an OFF TRACK warning and a transient toast for PB / lap-saved messages. Stat blocks share a `StatBlock` subcomponent. `setHud` is throttled to ~20 Hz with a reference-equality bail-out so the tree doesn't re-render unnecessarily.
- Endless loop: no lap cap. Every completed lap triggers `handleLapComplete` which updates local PBs and fires `submitLap` (fire-and-forget).
- Invalid-lap reset: in `tick.ts`, if the car transitions into the start-piece cell while `nextCpId > 0` (i.e., the player has partial checkpoint progress but is re-entering the start without a valid lap completion), `hits` is cleared, `nextCpId` is reset to 0, and `raceStartMs` is set to `nowMs`. The lap counter is not incremented and no `LapCompleteEvent` fires. Covers driving backward through the start line or taking a shortcut that re-enters piece 0 early. Test coverage in `tests/unit/tick.test.ts`.
- Pause button: always-visible circular button at `bottom: 20, left: 16` (rendered only during the `racing` phase and hidden once the pause menu opens). Clicking calls `pause()` which freezes the tick and shows the pause menu.
- Configurable checkpoint count: `Track.checkpointCount` is optional in the schema, range `[3, pieces.length]`. Distribution formula is `cpTriggerPieceIdx[k] = round((k+1) * M / K) % M`, which always lands the K-th trigger on piece 0 so the lap-complete branch in `tick.ts` is unchanged. Hash compatibility: `hashTrack(pieces, checkpointCount)` only emits the field when it differs from `pieces.length`, preserving every legacy hash. Editor exposes a numeric input next to the piece counter; default reads as `default` and switching back to `pieces.length` clears the override on save. Test coverage: `tests/unit/schemas.test.ts`, `tests/unit/hashTrack.test.ts`, `tests/unit/trackPath.test.ts`, `tests/unit/tick.test.ts`, `tests/unit/api.track.test.ts`.

### Start signal

- Three-step traffic light: READY (red), SET (amber), GO (green). One lamp lit per step.
- Synth beep per step. Final beep is a higher pitch on GO.
- Input ignored until GO.

### Lap detection

- Invisible finish-line plane spans the start piece.
- `N` checkpoint planes distributed around the loop. Configurable per track (default: one per piece edge that lies on the shortest path).
- A lap counts when all checkpoints are hit in order AND the finish line is crossed.
- Out-of-order or missed checkpoints invalidate the lap. The timer resets at the next finish-line crossing.

### HUD

- Current lap time (big, top center).
- Best lap this session (smaller, beside current).
- Best-ever for this track version (smaller, persistent; from KV).
- Lap counter.
- Pause button (always visible on touch devices).

### Endless loop

No lap cap. The player keeps racing until they pause and exit. Every completed lap tries to submit.

### Ghost car

A translucent cyan ghost car races alongside the player, replaying the path of the leaderboard's fastest known lap (or the player's own personal best, once they have one). The ghost is purely visual: there is no collision with the player, no input from it, and it never affects physics or anti-cheat. It is toggleable on or off in Settings (`showGhost: boolean` in `ControlSettings`, default on, persisted via the existing localStorage key `viberacer.controls`).

Each lap, `RaceCanvas` samples the player's `(x, z, heading)` at a fixed 30 Hz cadence into an in-memory buffer. On `LapCompleteEvent` the buffer is flushed as a `Replay` (`{lapTimeMs, samples: [x, z, heading][]}`) and bundled into the next `/api/race/submit` POST. The server stores it under `lap:replay:<nonce>` and updates `track:<slug>:<hash>:topReplay` to point at the new nonce when the lap takes rank 1. As a one-time bootstrap, if `topReplayPointer` is empty (the existing #1 predates this feature and has no recorded replay), the next submission with a replay is promoted regardless of rank so a ghost appears immediately rather than waiting for someone to beat the legacy time.

On race load `GameSession` resolves the active replay in priority order: local PB replay (`viberacer.replay.<slug>.<hash>` in localStorage) first, then `GET /api/replay/top` for the leaderboard top. The active replay is stored in `activeGhostRef` and consulted each frame; ghost pose is computed by interpolating the samples at `t = nowMs - state.raceStartMs`. Because `tick.ts` resets `raceStartMs` on every finish-line crossing, the ghost automatically restarts from `t=0` in lock-step with the player's lap timer.

When the player completes a lap that beats their previous local PB, the buffered replay becomes the new local PB replay and immediately replaces `activeGhostRef.current`, so the next lap is run against the player's own freshly-recorded path.

Ghost rendering reuses the player car's GLB through `buildGhostCar()` in `sceneBuilder.ts`, which clones the model and overrides every material with a translucent emissive cyan (`opacity 0.45, depthWrite: false`). The ghost mesh is added to the same scene as the player, rendered after the track and the player car so it draws on top in case of overlap.

---

## 9. Title Screen, Menu, and Pause

**Status.** Partial. Pause menu is live with Resume, Restart, Leaderboards (button present, no-op wired intentionally until §11 ships), and Exit to title. Title screen at `/` is live: a Fredoka-wordmark logo over a Three.js background loop (a car auto-driving the default oval track with a slow orbiting camera), with Play / Load existing track / Settings (disabled stub). Settings pane itself is not yet wired.

### Build log

- `src/components/PauseMenu.tsx` is a dark overlay card with six buttons (Resume highlighted as primary, Restart, Edit Track, Leaderboards, Settings, Exit to title) plus a small "Esc to resume" hint. Pure presentational, no state of its own.
- `src/components/Game.tsx` owns the pause lifecycle: Esc key while `phase === 'racing'` calls `pause()`; clicking the bottom-left pause button does the same. Both `pause()` and `resume()` set `pausedRef.current` synchronously so the RAF loop picks up the state change on the very next frame.
- Pause freezes simulation without drift: on pause, `pauseStartTsRef.current = performance.now()`; on resume, `resumeShiftRef.current += performance.now() - pauseStartTsRef.current`. The loop drains the shift by adding it to `state.raceStartMs` so the lap timer resumes where it left off.
- Restart replays the countdown: `restart()` sets `pendingResetRef.current = true`, clears the token, resets session HUD state, and flips `phase` back to `'countdown'`. The Countdown component remounts and the READY-SET-GO sequence plays again. All-time PB in `localStorage` is preserved.
- Exit to title uses Next.js's `useRouter().push('/')`.
- Leaderboards button: toggles a sub-view inside the paused overlay. `pauseView: 'menu' | 'leaderboard'` in `Game.tsx` drives which component renders. Leaderboard has a Back button that returns to the menu. Reopening pause always starts on `'menu'`.
- Edit Track button: wired to `router.push('/<slug>/edit')`. See Section 6 for the editor UI.
- Title screen at `/`: server component in `src/app/page.tsx`. `next/font/google` loads Fredoka as the cartoony wordmark font (CSS var `--font-cartoony`). `src/components/TitleBackground.tsx` mounts a full-viewport canvas behind the menu that reuses `buildTrackPath` + `buildScene` to render the default oval track, then drives a car along the centerline (straights interpolate entry→exit, corners sample the arc at radius `CELL_SIZE/2`) with a slow camera orbit. Menu is Play (links to `/start`), Load existing track (the `RecentTrackList` of the latest-updated slugs, falling back to sample slugs), and a Settings button that opens the Settings pane in a modal via `src/components/SettingsLauncher.tsx`.
- Settings pane: `src/components/SettingsPane.tsx` ships keyboard remap (with a click-then-press capture flow per slot, modifier keys ignored, conflict transfer to the new action) plus a dual / single touch mode toggle. Reachable from both the title screen and the pause menu. See Section 4 build log for storage and detection details.
- Share button: pause menu entry between Settings and Exit. `Game.tsx` builds a `SharePayload` from the current slug, version hash, local PB, and overall record (helpers in `src/lib/share.ts`), then calls `shareOrCopy` which prefers `navigator.share` (mobile share sheet) and falls back to `navigator.clipboard.writeText` on desktop. The shared URL is `${origin}/${slug}?v=${versionHash}` so recipients always race the exact version the sharer was on. The button label flips to "Link copied!" / "Shared!" / "Could not share" for 1.6s, then back to "Share track". Pure helpers (`buildShareUrl`, `buildShareText`, `buildSharePayload`, `shareOrCopy`) are unit-tested in `tests/unit/share.test.ts`.
- **Not yet landed.** Always-visible touch pause button (the current pause button works on touch but its sizing is not yet optimized for one-thumb reach).

### Title screen (route `/`)

- Logo ("VibeRacer") with the game's cartoony font and color palette.
- Cartoony background loop (simple procedural scene, could be an auto-driving car on a looping sample track).
- Streaming synth title music (see Section 13).
- Menu items:
  - "Play" (starts a race at a default slug or prompts for a name)
  - "Load existing track" (list of latest-updated slugs)
  - "Settings"

### Pause menu

Triggered by `Esc` or the on-screen pause button. Freezes simulation and music intensity (music can keep playing, muted or ducked).

Items:

- Resume
- Restart
- Edit Track
- Leaderboards (for this track version)
- Setup
- Settings
- Share track (Web Share API on mobile, clipboard fallback on desktop)
- Exit to title

The feedback FAB appears only while paused. See Section 12.

---

## 10. Physics and Controls Tuning (player Setup)

**Status.** Done. Tuning is a first-class player feature: a Setup panel in the pause menu exposes live sliders for every `CarParams` field, saves per track, and carries the most recent setup forward to fresh tracks. Each lap submission carries its setup so leaderboard viewers can see and one-tap reuse another player's tuning.

### Setup panel

- Pause menu entry: "Setup".
- Component: `src/components/TuningPanel.tsx`.
- Each parameter has a slider and a numeric input. Per-field "reset" link reverts that field to its default. Footer has "Reset to defaults" for the whole setup.
- The two `steerRate*` fields share a 2D pad: horizontal axis = low-speed steering, vertical axis = top-speed steering. A small grey dot marks the defaults; the live value tracks the orange dot. Numeric inputs sit alongside for precision.
- A status line shows a STOCK chip when the setup matches `DEFAULT_CAR_PARAMS`, otherwise a TUNED chip.

### Storage

- Per-track key: `viberacer.tuning.track:<slug>` in `localStorage`.
- Last-loaded key: `viberacer.tuning.lastLoaded` (mirrors whichever per-track tuning was most recently saved).
- Resolution order on load: per-track save, then last-loaded carryover, then `DEFAULT_CAR_PARAMS`.
- One-shot migration from the old dev-only key `viberacer.dev.tuning` if present.
- Resolver, schema, and helpers live in `src/lib/tuningSettings.ts`. Hook is `src/hooks/useTuning.ts` (slug-scoped, hydrates on mount, listens for cross-tab `storage` changes).

### Slider ranges

Bounds double as anti-cheat sanity caps (server validates with the same numbers via `CarParamsSchema`):

| field | default | min | max | step | unit |
|---|---|---|---|---|---|
| maxSpeed | 26 | 12 | 50 | 0.5 | u/s |
| maxReverseSpeed | 8 | 2 | 20 | 0.5 | u/s |
| accel | 18 | 4 | 48 | 0.5 | u/s² |
| brake | 36 | 8 | 80 | 1 | u/s² |
| reverseAccel | 12 | 2 | 30 | 0.5 | u/s² |
| rollingFriction | 4 | 0 | 20 | 0.25 | u/s² |
| steerRateLow | 2.2 | 0.5 | 5.0 | 0.05 | rad/s |
| steerRateHigh | 2.2 | 0.5 | 5.0 | 0.05 | rad/s |
| minSpeedForSteering | 0.8 | 0 | 5 | 0.1 | u/s |
| offTrackMaxSpeed | 10 | 2 | 30 | 0.5 | u/s |
| offTrackDrag | 16 | 0 | 60 | 1 | u/s² |

### Leaderboard attachment

Each lap submit includes `tuning` (current `CarParams`) and `inputMode` ('keyboard' or 'touch'; last-input-wins detection). Server stores them under `lap:meta:<nonce>` in KV; the leaderboard read batches these via `mget` and serves them on each entry. Older entries with no meta surface as `null` and the UI shows a dim placeholder. Out-of-range tuning is rejected at submit time (silent drop) and replaced with `null` if it ever sneaks through.

### Interactive Tuning Lab

A dedicated mode at `/tune` for players who want guided tuning instead of raw sliders. Reachable from the title-screen menu (button next to Settings) and from the Settings pane (in-game and on the title screen). Mobile-first, no leaderboards, no KV.

- Curated test loop in `src/lib/tuningLabTrack.ts`: a 12-piece closed loop with straights, two left turns, four right turns, an S-curve, and a hairpin. Verified by `tests/unit/tuningLabTrack.test.ts` against `validateClosedLoop` and a simulated centerline drive that fires `lapComplete`.
- Render primitive `src/components/RaceCanvas.tsx` (extracted from `Game.tsx`) drives the canvas, scene, and rAF loop. Both the race flow and the lab use it.
- Session flow in `src/components/TuningSession.tsx`: intro (control-type and tag chips) -> countdown -> drive (one full lap) -> 5-point Likert form -> recommendation diff -> drive again or save.
- Recommendation engine in `src/lib/tuningLab.ts`: pure `recommendNextParams(current, ratings, prevDeltas, damping)`. Each rated aspect maps to one or more `CarParams` keys with a sign and weight; the per-param delta is `unit * sign * weight * (max - min) * baseStep * damping`, averaged across contributing aspects, and clamped via `clampParams`. Damping halves a per-param multiplier (floor 1/16) when the next round flips its delta sign, so oscillation tames itself.
- Aspects rated (5-point Likert, 3 = just right): top speed, pickup, braking, low-speed turn, high-speed turn, coast, off-track penalty.
- Saved tunings in localStorage under `viberacer.tuningLab.saved`. Each row tags `controlType` (`keyboard` / `touch_single` / `touch_dual`) and up to four `trackTags` (`twisty` / `fast` / `mixed` / `technical`). Sortable by recency, mean rating, fastest lap, or name. Filterable by control and tag, plus name search.
- "Apply to next race" writes through to the existing `viberacer.tuning.lastLoaded` key (and a synthetic `viberacer.tuning.track:__lab__` save) so the next slug the user opens picks the lab tuning up automatically.
- The session also auto-persists the live params to `lastLoaded` on every change so an unsaved session still carries its most-recent setup forward when the user leaves the lab. During the drive phase a "Restart" button resets the car to the start line without going to feedback.
- Export and import are clipboard-based. "Copy JSON" on a saved tuning copies a single `SavedTuning`. The home view also offers "Copy all saved tunings". Import view accepts pasted JSON and dispatches via `parseImportedJson`: a single tuning lands directly in the saved list; a session payload saves its final round.

---

## 11. Leaderboards

**Status.** Partial. Server-side: storage model, `/api/race/start`, `/api/race/submit`, the full anti-cheat validation chain, rate limits, and nonce rotation are in. Client-side: auto-submit on lap completion and local PB tracking (session + all-time in `localStorage`) are live. The leaderboard UI (top 25 view, version dropdown, PB highlight on the board, PB celebration fanfare) is not yet started.

### Storage

Per `(slug, versionHash)` sorted set in KV. Score is the lap time in milliseconds. Member is a composite string: `initials:racerId:ts:nonce`.

Lower score wins. Return the top N (default 25) for display.

### Autosave flow (core UX)

- Every completed lap auto-submits. No manual "submit time" button.
- Crossing the finish line triggers a background `POST /api/race/submit`.
- Initials are always already set by the time the game is playable (prompted on page load per Section 7).
- The lap submits silently. The HUD flashes a small confirmation: "saved, NEW PB!" or "saved, #12 on board" or just "saved".
- Changing initials mid-session only affects future laps.

### Concurrency model (important)

Multiple players can race the same `/slug?v=<hash>` simultaneously. The system must handle this cleanly and prevent one player from spoofing another.

- Nonces are cryptographically random (16 bytes from `crypto.randomBytes`). Collisions between concurrent racers are effectively impossible.
- Every race token is bound to a specific racer via a server-issued `racerId` cookie. This prevents one player from capturing another player's in-flight token and submitting times under it.
- `racerId` is an opaque UUID. Not derived from IP (mobile IPs change). Not derived from MAC address (browsers cannot read MAC). It is set by the server on first visit to any route as a cookie: `HttpOnly`, `Secure`, `SameSite=Lax`, TTL one year.
- A lightweight Next.js `middleware.ts` runs on every request and ensures the cookie exists.
- IP is captured in logs for audit and rate limiting only. It is not used as a hard identity check, since a WiFi-to-cell handoff would otherwise invalidate an in-flight race.

### Server flow

1. **First visit (any route).** Middleware checks for the `racerId` cookie. If missing, generate a UUID v4, set the cookie, write `racer:<racerId>:firstSeen` to KV. Transparent to the user.
2. **Race start.** Client calls `POST /api/race/start?slug=<slug>&v=<hash>`. Server reads `racerId` from the cookie. Server returns a signed race token encoding `{slug, versionHash, nonce, issuedAt, racerId}`, HMAC-signed with `RACE_SIGNING_SECRET`.
3. **During the race.** Client records checkpoint hits: `[{cpId, tMs}, ...]` where `tMs` is milliseconds since race start.
4. **Lap completion.** Client calls `POST /api/race/submit` with `{token, checkpoints, lapTimeMs, initials}`. The `racerId` is read server-side from the cookie, never trusted from the request body.
5. **Server validates:**
   - Token signature is valid.
   - Token is not expired (age <= 15 minutes).
   - Token's embedded `racerId` matches the cookie's `racerId` on this request. (Rejects cross-browser token theft.)
   - Nonce is unused (one-shot; stored at `race:token:<nonce>` with TTL, deleted on submit).
   - Slug and versionHash in token match the request's target.
   - All checkpoints are hit in correct order.
   - Each segment time meets or exceeds a configured minimum (catches teleport hacks).
   - `lapTimeMs` equals the sum of segment times within a small tolerance.
   - `initials` match `/^[A-Z]{3}$/` after uppercase normalization and a profanity filter.
6. **On valid submit.** `kv.zadd` into the leaderboard. The leaderboard member encodes `initials:racerId:ts:nonce` so admin tooling can later identify and revoke individual racers without exposing racerId in the public display. The response returns a fresh nonce so the next lap can submit under a new one-shot nonce. The session's signed base token stays the same; only the nonce rotates.
7. **On invalid submit.** Drop silently. No error leaked. The HUD still shows the local time so the player never knows whether a submission failed (deliberate, to avoid teaching cheaters what to fix).
8. **Rate limiting.** Mirrored from Determined's `api/leaderboard.js` pattern:
   - Per-IP: about 1 submit / 3 sec average, burst 5 (TTL 60s).
   - Per-racerId: same.
   - Per-IP daily cap (TTL 24h).
   - When a limit trips, drop silently.

### What this protects against

- **Concurrent same-track racers.** Each has their own `racerId` and nonces. No collision.
- **Stolen token replay.** An attacker without the victim's cookie fails the racerId check.
- **Time-travel submissions.** Old tokens expire after 15 minutes.
- **Nonce reuse.** One-shot nonces are deleted on submit.

### What this does NOT protect against (scoped-out, best-effort)

- A player modifying client physics to produce fast-but-plausible times. Segment minimum times set a floor; anything below is rejected. Times above the floor are trusted.
- Two devices sharing a browser cookie (same family computer). They collectively share a racerId. Acceptable trade-off.
- Network-level replay within the 15-minute window by the legitimate cookie holder. Low impact: they could already submit themselves.

### Leaderboard UI

- Default view: top 25 for the current track version.
- Dropdown to browse older versions of the same slug.
- Sortable columns (rank, initials, time, date).
- Per-row input-mode icon: keyboard / phone glyph (or dim placeholder for entries without meta).
- Per-row STOCK / SETUP chip next to the initials. Tap SETUP to open a popover that lists every `CarParams` value side by side with the defaults, plus "Copy JSON" and "Try this setup" (the latter applies the entry's tuning to your local setup and resumes).
- Personal best is highlighted if the current `racerId` has a score on this board.
- PB celebration (larger flash plus a small synth fanfare) fires only on a new personal best against this track version.

### Build log

- `POST /api/race/start` (`src/app/api/race/start/route.ts`) validates `slug` and `v`, reads `racerId` from cookie, generates a 16-byte random nonce via `crypto.randomBytes`, signs `{slug, versionHash, nonce, issuedAt, racerId}` with HMAC-SHA256, and writes `race:token:<nonce>` to KV with 15-minute TTL.
- Token format: `base64url(JSON).base64url(hmac)`. Signing key is `RACE_SIGNING_SECRET`. Verification uses `timingSafeEqual`. Helper: `src/lib/signToken.ts`.
- `POST /api/race/submit` (`src/app/api/race/submit/route.ts`) runs the full validation chain, then calls `kv.del(race:token:<nonce>)` to enforce one-shot nonces (replay drops silently), `kv.zadd` to the leaderboard with composite member `initials:racerId:ts:nonce`, updates `racer:<racerId>:lastSubmit`, and returns a fresh nonce plus re-signed token.
- Pure validation logic: `src/lib/anticheat.ts` (`validateLap`). Covers bad signature, token expired, racer mismatch, target mismatch, checkpoint order, segment floor, lap-time tolerance, bad initials, profane initials. Defaults: `tokenMaxAgeMs = 15 * 60 * 1000`, `minSegmentMs = 200`, `lapTimeToleranceMs = 50`. Small starter profanity blocklist. All settable via the `opts` arg for testing and tuning.
- Rate limits: `src/lib/rateLimit.ts` using `kv.incr` + `kv.expire`. Defaults: 5 per IP per 60s, 5 per racer per 60s, 500 per IP per 24h. Any trip drops silently.
- **Silent-drop convention.** On any validation or rate-limit failure, submit returns HTTP 202 with `{ok: false}`. Rationale: 202 is semantically "accepted and being processed" which cleanly masks why a submission was rejected without teaching cheaters what to fix. The HUD still shows the local time.
- Typed KV key helpers and TTL constants: `src/lib/kv.ts`. Mirrors the exact key names in Section 14.
- Tests: `tests/unit/signToken.test.ts`, `tests/unit/anticheat.test.ts`, `tests/unit/api.raceStart.test.ts`, `tests/unit/api.raceSubmit.test.ts`. In-memory `FakeKv` for route tests: `tests/unit/_fakeKv.ts`.
- Client auto-submit: `src/components/Game.tsx::startRaceServerSide` fires `POST /api/race/start` when the countdown ends and stores the returned token in `tokenRef`. `submitLap` fires `POST /api/race/submit` on every completed lap, rotating the token on success. If KV or `RACE_SIGNING_SECRET` is not configured the server returns 500 and the client swallows the error; gameplay is unaffected.
- Local PB tracking: `src/lib/localBest.ts` stores `viberacer.best.<slug>.<versionHash>` in `localStorage`. `GameSession` seeds `bestAllTimeMs` from that key on mount and updates it on every new all-time PB. Session PB is held in React state only. `handleLapComplete` runs PB detection independent of the server round-trip; toast reads "NEW RECORD!", "NEW PB!", or "lap N saved" in that priority order.
- Overall track record: `src/lib/leaderboard.ts` exports `readLeaderboard(kv, slug, hash, limit, myRacerId)` which walks `zrange` output (with scores) and parses composite members (`initials:racerId:ts:nonce`) into typed `LeaderboardEntry[]` plus a `meBestRank`. The `[slug]/page.tsx` RSC calls it with `limit=1` on the server so the top entry is available on first paint and passed as `initialRecord` through `<Game>` into the HUD's RECORD block.
- `GET /api/leaderboard?slug=X&v=HASH&limit=25`: `src/app/api/leaderboard/route.ts` runs on the Node.js runtime. Validates `slug` and `v` through the same zod schemas as the other routes (returns 400 on invalid). Reads the cookie's `racerId` so `isMe` is server-marked. Returns `{slug, versionHash, entries, meBestRank}`. Clamps `limit` to `[1, LEADERBOARD_MAX_LIMIT]` (default 25, max 100). On KV error returns 200 with an empty `entries` list so the client degrades gracefully.
- Leaderboard UI: `src/components/Leaderboard.tsx` is a paused-only overlay. Fetches `/api/leaderboard` with `cache: 'no-store'`. Renders rank / racer (with a "you" badge for `isMe`), time, date. The user's rows are highlighted with the accent color. If the user has any entry, a footer reads "Your best on this track: #N".
- Client optimistic record update: `handleLapComplete` compares the new lap to the current `overallRecord.lapTimeMs`. A faster lap becomes the new record immediately in the HUD even before the server acknowledges the submit. If the server rejects the submit silently, the HUD will still show the optimistic record until the next page load refreshes it from KV. Acceptable trade-off vs round-tripping before updating.
- Tests: `tests/unit/api.leaderboard.test.ts` covers 400 on bad params, sorted order with ranks, `isMe` + `meBestRank` via cookie, limit clamping, and the empty-board case. Smoke: `tests/e2e/smoke.spec.ts` hits the route for both rejection and shape.
- Version dropdown: `src/components/Leaderboard.tsx` now fetches `/api/track/<slug>` on mount and renders a dropdown listing the stored versions (newest first, tagged `latest` / `racing`). Selecting a different version re-fetches `/api/leaderboard?slug=X&v=HASH` and re-renders the table. If the user selects a version other than the one currently being raced, a `Race this version` button appears and navigates to `/<slug>?v=<hash>` (or `/<slug>` when the selection is the latest). If KV is empty or unreachable the dropdown gracefully degrades to showing just the current version.
- Sortable columns: live. The `#`, `RACER`, `TIME`, and `DATE` headers in `Leaderboard.tsx` are buttons that flip the active sort. Tapping the active column toggles direction, tapping a new column resets to that column's natural default (`asc` for rank / racer / time, `desc` for date so the most recent runs land on top first). The active column glows accent-gold and shows an arrow indicator (`↑` / `↓`). Sort is a pure client-side reshape via `sortLeaderboardEntries` in `src/lib/leaderboard.ts`; no extra fetch, the original server `rank` is preserved on every row so re-sorting by date or racer still shows your honest leaderboard rank. Tie-break is always ascending rank for stable order. `aria-sort` is wired so screen readers track the active column. Pure helper covered by `tests/unit/leaderboardSort.test.ts` (11 tests including ascending / descending across every column, tie-break behavior, no-mutation guarantee, and empty-board safety).
- **Not yet landed.** PB fanfare + visual celebration, admin tooling to revoke racers by composite member, pagination beyond top 100.

---

## 12. Feedback FAB (port from Epoch, with two modifications)

**Status.** Partial. API route ships (targets `Randroids-Dojo/VibeRacer`, em-dashes stripped). `FeedbackFab.tsx` component ships with both modifications: single-click opens the input panel directly, and the component is mounted only while the pause menu is open.

### Source files to port

- `/Users/randroid/Documents/Dev/Epoch/components/shared/FeedbackFab.tsx`
- `/Users/randroid/Documents/Dev/Epoch/lib/consoleCapture.ts`
- `/Users/randroid/Documents/Dev/Epoch/app/api/feedback/route.ts`
- Relevant `.epoch-fab-*` CSS blocks from `Epoch/app/globals.css`.

Keep the screenshot and console log capture behavior. Both are useful for bug reports in a 3D game.

### Modification 1: single click to input panel

Epoch's FAB opens an intermediate menu with a "Feedback" button. VibeRacer skips the menu.

- Change the `toggle()` function so `view` transitions directly: `'closed'` to `'feedback'` (not `'closed'` to `'menu'`).
- Delete the entire `.epoch-fab-menu` DOM block.
- Clicking the FAB once opens the title plus description input immediately.

### Modification 2: pause-only visibility

- Conditionally mount the `<FeedbackFab />` component only when game state is `paused`.
- Not rendered on the title screen. Not rendered during active racing.
- A simple game state context (`{ isPaused: boolean }`) provides this.

### Config updates

- Change the hardcoded repo in the ported `route.ts` from `Randroids-Dojo/epoch` to the VibeRacer repo slug (confirm with user before commit).
- Keep the `GITHUB_PAT` environment variable name (matches Epoch for consistency across projects).
- Screenshot upload path stays at `.github/feedback-screenshots/`.

### Build log

- `src/app/api/feedback/route.ts` ported from Epoch. `REPO` changed to `Randroids-Dojo/VibeRacer`. Em-dashes stripped from formatting strings (the `formatConsoleLogs` separator and the body-limit omission message both use colons now).
- `src/lib/consoleCapture.ts` ported verbatim from Epoch (no em-dashes in the source, ellipsis U+2026 on truncation is fine).
- Route is on the Node.js runtime. Requires `GITHUB_PAT` to post issues; returns 500 if the env var is missing.
- Tests: `tests/unit/api.feedback.test.ts` covers the missing-PAT path, the missing-title path, and a mocked happy path that asserts the GitHub issues URL contains `Randroids-Dojo/VibeRacer`.
- `src/components/FeedbackFab.tsx` ports the Epoch FAB with both modifications. The `View` type dropped to `'closed' | 'feedback'`; `toggle()` flips between them directly so a single click opens the input panel. Pause-only visibility is handled at the call site: `Game.tsx` only mounts `<FeedbackFab />` inside the `paused` branch alongside `<PauseMenu />`. No `isPaused` context needed since only `Game.tsx` renders the FAB.
- Styling: inline `React.CSSProperties` objects instead of a global stylesheet, matching the project convention (HUD, PauseMenu, Countdown). FAB pill at `bottom-right`, panel opens immediately above it. Screenshot capture and console log buffering work unchanged from Epoch.
- **Not yet landed.** Playwright coverage for the FAB open/close/submit flow. Visual polish pass on the panel.

---

## 13. Audio

**Status.** Partial. Music ships; SFX pending.

Pure Web Audio API. No Tone.js. One shared `AudioContext`, procedural synth voices, scheduled via a 50 ms tick with 120 ms lookahead.

### Music (shipped)

Three named tracks live in one engine (`src/game/music.ts`) and share the scheduler. Each track owns a step counter, pattern, and per-track `GainNode` so tracks can overlap during a crossfade.

- **Title:** cartoony pentatonic loop in C major at 128 BPM. Mounts via `<TitleMusic />` on the home page and slug-landing page. Starts on the first pointerdown/keydown to satisfy browser autoplay policies; a one-shot document-level listener inside `music.ts` handles the retry.
- **Game:** driving minor-key loop in G minor at a configured 140 BPM. Crossfades in from title at race start over 3 seconds. Tempo ramps with car speed (70% to 100% of configured BPM, so 98 to 140 BPM). Voice volumes, drums, and a counter-melody fade in above intensity thresholds so low-speed driving sounds sparse and floored-it sounds full.
- **Pause:** slow, very quiet sine pad in C major at 68 BPM. Crossfades in when the player pauses, crossfades back to game on resume, and crossfades to title on restart. All pause/resume transitions are 0.8 seconds.

### Scheduler notes

- `crossfadeTo(target, fadeSec)` fades all non-target tracks to 0 and fades the target up to its configured gain. Creates the target track on demand.
- `setGameIntensity(0..1)` is called every rAF frame in `Game.tsx` with `|speed| / maxSpeed`. Short-circuits within `INTENSITY_EPSILON` so 60 Hz calls are effectively free. Only affects the game track; title and pause ignore intensity.
- `fadeTrackTo(track, 0, fadeSec)` schedules a per-track prune timer that disconnects the gain node and removes the track from the map once the fade completes. This replaced an earlier central `stopMusic` timer and eliminates silent-work scheduling for faded-out tracks.
- First-gesture unlock is encapsulated in `music.ts`; callers never install their own listeners.

### Build log

- `src/game/music.ts` owns the engine, scheduler, voice helpers (`schedNote`, `schedKick`, `schedNoise` shared by snare and hat with a cached noise buffer per kind), the three pattern functions, and `TRACK_CONFIG` (the single source of truth for per-track BPM, root MIDI, scale, step renderer, and target gain). Pure helpers `midiFreq`, `scaleDeg`, and `SCALES` are exported for testing.
- `src/components/TitleMusic.tsx` is a null-rendering client component that calls `startTitleMusic` on mount and `stopMusic` on unmount. Mounted in `src/app/page.tsx`, `src/components/SlugLanding.tsx`, and inside `Game.tsx` (so the countdown still has title music before the race-start crossfade).
- `src/components/Game.tsx` drives the transitions: `crossfadeTo('pause')` on pause, `crossfadeTo('game')` on resume, `crossfadeTo('title')` on restart, and `crossfadeTo('game', RACE_START_CROSSFADE_SEC)` when countdown ends. The rAF loop calls `setGameIntensity(|speed| / DEFAULT_CAR_PARAMS.maxSpeed)` each frame.
- Tests: `tests/unit/music.test.ts` pins `midiFreq`, `scaleDeg` (wrap, octave shift, negative degrees), and the four canonical scale constants.

### SFX

- Countdown beeps: shipped. `playCountdownBeep(isGo)` in `src/game/music.ts` plays a one-shot tone through the shared master gain. A4 square for 3/2/1, A5 triangle for GO.
- Engine drone, pitch-shifted by speed: shipped. `startEngineDrone` / `updateEngine` / `stopEngineDrone` in `src/game/audio.ts`. One persistent sawtooth oscillator into a lowpass biquad and a per-voice GainNode. `RaceCanvas` calls `updateDriveSfx` every rAF frame, which feeds drone frequency, cutoff, and volume from `|speed| / maxSpeed`. `setTargetAtTime` smoothing keeps per-frame writes click-free. Volume ducks to 0 when paused or pre-race; off-track applies an additional small duck so going off the road sounds drier.
- Tire skid: shipped. `startSkid` / `updateSkid` / `stopSkid` in `src/game/audio.ts`. One looping noise buffer through a lowpass biquad and a GainNode. The pure helper `skidIntensity(speed, maxSpeed, steerAbs, onTrack)` proxies a slip-angle-style cue from `steerAbs * speedRatio + (offTrack ? 0.4 : 0)`. Justification: scalar physics has no real slip angle, so we surface the visible cues a player associates with skid (sharp steering at speed, leaving the road).
- Finish-line stinger: shipped. `playLapStinger()` plays a three-note triangle arpeggio (E5, G5, C6) on every completed lap that is not already a PB.
- PB celebration jingle: shipped. `playPbFanfare('pb')` plays a 5-note major arpeggio with a sub-octave triangle layer; `playPbFanfare('record')` adds octave-up doublings on the final two notes plus a kick on beat one. Wired in `Game.tsx::handleLapComplete`: `record` outcome plays the bigger fanfare, `pb` plays the smaller one, otherwise the lap stinger. The visual side lives in `HUD.tsx`: a centered radial-gradient burst plus an inset edge-flash, gold for `record`, green for `pb`. Total animation under 1.2s.
- UI click beeps: shipped. `playUiClick(variant)` schedules a one-shot oscillator (`'soft'` / `'confirm'` / `'back'` variants). The shared hook `useClickSfx(variant)` in `src/hooks/useClickSfx.ts` returns a stable callback. Wired into PauseMenu (every menu button), SettingsPane (close, done, reset, open Tuning Lab), TuningPanel (close, done, reset), Leaderboard (back, race-this-version), and InitialsPrompt (save).
- Off-track rumble: shipped. `playOffTrackRumble()` plays a short low-passed noise burst on the transition from on-track to off-track. Triggered inside `updateDriveSfx` from the `prevOnTrack && !onTrack` edge.
- Pause / restart / exit safety: `silenceAllSfx(0.05)` in `Game.tsx::restart` and the unmount cleanup ramps the continuous voices to 0; one-shots ride out their own sub-second tails. `RaceCanvas` cleanup calls `stopEngineDrone(0.1)` and `stopSkid(0.1)` on unmount.

All SFX share one `AudioContext` and master `GainNode` with the music scheduler via `src/game/audioEngine.ts`. The shared module owns the singleton, the autoplay first-gesture handler, and the keyed noise-buffer cache (`'snare'`, `'hat'`, `'skid'`, `'rumble'`). Pure helpers (`droneFreqHz`, `droneFilterHz`, `droneVolume`, `skidIntensity`, `uiClickEnvelope`) live in `audio.ts` and are unit-tested in `tests/unit/audio.test.ts` against a minimal AudioContext stub.

### Stretch: personalization (later)

- Hash the slug or player initials to perturb music parameters (scale, tempo, lead pattern, bass pattern).
- Explicitly called out as "later" in Section 18. Not v1.

---

## 14. Data Model (Vercel KV via `@upstash/redis`)

**Status.** Done.

Match FrackingAsteroids' client pattern in `src/lib/kv.ts`.

```
track:<slug>:latest             : string (current version hash)
track:<slug>:version:<hash>     : JSON { pieces, createdByRacerId, createdAt }
track:<slug>:versions           : list of { hash, createdAt } (newest first)
track:index                     : sorted set (score = updatedAt) for "load existing"
lb:<slug>:<hash>                : sorted set (score = lapTimeMs, member = "initials:racerId:ts:nonce")
lap:meta:<nonce>                : JSON { tuning, inputMode } per-lap metadata for the leaderboard side-panel
lap:replay:<nonce>              : JSON Replay { lapTimeMs, samples: [x, z, heading][] } for the ghost car
track:<slug>:<hash>:topReplay   : string nonce that points at the active ghost replay for this track version
race:token:<nonce>              : JSON { slug, versionHash, racerId, issuedAt } TTL 15min, deleted on submit
racer:<racerId>:firstSeen       : ISO timestamp (set once on first visit)
racer:<racerId>:lastSubmit      : ISO timestamp (updated on each submit, for audit)
ratelimit:submit:ip:<ip>        : incr, TTL 60s
ratelimit:submit:racer:<id>     : incr, TTL 60s
ratelimit:submit:daily:<ip>     : incr, TTL 24h
```

Anti-cheat tunables (`MIN_SEGMENT_MS`, `MAX_DAILY_SUBMITS`, etc.) mirror Determined's `api/leaderboard.js` values. Start conservative, relax if legitimate players hit limits.

### Build log

- Typed key helpers for every key family plus TTL constants: `src/lib/kv.ts`. Every function takes typed `Slug`, `VersionHash`, `RacerId` (zod-validated at the route boundary) and returns the exact key string documented above.
- Anti-cheat tunables live in `src/lib/anticheat.ts` as `ANTICHEAT_DEFAULTS` (overridable per-call via an `opts` arg). Rate-limit tunables live in `src/lib/rateLimit.ts` as `RATE_LIMITS`. Both are starting conservative.
- Tests: `tests/unit/kv.test.ts` pins the exact key shapes and TTL values so future refactors cannot silently change them.

---

## 15. Tech Stack (concrete)

**Status.** Done for the scaffold. Every dependency below is installed and wired into scripts or the test harness.

| Area            | Choice                                             |
| --------------- | -------------------------------------------------- |
| Framework       | Next.js 15 (App Router)                            |
| UI              | React 19                                           |
| Language        | TypeScript 5                                       |
| 3D              | `three` (raw, no react-three-fiber)                |
| Physics         | Custom math-based integrator plus raycast          |
| Touch           | Custom virtual joystick (ported from FrackingAsteroids) |
| Audio           | Native Web Audio API                               |
| Storage         | `@upstash/redis`                                   |
| Validation      | `zod`                                              |
| Unit tests      | Vitest                                             |
| E2E / smoke     | Playwright                                         |
| Hosting         | Vercel                                             |
| Initial assets  | Kenney Car Kit (CC0 low-poly glTF)                 |

Do not add new dependencies in these categories without user approval. See `AGENTS.md`.

### Build log

- `package.json` pins the listed libraries at the versions above. Scripts: `dev`, `build`, `start`, `lint`, `type-check`, `test`, `test:watch`, `test:e2e`.
- Vitest config at `vitest.config.ts` scopes to `tests/unit/**`. `passWithNoTests: true` keeps the command green between commits that temporarily remove tests.
- Playwright config at `playwright.config.ts` uses `next build && next start` as the webServer command (faster and more realistic than `next dev` on first request). Injects dummy KV env vars for smoke runs so the app does not crash on import.
- Three.js is pinned in `package.json`. The Kenney Car Kit race model ships at `public/models/car.glb` (CC0, Kenney Car Kit v3.1); the shared `Textures/colormap.png` it references sits at `public/models/Textures/colormap.png` so the glb's relative URI resolves. License note at `public/models/KENNEY-LICENSE.txt`. Loaded via `GLTFLoader` from `three/examples/jsm/loaders/GLTFLoader.js`.

---

## 16. Architecture

**Status.** Partial. Directory layout matches the target. Infrastructure (`lib/*`, `game/track.ts`, `middleware.ts`, all API routes including `/api/leaderboard`), core game logic (`game/tick.ts`, `game/physics.ts`, `game/trackPath.ts`, `game/sceneBuilder.ts`, `game/editor.ts`, `game/music.ts`, `game/audioEngine.ts`, `game/audio.ts`, `game/virtual-joystick.ts`), and the React components (`Game`, `HUD`, `Countdown`, `InitialsPrompt`, `PauseMenu`, `FeedbackFab`, `Leaderboard`, `TrackEditor`, `TitleMusic`, `TouchControls`) plus the `useClickSfx` hook are all in.

Mirror FrackingAsteroids' clean split: pure TypeScript game engine, React UI layer, serverless API routes, KV for persistence.

```
src/
  app/
    page.tsx              # home (initials prompt + create/load)
    [slug]/page.tsx       # race page
    api/
      race/start/route.ts
      race/submit/route.ts
      track/[slug]/route.ts
      feedback/route.ts   # ported from Epoch
  components/
    GameCanvas.tsx        # owns the Three.js renderer
    HUD.tsx               # lap time, best, countdown, confirmations
    TrackEditor.tsx       # top-down piece editor
    PauseMenu.tsx
    TitleScreen.tsx
    FeedbackFab.tsx       # ported from Epoch, with mods
    Countdown.tsx         # READY-SET-GO traffic light
  game/
    tick.ts               # pure (state, input, dt) returns state (unit-testable)
    physics.ts            # car integrator
    collision.ts          # raycast to track
    track.ts              # piece geometry + graph + loop validation
    virtual-joystick.ts   # ported from FrackingAsteroids
    music.ts              # streaming synth scheduler
    audio.ts              # SFX
  hooks/
    useGameState.ts
    useKeyboard.ts
    useTouchControls.ts
  lib/
    kv.ts                 # @upstash/redis wrapper
    schemas.ts            # zod schemas (track, submission, token)
    hashTrack.ts          # canonical SHA-256 of piece array
    signToken.ts          # HMAC race token sign and verify
    racerId.ts            # read/write racerId cookie server-side
    consoleCapture.ts     # ported from Epoch
  middleware.ts           # ensures racerId cookie on every request
```

**Game loop pattern (from FrackingAsteroids).** `tick(state, input, frameDeltaMs)` is a pure function that returns the next state. It is unit-tested in isolation. `GameCanvas` runs it each `requestAnimationFrame`. The React HUD reflects state via props and hooks.

### Build log

- Files currently under `src/`:
  - `app/layout.tsx`, `app/page.tsx` (home), `app/[slug]/page.tsx` (race page), `app/[slug]/edit/page.tsx` (editor page), `app/api/race/start/route.ts`, `app/api/race/submit/route.ts`, `app/api/track/[slug]/route.ts`, `app/api/feedback/route.ts`, `app/api/leaderboard/route.ts`.
  - `components/Game.tsx`, `components/HUD.tsx`, `components/Countdown.tsx`, `components/InitialsPrompt.tsx`, `components/PauseMenu.tsx`, `components/FeedbackFab.tsx`, `components/TrackEditor.tsx`, `components/Leaderboard.tsx`, `components/SlugLanding.tsx`, `components/TitleMusic.tsx`.
  - `game/track.ts` (direction helpers + validation), `game/trackPath.ts` (ordering + waypoints + on-track math), `game/tick.ts` (pure state update), `game/physics.ts` (arcade integrator), `game/sceneBuilder.ts` (Three.js scene + camera rig), `game/editor.ts` (cycle-piece helper + grid bounds), `game/music.ts` (Web Audio scheduler + title/game/pause tracks), `game/audioEngine.ts` (shared AudioContext + master gain + autoplay-gesture handler + noise-buffer cache), `game/audio.ts` (engine drone, tire skid, lap stinger, PB / record fanfare, UI clicks, off-track rumble + per-frame `updateDriveSfx`).
  - `hooks/useKeyboard.ts`, `hooks/useTouchControls.ts`, `hooks/useClickSfx.ts`.
  - `game/virtual-joystick.ts`.
  - `components/TouchControls.tsx`.
  - `lib/schemas.ts`, `lib/kv.ts`, `lib/hashTrack.ts`, `lib/signToken.ts`, `lib/anticheat.ts`, `lib/rateLimit.ts`, `lib/racerId.ts`, `lib/consoleCapture.ts`, `lib/defaultTrack.ts`, `lib/localBest.ts`, `lib/leaderboard.ts`, `lib/recentTracks.ts`, `middleware.ts`.
- Path alias `@/*` maps to `src/*` in `tsconfig.json` and `vitest.config.ts`. All imports in code and tests use the alias.
- Route handlers declare `export const runtime = 'nodejs'` so `node:crypto` works directly (`randomBytes`, `createHmac`, `timingSafeEqual`). Middleware stays on the default edge runtime but gates its KV write behind a dynamic import + try/catch so edge runtime limits do not matter here.
- Game loop pattern from FrackingAsteroids holds: `tick(state, input, dtMs, nowMs, path, params?)` is a pure function, fully unit-tested in isolation. `GameSession` runs it each `requestAnimationFrame`. React HUD reflects state via props with a throttled (~20 Hz) update + reference-equality bail-out.
- **Not yet landed.** `components/TitleScreen.tsx`, additional `hooks/*` (useGameState).

---

## 17. Deployment and Manual Setup

**Status.** Done. Vercel project is live, KV is linked across all environments, and `GITHUB_PAT` and `RACE_SIGNING_SECRET` are set. The steps below are kept as a record of what was configured.

These are steps the user performs in external dashboards. Every step is mandatory for a production deploy except where marked optional.

### 1. Create the Vercel project

- Vercel dashboard, "Add New", "Project".
- Import the `VibeRacer` repo from GitHub.
- Framework auto-detects Next.js. Accept defaults.

### 2. Preview deploys

- Automatic once the project is imported.
- Every PR gets a unique preview URL.

### 3. Production deploys on merge

- Automatic.
- Merges to `main` deploy to production.

### 4. Create the KV store

- Vercel dashboard, "Storage" tab.
- "Create Database", select **Upstash for Redis** (or the Vercel KV option if presented; they are compatible).
- Name the database `viberacer-kv`.
- Link it to the VibeRacer project across **Development, Preview, and Production** environments.
- Vercel auto-injects `KV_REST_API_URL` and `KV_REST_API_TOKEN` (or the Upstash equivalents). No code change needed.

### 5. Create the GitHub PAT for the feedback FAB (mandatory)

- GitHub, Settings, Developer settings, Personal access tokens, **Fine-grained tokens**, "Generate new token".
- Repo access: select `VibeRacer`.
- Permissions:
  - `Issues`: Read and write
  - `Contents`: Read and write (needed for screenshot upload to `.github/feedback-screenshots/`)
- Copy the token once generated (it is shown only once).
- Add to Vercel project environment variables as `GITHUB_PAT` in all environments (Development, Preview, Production).

### 6. Set `RACE_SIGNING_SECRET` (mandatory)

- Generate locally: `openssl rand -hex 32`.
- Copy the hex string.
- Add to Vercel project environment variables as `RACE_SIGNING_SECRET` in all environments.
- This key signs the anti-cheat race tokens. Rotating it invalidates all in-flight tokens.

### 7. Update the feedback target repo

- In the ported `app/api/feedback/route.ts`, change the hardcoded `Randroids-Dojo/epoch` to the VibeRacer owner and repo slug.

### Optional

- Add a `CODEOWNERS` file so feedback issues can be auto-assigned.
- Enable Vercel Analytics for traffic insight.

---

## 18. Stretch and Future

**Status.** Out of scope for v1. Listed for awareness.

Not v1. Listed so agents know not to scope-creep into them without approval.

- Car customization (paint, decals, multiple body shapes).
- Music personalization (hash slug or initials to perturb music parameters).
- More track pieces (ramps, banked turns, jumps, 45-degree turns).
- Friend challenges (tap to race a ghost from a link).
- Weather or time-of-day variations per slug.
- Swap the custom physics integrator for Rapier if the arcade model proves insufficient for depth.
