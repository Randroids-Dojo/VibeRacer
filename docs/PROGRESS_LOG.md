# Progress Log

Newest entries first. Every implementation slice adds an entry.

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
