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

## RULE 5: Destructive and shared-system actions

Always confirm with the user before:

- `git push --force`, `git reset --hard`, `rm -rf`, dropping KV keys, deleting files or branches.
- Pushing to `main` or any protected branch.
- Creating, closing, or commenting on PRs or issues on the user's behalf.
- Modifying CI/CD configuration.
- Uploading content to third-party services.

A prior approval for one destructive action is not approval for all of them. Ask each time.

---

## RULE 6: When in doubt, ask. And prefer simple consistent flows.

- When a UX decision could go branchy (different behavior per route, per state, per user), default to one consistent rule across all cases.
- Always explain to the user why you are prompting them for input.
- If requirements are ambiguous, use AskUserQuestion rather than guessing.

---

## RULE 7: Secrets and environment variables

- Never commit `.env`, `.env.local`, or any file containing credentials.
- Never print secret values in logs, chat, or commit messages.
- The following env vars are expected (set by the user in the Vercel dashboard):
  - `KV_REST_API_URL`, `KV_REST_API_TOKEN` (Upstash or Vercel KV)
  - `GITHUB_PAT` (feedback FAB, mandatory)
  - `RACE_SIGNING_SECRET` (HMAC key for race token signing)
  - `RACER_ID_COOKIE_SECRET` (optional, for signed racerId cookies if used)

---

## RULE 8: Testing expectations

- New pure game-logic code (anything in `src/game/`) must have Vitest unit tests.
- New API routes must have at least one Vitest test against the route handler plus one Playwright smoke.
- Do not mark a task complete with failing tests.

---

## Quick pre-commit checklist

1. No em-dashes. Run `grep -rn $'\u2014' .` (checks for codepoint U+2014). Must return nothing.
2. No AI attribution in the commit message.
3. Tests pass locally.
4. GDD is still accurate, or updated.
5. No secrets in the diff.
