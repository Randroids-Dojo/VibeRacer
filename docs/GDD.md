# VibeRacer: Game Design Document

> **Before editing:** read the repo root `AGENTS.md`. The em-dash ban applies to this file.

---

## Status (last updated 2026-04-19)

**Status key.** Each section below carries a `**Status.**` line. Sections that have shipped also include a `### Build log` subsection recording what landed, the key files, and any non-obvious decisions. This GDD is intended as a record of truth: when code lands, the relevant section is updated.

| § | Section | Status |
| - | - | - |
| 2 | Core game loop | partial (countdown, race, HUD, lap auto-submit, pause, restart all work; edit pending) |
| 3 | Camera and perspective | partial (trailing third-person rig with lerp; tunable sliders pending) |
| 4 | Controls | partial (keyboard WASD/arrows/space + Esc pause; touch joystick pending) |
| 5 | Vehicle | partial (arcade integrator + off-track drag; Kenney model + raycast per wheel pending) |
| 6 | Track system | partial (default track renders in 3D; editor UI still pending) |
| 7 | Routing and user-owned paths | partial (middleware + `/[slug]` page + initials prompt; home UI and settings pending) |
| 8 | Race flow | partial (countdown, checkpoints, lap detection, invalid-lap reset, HUD all live; animated traffic light pending) |
| 9 | Title, menu, pause | partial (pause menu with Resume/Restart/Leaderboards/Exit ships; title screen pending) |
| 10 | Physics tuning (dev panel) | not started |
| 11 | Leaderboards | partial (autosubmit, anti-cheat, leaderboard UI, overall record in HUD all live; PB fanfare and version dropdown pending) |
| 12 | Feedback FAB | partial (API route + React component ship, pause-only visibility wired; deeper copy testing pending) |
| 13 | Audio | not started |
| 14 | Data model | done |
| 15 | Tech stack | done (scaffold present) |
| 16 | Architecture | partial (game loop + Three.js scene + PauseMenu + FeedbackFab landed; editor, audio, touch pending) |
| 17 | Deployment (manual setup) | pending user action |
| 18 | Stretch and future | out of scope |

Infrastructure commit: `703f080` (Next.js + KV + anti-cheat + four API routes). Vertical slice commit: `194bf91` (`/[slug]` route drives a default 8-piece oval with countdown, physics, camera, HUD, and auto-submit). 91 Vitest unit tests and 8 Playwright smoke tests passing; production build green.

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
- Restart: `restart()` sets `pendingResetRef.current = true`; the loop re-inits game state, camera rig, and renders one frame. Phase flips back to `countdown` so the 3-2-1-GO sequence plays again. Tokens and session PB are cleared; all-time PB (persisted in `localStorage`) is preserved.
- **Not yet landed.** Load-existing prompt on a fresh slug, PB fanfare, "Edit Track" entry point from the pause menu.

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

**Status.** Partial. Keyboard (WASD + arrows + Space) plus Esc-to-pause are live. Touch joysticks and the reserved Q/E shift keys are not yet landed.

### Build log

- `src/hooks/useKeyboard.ts` returns `{ current: KeyInput }` (ref-like) where `KeyInput = { forward, backward, left, right, handbrake }`. `keydown`/`keyup` listeners mutate the ref and `preventDefault` for recognized keys.
- Mapping: `W`/`ArrowUp` = forward, `S`/`ArrowDown` = backward (brake/reverse), `A`/`ArrowLeft` = steer left, `D`/`ArrowRight` = steer right, `Space` = handbrake.
- The tick loop reads `keys.current` each frame and synthesizes `{ throttle, steer, handbrake }` for `stepPhysics`.
- Esc pause: handled in `Game.tsx` via a window `keydown` listener that is gated on `phase === 'racing'`. First press calls `pause()`, second press calls `resume()`. See Section 9 for the pause lifecycle.
- **Not yet landed.** Touch joysticks (mobile spec below), remappable bindings, Q/E shifter keys, gamepad.

### Keyboard (default, remappable in Settings later)

| Action          | Keys                  |
| --------------- | --------------------- |
| Accelerate      | `W` or `Up`           |
| Brake / reverse | `S` or `Down`         |
| Steer left      | `A` or `Left`         |
| Steer right     | `D` or `Right`        |
| Handbrake       | `Space`               |
| Shift up        | `E` (reserved)        |
| Shift down      | `Q` (reserved)        |
| Pause           | `Esc`                 |

