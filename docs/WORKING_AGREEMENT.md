# Working Agreement

This file defines the process rules for implementation slices.

## Branches

- Start every slice from current `main`.
- Branch names should be short and descriptive, such as `feature/manual-shifting`, `fix/leaderboard-pagination`, or `docs/update-coverage`.
- Never push directly to `main`.
- Do not mix unrelated changes in one branch.

## Commits

- Use short human commit messages.
- Do not include AI attribution.
- Keep commits focused. A PR may contain more than one commit when review fixes are added.

## Pull Requests

Every PR must include:

- Summary of user-facing and technical changes.
- Verification commands run.
- GDD, coverage, followup, or open-question updates.
- Any known limitations or blocked checks.

After opening a PR:

- Read flat comments, reviews, and threaded inline comments.
- Treat Copilot or bot review comments as actionable unless clearly incorrect.
- Fix valid comments and push followup commits.
- After every followup push, wait for Copilot or any configured bot reviewer to finish reviewing that pushed commit.
- The bot review wait is settled only when all required checks are green and at least 60 seconds have passed since the latest PR branch push or latest bot review activity, whichever is later.
- Re-read flat reviews and threaded inline comments after each push and after the settled wait. Merge only after bot review is finished or the settled wait confirms no fresh bot feedback appeared.
- Reply when the context would help future readers.
- Resolve threads when fixed.

## Verification

Minimum for docs-only changes:

- `grep -rn $'\u2014' . --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=test-results`
- `grep -rn $'\u2013' . --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=test-results`
- `git diff --check`
- `npm run type-check`

Minimum for code changes:

- Dash checks.
- `git diff --check`.
- `npm run type-check`.
- Relevant Vitest files.
- `npm test` when shared logic, storage, schemas, or game systems are touched.
- `npm run build` before opening or merging PRs that affect runtime code.
- Playwright smoke when UI routes, API routes, routing, or core flows are touched.

Never mark work complete with failing required verification.

## Merge And Deploy

- Merge only through PRs.
- Wait for CI, preview deploy, and Copilot or bot review after the latest push.
- After merge, pull `main`.
- Verify main commit status.
- Verify production deploy status.
- Smoke test production with an HTTP check at minimum. Use deeper browser smoke when UI behavior changed.

## Clarifications

Ask only when ambiguity is expensive or risky. When a simple consistent default is available, choose it, record the assumption in `docs/PROGRESS_LOG.md`, and continue.

## Risk Gates

Always stop for explicit user approval before:

- Force pushes.
- Hard resets.
- Recursive deletes.
- Dropping KV keys or deleting remote data.
- Deleting branches other than branches created for the current completed PR.
- Modifying CI/CD configuration.
- Uploading content to third-party services outside the existing PR and Vercel flow.
- Handling secrets.
