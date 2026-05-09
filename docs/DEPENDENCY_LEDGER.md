# Dependency Ledger

Watched dependencies for VibeRacer. The agent runs the **Dependency Upgrade Gate** at two trigger points:

1. **After every push to `main`** (after pulling main and verifying production), before picking the next slice.
2. **Before opening a new PR**, so the new branch starts from a fresh-deps baseline.

If a watched dep has a newer release than the version pinned in this ledger, the upgrade is the next slice (unless red CI / broken main / a P0 incident takes over).

---

## Watch list

Update the **Currently pinned** line in the same PR that bumps the version.

### `@randroids-dojo/vibekit`

- **Why watched**: internally maintained, pre-1.0, breaking changes possible on every release. VibeRacer consumes the kit's portable + server modules.
- **Source**: https://github.com/Randroids-Dojo/VibeKit/releases
- **Pin format**: `github:Randroids-Dojo/VibeKit#vX.Y.Z` (tag-pinned).
- **Currently pinned**: `v0.1.0`
- **Detect-new**: `gh api repos/Randroids-Dojo/VibeKit/releases/latest --jq .tag_name`
- **Migration notes**:
  - Pre-1.0 means any release may break callers (release-please uses `bump-patch-for-minor-pre-major`, so feat-level changes still ship as patches and may carry signature changes).
  - Read the kit's `CHANGELOG.md` between pinned and target tag.
  - Type errors usually surface in `pnpm type-check`. Smoke any feature that imports from the kit.

---

## Upgrade procedure

For each dep with a newer release, run one PR per dep:

### 0. Skip rule

If a higher-priority slice is in flight (red CI, P0 incident, broken `main`, broken deploy), defer the upgrade and add a backlog item.

### 1. Detect

Run the dep's **Detect-new** command. Compare to **Currently pinned**. If equal, gate passes; pick a regular slice. If newer, continue.

### 2. Read the upstream CHANGELOG

Open the dep's CHANGELOG between the pinned and target version. List every breaking change and migration the bump implies BEFORE editing project code.

### 3. Branch

`chore/deps/<dep-short-name>-<from>-to-<to>` (example: `chore/deps/vibekit-0.1.0-to-0.1.4`). One dep per branch.

### 4. Bump the pin

Update `package.json` (or the project's equivalent) and the **Currently pinned** line in this ledger. Run `pnpm install` (or the project's lockfile-refresh).

### 5. Type-check

If failures look like trivial signature shifts, fix them in this PR. If they require deeper migration, **abort**: revert the pin change, file an `F-NNN` followup for the migration work, add a backlog item, resume the regular loop without the bump.

### 6. Tests

Project-appropriate. Same decision rule: trivial fixes belong in the bump PR, deep migrations get their own.

### 7. Build

Run the production build before opening the PR if the dep affects runtime code.

### 8. Smoke test

Run smoke tests for any feature that imports from the upgraded dep.

### 9. Open the PR

- **Title**: `chore(deps): bump <dep> from <from> to <to>`.
- **Body** must include: link to the CHANGELOG diff, breaking changes that applied, migrations applied, verification commands run, and the new **Currently pinned** value.

### 10. Merge through the standard flow

CI green, bot review settled, preview deploy green, then merge. Pull `main`. Verify production deploy. Smoke test production for touched flows.

---

## When to add a dep here

Add when the dep is internally maintained, critical infrastructure (framework / runtime major, security-sensitive lib), or has bitten the project before with an unexpected upgrade-time breakage. Commodity deps with slow major cadence go through standard semver / lockfile churn (Renovate / Dependabot), not this ledger.
