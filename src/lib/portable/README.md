# Portable game modules

Each file in this folder is a standalone TypeScript module designed to be reusable across game projects. The portability contract:

1. **Zero project imports.** No `@/...` imports, no relative imports outside this folder. Each file compiles in isolation.
2. **No framework coupling.** No React, no Next.js, no Vue, no DOM-only globals beyond what the module's domain genuinely needs (e.g. pointer coordinates for the joystick).
3. **Pure TypeScript.** No build step beyond `tsc`. Drop the file into another project and it works.
4. **Documented public API.** Each module's top-of-file comment describes what it exports and how to call it.

Tests live in `tests/unit/` because they pin behavior with Vitest, but each module's logic is independent of the runner. Copy a `.ts` file out of this folder and the matching `.test.ts` from `tests/unit/` and you have a portable bundle.

## Modules

### `virtual-joystick.ts`

Float-where-you-tap virtual joystick state. `createJoystick` / `beginJoystick` / `moveJoystick` / `endJoystick` mutate state from pointer events; `readJoystick` returns a `[-1, 1]` deflection vector clamped at `JOYSTICK_RADIUS`. The module also exports `JOYSTICK_RADIUS` and `JOYSTICK_DEADZONE` as constants; the consumer applies the deadzone (treating any vector with `Math.hypot(x, y) < JOYSTICK_DEADZONE` as zero) so different consumers can pick different thresholds without mutating state. Two instances drive VibeRacer's mobile steering and throttle.

### `editorHistory.ts`

Generic `EditorHistory<T>` undo/redo stack. `createHistory` / `pushHistory` / `undoHistory` / `redoHistory` / `canUndo` / `canRedo`. Push collapses no-op duplicates by reference equality so idempotent setters do not pollute the stack. The past stack caps at `EDITOR_HISTORY_MAX_PAST` to bound memory. VibeRacer wraps `Piece[]`; any other editor can wrap anything.

### `confetti.ts`

Pure particle simulation for celebration overlays. `spawnConfettiBatch` (seeded RNG, count, palette, burst origin), `stepConfetti` (one physics frame), `confettiAlpha` (per-particle fade), `isBatchExpired`. Coordinates are normalized 0-1 viewport space so the renderer multiplies by canvas pixel size at draw time and a window resize never breaks the simulation. The module owns no DOM; the renderer (e.g. a 2D canvas component) drives the loop.

## Adding modules

A module qualifies for this folder when it satisfies all four contract bullets above. The cheapest way to verify is to run `grep "from '@/" <file>` and `grep "import.*react\|import.*next" <file>` and confirm both come back empty. If a module is *almost* portable but reaches into a project type or a settings store, refactor it to accept that as a parameter or interface before moving it here.