Manual gearing is a stretch feature. Default car is automatic.

### Mobile touch: floats where you tap

Two virtual joysticks, no fixed positions. Port the custom joystick from `FrackingAsteroids/src/game/virtual-joystick.ts`.

- **Left half of screen.** First touch spawns a steering stick at that point. Horizontal axis steers.
- **Right half of screen.** First touch spawns a gas/brake stick. Up = accelerate, down = brake.
- Both sticks release on touchend and respawn at the next touch point.
- Pause button floats in a corner and is always tappable during a race.

---

## 5. Vehicle

**Status.** Partial. Arcade integrator with off-track drag ships in `src/game/physics.ts`. Car renders as a simple box placeholder (body + cabin + nose marker). Kenney glTF model, per-wheel raycast, and angular velocity are not yet landed.

### Build log

- `src/game/physics.ts` exports `stepPhysics(state, input, dtSec, onTrack, params?)`, `DEFAULT_CAR_PARAMS`, and `PhysicsState` / `PhysicsInput` / `CarParams` types.
- Simplified arcade model: scalar speed + heading, no lateral velocity. Throttle adds `accel * dt`; reverse throttle brakes forward motion first, then accelerates backward at `reverseAccel`. Coasting decays at `rollingFriction`. Handbrake adds a drag proportional to `brake * 1.5`. Off-track applies `offTrackDrag` and caps at `offTrackMaxSpeed`. Steering multiplies by `sign(speed)` so reverse steers naturally.
- Defaults: `maxSpeed=26`, `maxReverseSpeed=8`, `accel=18`, `brake=36`, `reverseAccel=12`, `rollingFriction=4`, `steerRate=2.2`, `minSpeedForSteering=0.8`, `offTrackMaxSpeed=10`, `offTrackDrag=16`.
- On-track detection: `distanceToCenterline(op, x, z) <= TRACK_WIDTH/2` in `tick.ts`. Centerlines: straights use segment distance; corners use `|hypot(x - cx, z - cz) - CELL_SIZE/2|` with `arcCenter` cached on each `OrderedPiece` at build time.
- Car visual: `src/game/sceneBuilder.ts::buildCar` returns a Group of three boxes (body 2.2x1.0x4.2 red, cabin 1.8x0.8x2.2 dark, nose 0.8x0.2x0.6 white). Orientation via `car.rotation.y = state.heading`.
- Tests: `tests/unit/physics.test.ts` covers throttle, max-speed cap, off-track cap, brake-while-moving, coast-to-zero, low-speed steering lockout, and steering while moving.
- **Not yet landed.** Kenney glTF model, angular velocity + quaternion heading, per-wheel raycast, dev-panel tuning (Section 10), `mass`/`downforce`/`forwardGrip`/`lateralGrip` fields from the GDD spec.

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
- **Not yet landed.** Editor UI (`components/TrackEditor.tsx`), save flow wired to `PUT /api/track/[slug]`, S-curve and other new piece types, configurable checkpoint count per track, historical version deep-link via `?v=<hash>`.

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
- **Not yet landed.** Per-slug create-or-load prompt (for an empty slug), Settings screen to edit initials, `?v=<hash>` deep-link handling in `[slug]/page.tsx` (the KV code path already accepts it; the UI does not yet route through it), "latest updated slugs" list on `/`.

---

## 8. Race Flow

**Status.** Partial. Countdown, per-piece checkpoints, lap detection, the full HUD, pause button, and invalid-lap handling are live. Animated traffic-light visuals and synth beeps (Section 13) are not yet landed.

### Build log

