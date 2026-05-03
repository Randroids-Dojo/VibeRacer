# Progress Log

Newest entries first. Every implementation slice adds an entry.

## 2026-05-03, Hash Canonicalization Plumbing

- Branch: `feature/hash-canonicalization-plumbing`
- Changed: added hash canonicalization helpers for future optional track fields. Default `widthClass` values and empty `branchEdges` are omitted from canonical JSON, while non-default width metadata and non-empty branch edges are emitted deterministically. Current template hashes are pinned in tests to guard Phase 0 hash stability.
- Verification: dash checks, `git diff --check`, JSON parse for `docs/GDD_COVERAGE.json`, focused `npx vitest run tests/unit/hashTrack.test.ts tests/unit/schemas.test.ts tests/unit/trackTemplates.test.ts tests/unit/api.track.test.ts` passed with 94 tests, `npm test` passed with 3117 tests, `npm run build` passed with the existing React hook warnings in `RaceCanvas.tsx`, `TouchControls.tsx`, and `useGamepad.ts`, and `npm run type-check` passed after build.
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
