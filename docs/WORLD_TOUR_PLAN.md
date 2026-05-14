# Plan: Top Gear 2 style World Tour mode

## Context

VibeRacer today is a Time Attack arcade: one player, one ghost, one URL per track. The proposal is a new top-level mode that captures the Top Gear 2 (1993) World Tour loop:

- 8 themed tours, 4 races per tour, fixed running order.
- 12 car grid (player plus 11 AI), live wheel-to-wheel racing.
- Placement-points scoring aggregated across the 4 races of a tour.
- A required-standing gate per tour. Failing the gate retires the player from that tour. Passing unlocks the next.
- Persistent career save: money, owned car(s), upgrade state, current tour cursor, completed tours.
- Garage between races: repair damage, refuel, upgrade parts, buy a new car.
- Per-region weather and difficulty escalation across the 8 tours.
- Iconic music per region (VibeRacer already has the Music mode infrastructure to compose this).

The prior art is `../VibeGear2`, where this loop is fully implemented in a pseudo-3D engine. The hard design questions are answered there. The new work in VibeRacer is:

1. Port the data, scoring, and progression primitives, adjusted for VibeRacer's data shapes.
2. Build a live multi-car race loop on top of VibeRacer's existing single-car physics. Derby has multi-car presence but a brawl AI, not a racing AI.
3. Layer career persistence on top of VibeRacer's existing localStorage and KV schemes.
4. Expose the mode through a `/tour` route and a top-level entry point on the home page.

## Non-negotiable constraints

- **Existing modes keep working.** Time Attack at `/[slug]`, Derby at `/derby`, Drag at `/drag`, Tune at `/tune`, Music at `/music`. World Tour is additive.
- **Existing track hashes do not change.** Tour tracks are regular VibeRacer tracks tagged with an optional manifest field. A non-tour track produces the same canonical JSON and hash it does today.
- **Single-player Time Attack physics path is the canonical reference for car feel.** The World Tour race loop calls the same `stepPhysics` per car so a tour car drives exactly like the Time Attack car at the same inputs.
- **No em-dashes anywhere.** Rule 1 of `AGENTS.md`. Plain hyphens, commas, parentheses, colons, periods, semicolons, or rewrites. No exceptions in code, comments, commit messages, or docs.
- **Deterministic replay across the full race.** A given seed and identical inputs must reproduce identical final standings. VibeGear2 enforces this with seeded RNG threaded through every AI driver and every shake offset.

## Scope decisions

| Question | Decision |
|---|---|
| Field size for the MVP | **4 cars** (player plus 3 AI). 12 is the long-term target but the AI driver, the multi-car physics scan, and the renderer all carry less risk at 4. Phase 4 scales to 8, Phase 6 to 12. |
| AI driver source | **Port `../VibeGear2/src/game/ai.ts` as a starting point.** Adapt for VibeRacer's 3D arcade physics (top-down camera, Three.js geometry). Reuse the launch-lane-hold, follow-distance throttle, racing-line bias, overtake offset, and mistake / brilliant decorators. Drop the per-archetype targetSpeedScalar variation for v1. |
| Track set for the MVP | **One tour ("Velvet Coast") with 4 hand-authored tracks built in the existing editor.** Tracks are tagged via a new optional `tour: { id: string; index: number }` field in the track manifest. The track editor and Time Attack are unaware of the tag. |
| Grid spawn | **3 lanes by 4 rows for the 12-car target, 2 lanes by 2 rows for the 4-car MVP.** Spawn x derived from track centerline plus per-lane offset. Spawn z is `-(GRID_OFFSET + index * ROW_SPACING)` behind the start line, matching the VibeGear2 pattern in `aiGrid.ts`. |
| Career persistence | **localStorage `viberacer.worldTour.career` for the source of truth. Optional KV mirror under `worldTour:career:{slug}` keyed by the player's initials**, so a player who sets initials can resume on another device. The slug namespace lets us version migrations cleanly. |
| Garage flow for the MVP | **Repair-only.** A single full-repair button at a flat per-percent cost. Refuel happens automatically between races. Phase 3 adds parts upgrades. Phase 5 adds the car-buy market. |
| Money model | **TG2-style purse per race based on placement, plus a tour-completion bonus.** Failing to qualify still pays the race purse (TG2 did this too) so a player can grind a single tour to fund upgrades. |
| Pass / fail gate | **Player standing in the aggregate placement points after race 4 must be at or above `tour.requiredStanding` (1-indexed)**. Top 4 of 12 for the easy tour, top 1 of 12 for the final tour. Same shape as VibeGear2. |
| Failure flow | **On gate fail: keep the player's money and upgrades, clear the tour cursor, mark the tour as "attempted but unfinished", and route back to the World Tour selection screen.** No permadeath. Repeating the same tour is allowed and the prior attempt's results are overwritten (TG2 lets you retry). |
| Race weather and time of day | **Per-tour, fixed for the MVP**. Velvet Coast is "clear, day." Later tours pick from the existing `WEATHER_NAMES` set. No per-race weather variance in v1. |
| Render strategy for opponents | **Reuse the Derby `DerbyCanvas` pattern.** Derby already renders multiple cars in one 3D scene; the World Tour race scene is a `RaceCanvas` variant that instantiates N car meshes from the same low-poly model and ticks each per frame. |
| Music | **Reuse VibeRacer's Music mode infrastructure to compose one track per tour.** Music plays in the race scene. The first tour ships with a placeholder loop; the actual region music can land in a follow-up. |
| Pause behavior | **Mid-race pause works the same as Time Attack.** Pausing freezes physics for every car (player and AI) so determinism is preserved. |

