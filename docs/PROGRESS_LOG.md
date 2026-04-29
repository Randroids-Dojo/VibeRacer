# Progress Log

Newest entries first. Every implementation slice adds an entry.

## 2026-04-29, Forza-lite Gamepad Rumble (Xbox 360 dual rumble)

- Branch: `claude/add-haptic-feedback-xbox-01QX1`
- PR: #34
- Changed: extended the existing haptics module with Gamepad API rumble (`vibrationActuator.playEffect('dual-rumble', ...)`, with a legacy `hapticActuators[0].pulse` fallback), added a per-frame continuous mapper (`src/lib/gamepadRumble.ts`) that drives engine purr / off-track chassis bias on the strong motor and slip / brake-lock on the weak motor, wired the per-frame loop in `RaceCanvas.tsx` plus impulse outcomes (`lap`, `pb`, `record`, `offTrack`) from `Game.tsx`, exposed the active pad as a ref from `useGamepad`, and split the Settings haptics control into two pickers (Touch haptics + Gamepad rumble) with backfill defaults for legacy stored payloads.
- Verification: dash checks, `git diff --check`, JSON parse for `docs/GDD_COVERAGE.json`, `npm run test -- haptics gamepadRumble controlSettings gamepadInput`, `npm test`, `npm run type-check`, `npm run build`, `npm run lint` (only pre-existing TouchControls warning remained).
- Assumptions: Xbox 360 controllers expose `vibrationActuator` in modern Chromium and `hapticActuators` on legacy WebKit / Firefox builds, so the dual-path defensive helpers cover both. The `RUMBLE_EPSILON = 0.02` dedupe is small enough that a smoothly-changing speed ramp still feels continuous on the motor without flooding `playEffect` 60x/sec at steady state.
- GDD coverage: advances Section 13 (Audio / haptics) with the new gamepad rumble row alongside the existing Vibration API path.
- Followups: collision-magnitude impulses (require collision events from the physics integrator), wrong-way and achievement-unlock outcomes, per-channel intensity slider, and trigger rumble for Xbox One / Series controllers (`trigger-rumble` effect, not 360).

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
- PR: pending
- Changed: rendered shared menu overlays through a document-body portal so fixed positioning is viewport-relative, corrected modal box sizing, and made Settings tab panels own their own scroll area while the header and tabs stay in view.
- Verification: dash checks, `git diff --check`, `npm run type-check`, `npm test`, focused Playwright settings smoke, full Playwright smoke, `npm run build`, and browser screenshot at `test-results/settings-vehicle-after.png`.
- Assumptions: moving `MenuOverlay` to a portal is the simplest consistent fix for both title Settings and in-race pause Settings because both use the same menu component.
- GDD coverage: refines Section 9 menu usability without changing game rules or data.
- Followups: none recorded.

## 2026-04-29, Track Biome Selection

- Branch: `feature/track-biomes`
- PR: pending
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
- PR: pending
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