- Countdown: `src/components/Countdown.tsx` cycles `3 -> 2 -> 1 -> GO` on an 800 ms interval, then holds GO for 600 ms and fires `onDone`. Currently renders as large text, not the traffic-light graphic. During countdown, `GameSession` keeps the tick loop running but `state.raceStartMs` is null so physics is frozen and the timer shows 00:00.000.
- Lap detection: cell-based. `tick.ts` compares `state.lastCellKey` against the current cell each frame. When the car enters the expected next piece's cell, it records `{cpId, tMs}` where `tMs = nowMs - raceStartMs`. Hitting piece 0 after N-1 CPs fires `LapCompleteEvent` with `{hits, lapTimeMs, lapNumber}` and resets `nextCpId=0`, `hits=[]`, `raceStartMs=nowMs` for the next lap. Lap count increments.
- HUD: `src/components/HUD.tsx` renders CURRENT (big), LAST LAP, BEST (SESSION), BEST (ALL TIME), RECORD (track-wide top time, loaded from KV in the RSC page and passed through), LAP, RACER, plus an OFF TRACK warning and a transient toast for PB / lap-saved messages. Stat blocks share a `StatBlock` subcomponent. `setHud` is throttled to ~20 Hz with a reference-equality bail-out so the tree doesn't re-render unnecessarily.
- Endless loop: no lap cap. Every completed lap triggers `handleLapComplete` which updates local PBs and fires `submitLap` (fire-and-forget).
- Invalid-lap reset: in `tick.ts`, if the car transitions into the start-piece cell while `nextCpId > 0` (i.e., the player has partial checkpoint progress but is re-entering the start without a valid lap completion), `hits` is cleared, `nextCpId` is reset to 0, and `raceStartMs` is set to `nowMs`. The lap counter is not incremented and no `LapCompleteEvent` fires. Covers driving backward through the start line or taking a shortcut that re-enters piece 0 early. Test coverage in `tests/unit/tick.test.ts`.
- Pause button: always-visible circular button at `bottom: 20, left: 16` (rendered only during the `racing` phase and hidden once the pause menu opens). Clicking calls `pause()` which freezes the tick and shows the pause menu.
- **Not yet landed.** Animated 3-light traffic signal, countdown synth beeps (Section 13), per-track configurable checkpoint count.

### Start signal

- Animated traffic light: red, red plus amber, green (GO).
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

---

## 9. Title Screen, Menu, and Pause

**Status.** Partial. Pause menu is live with Resume, Restart, Leaderboards (button present, no-op wired intentionally until §11 ships), and Exit to title. Title screen, Edit Track entry, and Settings entry are not yet started.

### Build log

- `src/components/PauseMenu.tsx` is a dark overlay card with four buttons (Resume highlighted as primary) plus a small "Esc to resume" hint. Pure presentational, no state of its own.
- `src/components/Game.tsx` owns the pause lifecycle: Esc key while `phase === 'racing'` calls `pause()`; clicking the bottom-left pause button does the same. Both `pause()` and `resume()` set `pausedRef.current` synchronously so the RAF loop picks up the state change on the very next frame.
- Pause freezes simulation without drift: on pause, `pauseStartTsRef.current = performance.now()`; on resume, `resumeShiftRef.current += performance.now() - pauseStartTsRef.current`. The loop drains the shift by adding it to `state.raceStartMs` so the lap timer resumes where it left off.
- Restart replays the countdown: `restart()` sets `pendingResetRef.current = true`, clears the token, resets session HUD state, and flips `phase` back to `'countdown'`. The Countdown component remounts and the 3-2-1-GO sequence plays again. All-time PB in `localStorage` is preserved.
- Exit to title uses Next.js's `useRouter().push('/')`.
- Leaderboards button: toggles a sub-view inside the paused overlay. `pauseView: 'menu' | 'leaderboard'` in `Game.tsx` drives which component renders. Leaderboard has a Back button that returns to the menu. Reopening pause always starts on `'menu'`.
- **Not yet landed.** Title screen at `/`, Edit Track entry, Settings entry, always-visible touch pause button (the current pause button works on touch but its sizing is not yet optimized for one-thumb reach).

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
- Settings
- Exit to title

The feedback FAB appears only while paused. See Section 12.

---

## 10. Physics and Controls Tuning (dev-time)

**Status.** Not started.

A collapsible dev panel exposes live sliders for all car and camera parameters. This is for the developer, not shipped as a user-facing feature in v1.

- Gated behind the `~` key or `?dev=1` query param.
- All values persist to `localStorage` under `viberacer.dev.tuning`.
- Not shown in production unless the query param or keystroke is used.
- Includes a "Reset to defaults" button.

A player-facing tuning UI is a stretch feature (Section 18).

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
- **Not yet landed.** Older-version dropdown (`?v=<hash>`), PB fanfare + visual celebration, admin tooling to revoke racers by composite member, pagination beyond top 100.

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

**Status.** Not started.

Pure Web Audio API. No Tone.js. One `AudioContext`, procedural synth voices, scheduled via a 50 ms tick with 120 ms lookahead. Pattern mirrors FrackingAsteroids' `src/game/music.ts` and Determined's `src/music.js`.

### Title music

