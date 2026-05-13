# Followups

Backlog spillover discovered during implementation. Keep items PR-sized when possible.

## High Priority

- None recorded.

## Medium Priority

- Lift `MOBILE_GAME_SURFACE_STYLES` (currently at `src/lib/mobileGameSurface.ts`) into `@randroids-dojo/vibekit`. The contract is just a `CSSProperties` object that disables touch gestures, text selection, and the iOS long-press callout inside a full-screen game surface; vibekit already owns the virtual-joystick math, and a mobile-safe surface helper is the obvious neighbor. Action: open a vibekit PR adding the const, bump its version, then swap the four VibeRacer call sites (`Game.tsx`, `DragRace.tsx`, `DerbyRound.tsx`, `TuningSession.tsx`) to import from the kit and delete the local module.

## Low Priority

- Gamepad rumble: collision-magnitude impulses. Blocked until gameplay has a real collision event source. Current barriers, cones, trees, and decorations are visual-only, and the physics integrator only emits off-track drag state. Once the vehicle can hit a wall or obstacle, emit an impact magnitude so the rumble path can scale a one-shot cue to contact strength. Derby's car-car contact stream in `derbyTick.ts` is now the natural event source; the rumble wiring still needs to plumb hit events out to `useGamepad`.

## Derby mode followups

- Replace placeholder vehicle GLBs with sourced open-source destructible models. The `derbyVehicleLoader` named-submesh contract is in place (`body`, `door_l/r`, `hood`, `trunk`, `headlight_l/r`, `taillight_l/r`, `wheel_*`). Drop GLBs into `public/models/derby/` and add a GLB-aware code path in `loadDerbyVehicleAsset`; `assertVehicleContract` will catch missing submeshes at load time.
- Difficulty knob for the CPU AI. v1 is single-difficulty seek-then-ram with no track-circling tactic. Add a difficulty enum to the start route and key the AI tuning constants (target weighting, recover threshold, lead seconds) off it.
- Dent decals as alpha-mapped sprites parented to the body. Held off in v1; the paint-darkening multiplier already conveys progressive damage. Real decals require pre-baked alpha PNGs under `public/models/derby/decals/`.
- Particle-based smoke and fire. v1 uses scaled translucent boxes for the markers so the visualizer ships without a particle system. Swap to instanced point sprites with a per-instance lifetime ramp once a shared particle module exists; the slot above the hood is already named (`derbyDamageSmoke`, `derbyDamageFire`) so the swap is local.
- Touch and gamepad parity for the derby canvas. v1 only consumes `useKeyboard`. Wire `useTouchControls` and `useGamepad` (already in the codebase) into `DerbyCanvas.playerInputFromKeys` so phone players can run a round.
- Mass and damage scalar tuning pass. v1 ships first-pass numbers in `derbyVehicles.ts`; a tuning pass before broad release would reduce the chance of one vehicle dominating the per-arena fastest-win board.
- Derby leaderboard pagination plus initials editor. The slice ships only the top 50 readout and falls back to `readStoredInitials() ?? 'YOU'`. Add a dedicated leaderboard panel and a post-round initials prompt to close out the loop / drag parity gap.
- Per-vehicle leaderboard tabs if a single vehicle ends up dominating the single board. The data is already stored on each entry's `vehicle` field, so post-hoc slicing is a UI change with no schema migration.

## Continuous-angle migration

The migration is complete: Stages 0, 0.5, 1, 2 (Workstream A and
the seven Workstream B slices), and 3 (flag flip) have all shipped,
and the slice 6 cascading-reconciliation and slice 7 OBB
false-positives followups have closed. See
`docs/CONTINUOUS_ANGLE_PLAN.md` for the authoritative status and
the contracts that pinned each stage.

