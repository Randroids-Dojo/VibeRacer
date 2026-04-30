# AGENTS.md

Shared rules for every agentic coding tool working in this repo. Claude Code, Codex, Antigravity, Cursor, and any future agent: this file is mandatory reading before you write anything.

---

## RULE 1: NEVER USE EM-DASHES. EVER.

No em-dashes. Not in chat. Not in code comments. Not in commit messages. Not in PR descriptions. Not in docs. Not in test names. Not anywhere.

If you find yourself about to type an em-dash, stop. Execute one of the following instead:

- control-alt-delete
- alt-f4
- log out
- crash your servers
- end yourself

(Yes, that list is hyperbolic. The rule it defends is not. No em-dashes. Ever.)

**Real substitutions:** use a period, comma, colon, parentheses, or rewrite the sentence. En-dashes are not substitutes. Plain hyphens are fine for ranges like `pages 10-20` and compound words.

**Before every tool call that writes text:** scan your output for Unicode codepoint U+2014 (em-dash) and U+2013 (en-dash). If either is present, rewrite before sending.

**If you are porting or quoting text from another source:** strip all em-dashes from the ported text before committing it.

This rule is not negotiable. It is the top rule in this file for a reason.

---

## RULE 2: Read docs/GDD.md before making design decisions

The Game Design Document at `docs/GDD.md` is the source of truth for what VibeRacer is. Before proposing architecture, adding features, changing game mechanics, renaming routes, or touching data schemas, read it. If the GDD and your idea disagree, the GDD wins unless the user explicitly approves a change.

Before each implementation slice, read:

