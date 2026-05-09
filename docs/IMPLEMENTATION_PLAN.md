# Implementation Plan

This document is the main operating loop for VibeRacer implementation. Agents must keep working continuously until the planned scope is complete.

## Loop Contract

Every slice follows the same loop:

1. Read `AGENTS.md`, `README.md`, this plan, `docs/WORKING_AGREEMENT.md`, `docs/GDD.md`, `docs/PROGRESS_LOG.md`, `docs/OPEN_QUESTIONS.md`, `docs/FOLLOWUPS.md`, `docs/GDD_COVERAGE.json`, `docs/DEPENDENCY_LEDGER.md`, and active Dots.
2. Run the Dependency Upgrade Gate (see below). If a watched dep is out of date, the upgrade IS the next slice unless red CI takes over.
3. Pick the highest-priority unblocked task from this plan, the dep ledger, coverage gaps, followups, and active Dots.
4. Create one branch for one PR-sized slice.
5. Build the slice completely using existing code patterns.
6. Add or update tests for the touched behavior.
7. Update continuity docs and the GDD coverage ledger.
8. Run local verification.
9. Re-run the Dependency Upgrade Gate before opening the PR. If a watched release landed while the slice was in flight, defer the bump to its own PR.
10. Open a PR.
11. Inspect review comments and threaded inline comments.
12. Fix actionable feedback, reply when useful, and resolve threads.
13. After every push to the PR branch, wait for CodeRabbit or any configured bot reviewer to finish its review pass, then re-inspect reviews and threaded comments. The wait is settled only when all required checks are green and at least 60 seconds have passed since the latest PR branch push or latest bot review activity, whichever is later. If no fresh bot review appears after that, record that no new bot feedback was posted after the push.
14. Wait for CI and preview deploy to pass.
15. Merge only when green and bot review has settled after the latest push.
16. Pull `main`, verify main CI and production deploy, and smoke test production.
17. Close the backlog item with the PR number and verification evidence.
18. Immediately start the next slice.

Do not stop after planning, after opening a PR, or after merging. If a task is blocked, log the blocker in `docs/OPEN_QUESTIONS.md` or `docs/FOLLOWUPS.md`, update the Dots item, and move to the next unblocked slice.

## Dependency Upgrade Gate

Run at two points in the loop:

- **After step 16** (just landed on fresh `main`), before picking the next slice.
- **Before step 10** (opening a PR), to catch new releases that landed while the slice was in flight.

Read `docs/DEPENDENCY_LEDGER.md`. For every watched dep, run its **Detect-new** command and compare against the ledger's **Currently pinned** value. If newer:

1. The upgrade IS the next slice unless slice selection priority 1 (red CI / broken main) takes over.
2. Follow the per-dep procedure in `docs/DEPENDENCY_LEDGER.md` §"Upgrade procedure".
3. If the upgrade requires a migration that cannot land in one PR, abort the bump, log a `F-NNN` followup, and continue with the prior pin.
4. The bump PR updates the ledger's **Currently pinned** line in the same diff that bumps `package.json`. The two must move together.

The gate is mechanical, not optional. A new pinned tag is the same kind of "fresh state" that a new commit on `main` is: the agent observes and reacts.

## Slice Selection

Priority order:

1. Broken `main`, red CI, broken deploy, or failing required checks.
2. Pending dependency upgrades from `docs/DEPENDENCY_LEDGER.md`.
3. Active Dots marked priority 0 or 1.
4. Open `docs/OPEN_QUESTIONS.md` entries that block implementation and have enough information to resolve.
5. High-priority `docs/FOLLOWUPS.md` items.
6. `docs/GDD_COVERAGE.json` gaps marked `not_started` or `partial`.
7. GDD sections with user-visible scope still marked partial.
8. Cleanup that removes blockers, stale docs, or brittle test gaps.

Prefer the smallest slice that creates a useful PR. Avoid mixing unrelated work.

## Definition Of Done

A slice is done only when all apply:

- Code, docs, tests, and coverage ledger match the implemented behavior.
- Required local verification passes.
- PR is open and all actionable review comments are handled.
- CodeRabbit or bot review has finished after the latest push, or no fresh bot feedback appeared after the settled wait.
- CI and preview deploy are green.
- PR is merged.
- Local `main` is updated from remote.
- Main CI and production deploy are green.
- Production smoke test passes or a blocker is logged.
- The Dots item or followup is closed with the PR number and verification.

## Current Planned Scope

Use `docs/GDD.md` as the product scope. The current high-level remaining areas are reflected in `docs/GDD_COVERAGE.json`, with active spillover in `docs/FOLLOWUPS.md`.