- Cartoony synth loop.
- Streamed (scheduled) from title screen open.
- Starts on first user gesture (click) to satisfy browser autoplay policies.
- Loops seamlessly.

### In-game music

- Separate loop, driving and upbeat variant.
- Tempo can ramp with speed (intensity pattern from FrackingAsteroids).
- Crossfade with title music on race start.

### SFX

- Countdown beeps.
- Engine drone, pitch-shifted by speed.
- Tire skid (noise burst with low-pass filter) when lateral grip saturates.
- Finish-line fanfare on lap completion.
- PB celebration jingle on new personal best.
- UI click beeps.

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
- Three.js and the Kenney Car Kit are not yet pulled in. Will land with Section 5 (Vehicle).

---

## 16. Architecture

**Status.** Partial. Directory layout matches the target. Infrastructure (`lib/*`, `game/track.ts`, `middleware.ts`, all API routes including `/api/leaderboard`), core game logic (`game/tick.ts`, `game/physics.ts`, `game/trackPath.ts`, `game/sceneBuilder.ts`), and the React components (`Game`, `HUD`, `Countdown`, `InitialsPrompt`, `PauseMenu`, `FeedbackFab`, `Leaderboard`) are all in. Still pending: `TrackEditor`, `TitleScreen`, and the remaining game files (`virtual-joystick.ts`, `music.ts`, `audio.ts`).

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
    Countdown.tsx         # 3-2-1-GO traffic light
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
  - `app/layout.tsx`, `app/page.tsx` (home), `app/[slug]/page.tsx` (race page), `app/api/race/start/route.ts`, `app/api/race/submit/route.ts`, `app/api/track/[slug]/route.ts`, `app/api/feedback/route.ts`, `app/api/leaderboard/route.ts`.
  - `components/Game.tsx`, `components/HUD.tsx`, `components/Countdown.tsx`, `components/InitialsPrompt.tsx`, `components/PauseMenu.tsx`, `components/FeedbackFab.tsx`, `components/Leaderboard.tsx`.
  - `game/track.ts` (direction helpers + validation), `game/trackPath.ts` (ordering + waypoints + on-track math), `game/tick.ts` (pure state update), `game/physics.ts` (arcade integrator), `game/sceneBuilder.ts` (Three.js scene + camera rig).
  - `hooks/useKeyboard.ts`.
  - `lib/schemas.ts`, `lib/kv.ts`, `lib/hashTrack.ts`, `lib/signToken.ts`, `lib/anticheat.ts`, `lib/rateLimit.ts`, `lib/racerId.ts`, `lib/consoleCapture.ts`, `lib/defaultTrack.ts`, `lib/localBest.ts`, `lib/leaderboard.ts`, `middleware.ts`.
- Path alias `@/*` maps to `src/*` in `tsconfig.json` and `vitest.config.ts`. All imports in code and tests use the alias.
- Route handlers declare `export const runtime = 'nodejs'` so `node:crypto` works directly (`randomBytes`, `createHmac`, `timingSafeEqual`). Middleware stays on the default edge runtime but gates its KV write behind a dynamic import + try/catch so edge runtime limits do not matter here.
- Game loop pattern from FrackingAsteroids holds: `tick(state, input, dtMs, nowMs, path, params?)` is a pure function, fully unit-tested in isolation. `GameSession` runs it each `requestAnimationFrame`. React HUD reflects state via props with a throttled (~20 Hz) update + reference-equality bail-out.
- **Not yet landed.** `components/TrackEditor.tsx`, `components/TitleScreen.tsx`, `game/virtual-joystick.ts`, `game/music.ts`, `game/audio.ts`, additional `hooks/*` (useGameState, useTouchControls).

---

## 17. Deployment and Manual Setup

**Status.** Pending user action. All code needed to accept these env vars is in place (`KV_REST_API_URL`, `KV_REST_API_TOKEN`, `RACE_SIGNING_SECRET`, `GITHUB_PAT`). No deploy has happened yet.

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
- In-game physics tuning UI for players (not just dev).
- Share button (copy URL plus personal best to clipboard).
- Music personalization (hash slug or initials to perturb music parameters).
- More track pieces (ramps, banked turns, jumps, 45-degree turns).
- Ghost car of best lap on current track version.
- Friend challenges (tap to race a ghost from a link).
- Weather or time-of-day variations per slug.
- Swap the custom physics integrator for Rapier if the arcade model proves insufficient for depth.