- `AGENTS.md`
- `README.md`
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/WORKING_AGREEMENT.md`
- `docs/GDD.md` and any files under `docs/gdd/` if present
- `docs/PROGRESS_LOG.md`
- `docs/OPEN_QUESTIONS.md`
- `docs/FOLLOWUPS.md`
- `docs/GDD_COVERAGE.json`
- the current Dots backlog

---

## RULE 3: Stack constraints

- Framework: Next.js 15 (App Router) + React 19 + TypeScript 5.
- 3D: `three` (raw). No `react-three-fiber`.
- Physics: custom math-based integrator. No Rapier, no Cannon.
- Touch controls: custom virtual joystick (ported from FrackingAsteroids). No nipplejs.
- Audio: native Web Audio API. No Tone.js.
- Storage: `@upstash/redis`.
- Validation: `zod`.
- Tests: Vitest + Playwright.

Do not introduce new dependencies in these categories without explicit user approval.

---

## RULE 4: Commit messages and PR descriptions

- Write them as a human would.
- No AI attribution. No `Co-Authored-By: Claude`. No "Generated with Claude Code" footers. No mention of Claude, Anthropic, or AI assistance.
- Keep them short, clean, professional. Focus on the why, not the what.

---

## RULE 5: Autonomous PR loop

Operate continuously until the planned scope is complete.

The main loop definition lives in `docs/IMPLEMENTATION_PLAN.md`. The process contract lives in `docs/WORKING_AGREEMENT.md`. Follow both on every slice.

For every implementation slice:

1. Read the required rule, plan, product, progress, question, followup, coverage, and backlog documents listed in Rule 2.
2. Pick the highest-priority unblocked task from the implementation plan, GDD coverage gaps, followups, and active Dots backlog.
3. Create one branch for one PR-sized slice. Never push directly to `main`.
4. Implement the slice fully using existing project patterns.
5. Add or update tests appropriate to the risk and surface area.
6. Update `docs/PROGRESS_LOG.md`, `docs/GDD_COVERAGE.json`, `docs/OPEN_QUESTIONS.md`, `docs/FOLLOWUPS.md`, and the GDD when the work changes them.
7. Run the required local verification suite. At minimum run dash checks, `git diff --check`, relevant unit tests, and broader checks when the touched surface warrants them.
8. Open a PR.
9. Inspect all PR review comments, including inline and threaded comments from Copilot or other review bots.
10. Fix actionable review comments, reply in-thread when the platform supports it, and resolve threads when resolved.
11. After every push to the PR branch, wait for Copilot or any configured bot reviewer to finish its review pass before merging. The wait is settled only when all required checks are green and at least 60 seconds have passed since the latest PR branch push or latest bot review activity, whichever is later. Re-inspect reviews and review threads after the settled wait. If no fresh bot review appears, record that the bot did not post new feedback after the push.
12. Wait for CI and the preview deploy to pass.
13. Merge only when green, review feedback is handled, Copilot or bot review has settled after the latest push, and the preview deploy is healthy.
14. Pull `main`, verify main CI and production deploy, and smoke test production.
15. Close the completed backlog item with the PR number and verification.
16. Immediately start the next slice.

Do not stop at planning. Do not stop after opening a PR. Do not stop after merge. If blocked, log the blocker clearly, create or update the backlog item, and move to the next unblocked slice if one exists.

Never mark work complete with failing tests, unresolved actionable review comments, a bot review still in flight after the latest push, red CI, or a broken deploy.

---

## RULE 6: Destructive and shared-system actions

Always confirm with the user before:

- `git push --force`, `git reset --hard`, `rm -rf`, dropping KV keys, deleting files or branches.
- Direct pushes to `main` or any protected branch are not allowed.
- Modifying CI/CD configuration.
- Uploading content to third-party services.

A prior approval for one destructive action is not approval for all of them. Ask each time.

---

## RULE 7: When in doubt, ask. And prefer simple consistent flows.

- When a UX decision could go branchy (different behavior per route, per state, per user), default to one consistent rule across all cases.
- Always explain to the user why you are prompting them for input.
- If requirements are ambiguous and a reasonable default would be risky, ask. Otherwise choose the simplest consistent path, document the assumption, and keep moving.

---

## RULE 8: Secrets and environment variables

- Never commit `.env`, `.env.local`, or any file containing credentials.
- Never print secret values in logs, chat, or commit messages.
- The following env vars are expected (set by the user in the Vercel dashboard):
  - `KV_REST_API_URL`, `KV_REST_API_TOKEN` (Upstash or Vercel KV)
  - `GITHUB_PAT` (feedback FAB, mandatory)
  - `RACE_SIGNING_SECRET` (HMAC key for race token signing)
  - `RACER_ID_COOKIE_SECRET` (optional, for signed racerId cookies if used)
  - `LEADERBOARD_ADMIN_TOKEN` (optional, enables guarded leaderboard admin API)

---

## RULE 9: Testing expectations

- New pure game-logic code (anything in `src/game/`) must have Vitest unit tests.
- New API routes must have at least one Vitest test against the route handler plus one Playwright smoke.
- Do not mark a task complete with failing tests.

## RULE 10: Motion and overlay QA

When adding auto-scrolling, credits, animated overlays, portals, or modal UI:

- Verify the visible pixels move, not just that a control says the animation is active.
- Add Playwright coverage that measures a changing DOM rect, transform, canvas pixel, or other observable movement over time.
- Do not pause auto-motion on focus by default. Focus can happen on mount and silently disable the feature.
- If a component portals after first render, start animation effects only after the portal-mounted node exists.
- For modal overlays, set z-index above every fixed interactive app surface and confirm background controls cannot sit above the dialog.
- Preserve normal keyboard activation on focused buttons and form controls. Do not let global Space or Enter handlers swallow native button behavior.
- Expose toggle state with `aria-pressed` or equivalent accessible state.

---

## Quick pre-commit checklist

1. No em-dashes. Run `grep -rn $'\u2014' .` (checks for codepoint U+2014). Must return nothing.
2. No AI attribution in the commit message.
3. Tests pass locally.
4. GDD is still accurate, or updated.
5. No secrets in the diff.