## Phasing

Each phase is intended to be one PR-sized slice with its own branch, its own tests, and its own coverage / followup updates. Phases must land in order because each one assumes the prior phases work.

### Phase 0: shared scaffolding

Pure setup. No user-visible change unless someone navigates to `/tour` (Phase 1 lands the route).

**0a. Career save schema.** New module `src/game/worldTourCareer.ts`:

- `WorldTourCareer` type: `{ version: 1, money: number, ownedCarIds: string[], activeCarId: string, completedTourIds: string[], unlockedTourIds: string[], activeTour: ActiveTour | null }`.
- `ActiveTour = { tourId, raceIndex, results: TourRaceResult[] }`.
- `TourRaceResult = { trackId, placement, dnf, cashEarned }`.
- `defaultCareer()` returns the seed save (1000 credits, first tour unlocked, one starter car).
- All migrations are forward-only and accumulate in this file. Bump `version` when shape changes; never break a v1 save.

Tests under `tests/unit/worldTourCareer.test.ts`: defaultCareer is stable, migrations are pure, deep clone never references inputs.

**0b. Career storage.** New module `src/lib/worldTourCareerStorage.ts` mirroring the shape of `dailyStreakStorage.ts`:

- `readCareer(): WorldTourCareer` returns a sanitized careering save from `localStorage["viberacer.worldTour.career"]`, defaulting to `defaultCareer()` on missing, malformed, or schema-rejected payloads.
- `writeCareer(next): { ok: true } | { ok: false, reason }` validates, persists, and dispatches a `viberacer:world-tour-career-changed` CustomEvent for live UI updates.
- Round-trip read / write tests, SSR safety, quota-exception silence.

**0c. Championship data.** New `src/lib/worldTourChampionship.ts` and `src/data/worldTourChampionship.ts`:

- `Tour = { id, name, region, requiredStanding, trackIds: string[4], aiDriverIds: string[11] }`.
- `Championship = { id, name, tours: Tour[] }`.
- Bundle one championship `world-tour-standard` with one tour `velvet-coast` and four placeholder trackIds that resolve to authored tracks in 0d.
- Pure helpers `findTour(championship, id)`, `nextTourOf(championship, id)`, frozen at module scope.

**0d. Tour track manifest.** Extend the track manifest schema with an optional `tour: { id: string; index: number }` field. A track with `tour.id === 'velvet-coast'` and `tour.index === 0` is the first race of Velvet Coast. The field is omitted from canonical track JSON when absent so existing track hashes do not change. Add `tests/unit/tourTrackManifest.test.ts` covering presence / absence / hash invariance.

Author the 4 Velvet Coast placeholder tracks via the editor and commit them under a new `public/tours/velvet-coast/` static directory plus a `tour-tracks.json` index. Tracks must form a closed loop (existing constraint) and each declares its place in the tour.

**0e. AI grid spawn primitive.** Port `src/game/aiGrid.ts` from VibeGear2 to `src/game/worldTourGrid.ts`. Inputs: track spawn anchor, lane count, ai driver roster, optional seed. Output: per-grid-slot `{ startX, startZ, lane, driverId, seed }`. Same shape as VibeGear2's `spawnGrid`. Lane width derived from VibeRacer's `widthAt(piece, t)` at the start segment.

**0f. AI driver controller.** Port `src/game/ai.ts` from VibeGear2 to `src/game/worldTourAi.ts`. Adapt for VibeRacer's 3D physics:

- `tickAi(driver, aiState, aiCar, player, track, raceState, stats, otherAiCars, dt) -> { input, nextAiState }`.
- Include the launch-lane-hold (`LAUNCH_LANE_HOLD_M = 200`), follow-distance throttle (`FOLLOW_DISTANCE_METERS = 14`, `FOLLOW_LANE_THRESHOLD_METERS = 2.4`, `FOLLOW_SPEED_BUFFER_M_PER_S = 1`), racing-line bias, traffic lane pressure, and overtake offset. These were tuned through user playtesting in VibeGear2 PRs #221 and #222.
- One archetype (`'clean_line'`) for v1; drop the per-archetype behavior table for now.
- Tests under `tests/unit/worldTourAi.test.ts`: launch hold (no steer at z=0 for an off-center car), racing line resume past the hold, follow-distance cap (close same-lane leader caps target speed, distant leader does not, adjacent-lane leader does not), full-throttle when below target on a straight.

Phase 0 verification: `npm run type-check`, `npm test` for the new unit suites, dash check, `npm run build`. No user-visible change yet.

### Phase 1: minimum playable single-tour race loop

The MVP. One tour, four races, four cars per race, no garage. Player can pass or fail the tour.

**1a. Multi-car race session reducer.** New module `src/game/worldTourRaceSession.ts` modeled on VibeGear2's `raceSession.ts`:

- `RaceSessionState = { tick, phase: 'countdown' | 'racing' | 'finished', countdownRemainingSec, elapsedMs, player: { car, lap, status, finishedAtMs, ... }, ai: AiCar[], totalLaps, finishingOrder }`.
- `createRaceSession(config)` seeds the grid via 0e and initial AI state via 0f.
- `stepRaceSession(state, playerInput, config, dt)` advances every car: countdown gate, per-car physics via existing `stepPhysics`, per-car lap rollover on finish-line crossing, per-car DNF detection (60 s of no progress, 30 s off-track, wreck threshold), per-pair car-car contact damage and lateral kick (port `BUMP_KICK_BASE_MPS` from VibeGear2's `carContactKick` work).
- All AI input flows through the controller from 0f.
- Tests under `tests/unit/worldTourRaceSession.test.ts`: countdown ticks, racing phase integrates physics for player AND AI, deterministic under identical inputs and seed, finishing order resolves on the last car's last lap, DNF flips status without freezing the standings.

**1b. Race result builder.** New `src/game/worldTourRaceResult.ts` modeled on VibeGear2's `raceResult.ts`:

- `PLACEMENT_POINTS` constant: index 0 (winner) gets 10, 1 gets 7, 2 gets 5, 3 gets 3, etc.
- `buildRaceResult({ finalState, save, track, championship, tourId, trackIndex, playerCarId })` returns `{ trackId, totalLaps, finishingOrder, playerPlacement, pointsEarned, cashBaseEarned, bonuses, nextRace, tourProgress }`.
- `nextRace` is the next track card in the tour, or null on the final race.
- `tourProgress = { tourId, raceIndex, nextRaceIndex, completed: boolean, passed: boolean | null, playerStanding: number | null }` so the results screen can render the right CTA.
- Tests cover placement points table, DNF contributes zero, tour-complete vs mid-tour result shape, deterministic across runs.

**1c. Tour progress reducer.** New `src/game/worldTourProgress.ts` modeled on VibeGear2's `tourProgress.ts`:

- `applyRaceResult({ career, raceResult, championship, playerCarId }) -> { career: WorldTourCareer, raceResult: with tourProgress filled }`.
- Mid-tour: append the result, advance `activeTour.raceIndex`.
- Final race: aggregate the four results into a `TourCompletionSummary` (passed / failed, final standing), clear `activeTour`, and on pass append `tourId` to `completedTourIds` and add the next tour to `unlockedTourIds`.
- Pure on inputs. Tests in `tests/unit/worldTourProgress.test.ts` cover mid-tour advance, final pass, final fail, idempotence under re-application.

**1d. Tour selection page.** New route `/tour` (`src/app/tour/page.tsx`):

- Reads career via 0b, builds a "World Tour view" (one card per tour: name, region, race count, required standing, state of "available" / "completed" / "locked").
- One enabled "Enter tour" button per available tour.
- On click: write `activeTour = { tourId, raceIndex: 0, results: [] }` to the career, route to `/tour/race?tour={tourId}&raceIndex=0`.
- Existing pattern from VibeGear2's `src/app/world/page.tsx`. Resume behavior: if `activeTour.tourId === clickedTour.id`, preserve the cursor so the player resumes at the saved race index.

**1e. Tour race page.** New route `/tour/race` (`src/app/tour/race/page.tsx`):

- Loads the championship, the tour's track at the given `raceIndex`, the player's active car stats, and the saved career.
- Mounts a `WorldTourCanvas` (port `RaceCanvas`'s Three.js scene; instantiate N car meshes from the existing player car geometry).
- Wires keyboard / gamepad / touch input to the player car only. Pause menu freezes the whole session.
- On race finish (countdown to 0 after every car has crossed final line or DNF'd): build the race result via 1b, persist via 1c, route to `/tour/results?tour={tourId}&raceIndex={i}`.

**1f. Tour results page.** New route `/tour/results` (`src/app/tour/results/page.tsx`):

- Reads the most recent race result from sessionStorage (set by 1e on race finish).
- Renders finishing order, placement points, cash earned, tour progress summary.
- "Continue tour" CTA appears when `tourProgress.nextRaceIndex !== null` and routes to `/tour/race?tour={tourId}&raceIndex={nextRaceIndex}`.
- Final-race result shows "Tour complete. Top 4 of 12." or "Tour failed. Final standing: 7." in place of the continue CTA.

**1g. Home page entry point.** Add a "World Tour" tile to `src/app/page.tsx`. Tile shows the player's current career snapshot (money, active tour, last race standing) when a save exists, or "Start your career" when fresh.

Phase 1 verification: full unit suite, `npm run build`, Playwright smoke covering enter-tour, complete-race-1, see-results, continue-to-race-2, complete-tour-pass, see-tour-complete-summary. Browser playthrough confirming the AI field actually races (port the `?debug=ai` overlay from VibeGear2's PR #221 so DNFs can be spotted at a glance).

### Phase 2: garage between races (repair + money UI)

**2a. Garage page.** New route `/tour/garage` (`src/app/tour/garage/page.tsx`):

- Reads career, active car damage state, repair cost (TG2-style: flat per-percent-damage at a base rate plus a small markup per tour difficulty).
- One "Repair fully" button. Insufficient funds disables the button with a hint.
- A summary panel: active car name and tier, money on hand, race purse from the last race, next race info.
- "Start next race" CTA routes to `/tour/race?tour={tourId}&raceIndex={i}`. This becomes the default jump between races; results page redirects here when `nextRaceIndex !== null`.

**2b. Damage propagation across races.** Car damage state lives in career save (`activeCar.damage`). Race session reads it on `createRaceSession`. Race results write the post-race damage back to career. Repair button zeroes damage and deducts cash.

**2c. Tests.** `tests/unit/worldTourGarage.test.ts` covers repair-cost math, insufficient-funds path, idempotence, damage round-trips through a 4-race tour.

### Phase 3: car upgrades (engine, tires, brakes, body)

**3a. Upgrade schema.** Extend `CarSpec` with per-zone tier integers (`engine: 0..3`, `tires: 0..3`, `brakes: 0..3`, `body: 0..3`). Tier 0 is stock. Each tier raises the corresponding stat (`stats.topSpeed`, `gripDry`, `brake`, `durability`) by a fixed step.

**3b. Upgrade UI.** Extend the garage page with an "Upgrades" tab. Per-zone "buy next tier" buttons; pricing curve `BASE_TIER_COST * (tier + 1)`. Buttons disabled when insufficient funds or already max.

**3c. Race wiring.** AI cars use their tour-defined tier set; the player car reads tiers from the career save. Verify the placement gap between a stock car and a tier 3 car is meaningful on at least one tour.

**3d. Tests.** Upgrade-cost curve, save round-trip, applied stats match the tier table, fresh career has a stock tier set.

### Phase 4: scale the field to 12 cars and add additional tours

**4a. Field-size scale to 12.** Update grid spawn to support 3 lanes by 4 rows. Verify the AI driver controller's launch hold and follow-distance behavior still keep the wreck count low (port the `?debug=ai` overlay from VibeGear2 PR #221 to assert "8 of 11 cars still racing at 10 s" or better).

**4b. Tour 2 ("Iron Borough") and Tour 3 ("Ember Steppe").** Author 4 tracks per tour via the editor. Author tracks under `public/tours/{tour-id}/`. Tour 2 lifts required standing to top 3; Tour 3 to top 2. Drop in weather variation: Iron Borough is "cloudy," Ember Steppe is "rainy."

**4c. Region theming.** Each tour gets a region color palette, sky preset, and weather pin. Reuse VibeRacer's existing `WEATHER_NAMES` and per-track mood preset system. The tour page surfaces the region theme on each card.

**4d. Tests.** Multi-tour pass: completing Tour 1 unlocks Tour 2; completing Tour 2 unlocks Tour 3. Idempotence on re-pass.

### Phase 5: car buying

**5a. Car market.** Extend garage with a "Buy" tab listing all cars known to the championship the player has not yet bought. Pricing is tier-weighted. Buying adds to `ownedCarIds` and sets the new car as `activeCarId`.

**5b. Car damage carries per car.** `activeCar.damage` becomes `damageByCarId: Record<string, DamageState>`. Each owned car has its own damage trail. Switching active car reloads the right damage state at race start.

**5c. Tests.** Buy flow round-trips through career save. Switching active car preserves both cars' damage states. Insufficient funds path.

### Phase 6: remaining tours (4 through 8) and polish

**6a. Remaining tours.** Tour 4 "Breakwater Isles" (top 3), Tour 5 "Glass Ridge" (top 2), Tour 6 "Neon Meridian" (top 2), Tour 7 "Moss Frontier" (top 1), Tour 8 "Crown Circuit" (top 1). Each gets 4 authored tracks, a region color palette, and a fixed weather.

**6b. Tour music.** Compose one music loop per tour in the existing Music mode and bake it into a tour-music manifest. The race canvas plays the tour music in the background.

**6c. Race intro card.** Brief 2 second card before the countdown showing the tour name, region, race index out of 4, weather, and current standing.

**6d. Tour complete celebration.** Confetti, music sting, championship summary screen on the final-race pass. Reuse the existing `ConfettiOverlay` component.

**6e. KV career sync.** Optional. When the player has initials set, mirror the career to `worldTour:career:{initials}` so they can resume on another device. Settings-controlled and clearly opt-in.

**6f. Final polish.** Audio: brake squeal, tire scrub, crash thud, wreck stinger, lap chime. Visual: checkered finish-line stripe (port from VibeGear2 PR #221), opponent-proximity warning indicator, leaderboard popup on personal best lap, damage indicator HUD widget.

## Risks and open questions

- **Live multi-car physics determinism.** VibeRacer's physics step is single-car today. We need a deterministic ordering for the per-pair contact scan and lateral kick application. VibeGear2's `raceSession.ts` orders by car id (player first, AI by grid slot). Port that ordering exactly. Open: confirm `stepPhysics` is pure on its inputs across multiple invocations per tick.
- **Performance at 12 cars in 3D.** Three.js draw count grows linearly with the field; AI tick cost grows linearly too. Profile after Phase 1 (4 cars). Decide whether to LOD opponents past a depth threshold.
- **Tour track authoring throughput.** 8 tours by 4 tracks is 32 hand-authored tracks. Time-box this and accept "first 3 tours are authored, the rest are procedurally seeded" if needed. Track the open authoring backlog in `docs/FOLLOWUPS.md`.
- **Existing track schema migrations.** The optional `tour` manifest field has to round-trip through `hashTrack` without changing the canonical JSON for non-tour tracks. Reuse the omission pattern from Track Features Phase 0e.
- **Music mode reuse.** Composing 8 tour loops in the existing Music mode is its own creative project. May want a placeholder loop for v1 and treat music as a Phase 7.

## References

Prior art in `../VibeGear2`. Files cited above pin the patterns that work:

- `src/game/championship.ts`: tour primitives (`enterTour`, `recordResult`, `tourComplete`, `unlockNextTour`), stipend hooks, standings math.
- `src/game/tourProgress.ts`: per-race apply, mid-tour vs final-tour handoff, save mutation contract.
- `src/game/raceSession.ts`: multi-car reducer, countdown, lap counting, DNF detection, car-pair contact damage.
- `src/game/raceResult.ts`: placement points, bonuses, next race card, tour progress payload for the results screen.
- `src/game/ai.ts`: clean-line AI controller, launch lane hold (`AI_TUNING.LAUNCH_LANE_HOLD_M`), follow-distance throttle (`AI_TUNING.FOLLOW_DISTANCE_METERS`), racing-line bias, overtake offset.
- `src/game/aiGrid.ts`: grid spawn (3 lanes by 4 rows), seed-driven driver shuffle.
- `src/components/world/worldTourState.ts`: world tour view builder, lock / unlock predicates.
- `src/app/world/page.tsx`: tour selection screen.
- `src/app/race/page.tsx`, `src/app/race/results/page.tsx`: race canvas plumbing, results CTA chains.

The VibeGear2 work is the canonical reference design. When porting, match the names where reasonable so a future reader can follow both codebases without re-deriving the semantics.
