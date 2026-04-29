# Progress Log

Newest entries first. Every implementation slice adds an entry.

## 2026-04-29, Optional Per-Track Shifting

- Branch: `feature/optional-track-shifting`
- PR: pending
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
