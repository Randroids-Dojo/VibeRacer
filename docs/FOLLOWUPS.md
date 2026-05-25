# Followups

Backlog spillover discovered during implementation. Keep items PR-sized when possible.

## High Priority

- None recorded.

## Medium Priority

- Lift `MOBILE_GAME_SURFACE_STYLES` (currently at `src/lib/mobileGameSurface.ts`) into `@randroids-dojo/vibekit`. The contract is just a `CSSProperties` object that disables touch gestures, text selection, and the iOS long-press callout inside a full-screen game surface; vibekit already owns the virtual-joystick math, and a mobile-safe surface helper is the obvious neighbor. Action: open a vibekit PR adding the const, bump its version, then swap the four VibeRacer call sites (`Game.tsx`, `DragRace.tsx`, `DerbyRound.tsx`, `TuningSession.tsx`) to import from the kit and delete the local module.

## Low Priority

- Gamepad rumble: collision-magnitude impulses. Blocked until gameplay has a real collision event source. Current barriers, cones, trees, and decorations are visual-only, and the physics integrator only emits off-track drag state. Once the vehicle can hit a wall or obstacle, emit an impact magnitude so the rumble path can scale a one-shot cue to contact strength. Derby's car-car contact stream in `derbyTick.ts` is now the natural event source; the rumble wiring still needs to plumb hit events out to `useGamepad`.
- Continuous Tuning Lab Playwright smoke. The phase machine for the continuous-tuning loop is covered by the heuristics unit suite, but a browser smoke that drives two laps and asserts the freeze panel appears between them (and that picking a suggestion lands in the tuning-history list) would catch regressions in the canvas-pause / suggestion-render path. Deferred to keep the initial slice focused on the heuristics + UI wiring.
- Continuous tuning: per-session memory of accepted picks. The heuristics module has a clean place to read prior-lap selections (the `applyContinuousSuggestion` chain already records each accept in tuning history). Soft-suppressing a suggestion id for one or two laps after it lands would stop the same nudge from dominating the top-3 list when the player has already moved that param.

## Destruction Lab followups

- Morph-target authored damage states. The CPU vertex deformer covers free-form click damage; a small library of authored crumples (`light_crumple`, `hard_crumple`, `hinge_bend`) per panel would handle the major-state transitions the deep-research report calls out. Requires Blender shape keys on the sliced GLB plus a small runtime that animates morph weights when a panel HP crosses a threshold.
- LOD damage swaps. The lab runs one hero car at all times. For a derby-on-roids future where multiple destroyed cars are visible at once, swap to a lower-detail damaged mesh past a distance threshold; switch CPU dents off on the LOD'd mesh entirely.
- KTX2 / Basis texture compression pass. The lab uses procedural canvas textures for decals + smoke so the asset budget is tiny today; the moment we add authored decal art, route it through `KTX2Loader` and the GLB-side `setKTX2Loader()` hook.
- Mobile-class fallback. On weaker devices, skip the CPU vertex deformer and rely on shader displacement plus a decal-only wear path. The lab already has the panel state, deformer disposal, and wear handles factored out so the swap is local.
- `three-mesh-bvh` for accelerated repeated picking against subdivided panels. Today the panels are small enough that the default raycaster is fine; if a future slice triples the subdivision depth or adds many parked cars to the lab, BVH-accelerated picking is the obvious next step.
- Switching between the four Kenney variants in the lab. The asset loader is parameterised on `modelUrl`; surfacing a picker chip row in the HUD would let the player audition the destruction stack against the sedan, ambulance, pickup, and racecar.
- Damageable obstacle props. Today the player damages the car only via clicks; once the destruction stack proves out, add cones, barrels, and pylons whose collision with the car drives damage so a take-the-wheel session naturally accumulates wear.
- Persistence across page reloads. The lab currently resets on navigation. A "leave the wreck" mode that persists the panel HP and detached free bodies in `localStorage` (or signed cookies) would let players come back to their own destruction.

## Derby mode followups

- Improve the current authored Derby GLBs with richer destructible model variants. The `derbyVehicleLoader` named-submesh contract is in place (`body`, `door_l/r`, `hood`, `trunk`, `headlight_l/r`, `taillight_l/r`, `wheel_*`), authored GLBs already ship under `public/models/derby/`, and `assertVehicleContract` catches missing submeshes at load time. A future art pass can swap in higher-fidelity sourced models while preserving the contract.
- Difficulty knob for the CPU AI. v1 is single-difficulty seek-then-ram with no track-circling tactic. Add a difficulty enum to the start route and key the AI tuning constants (target weighting, recover threshold, lead seconds) off it.
- Dent decals as alpha-mapped sprites parented to the body. Held off in v1; the paint-darkening multiplier already conveys progressive damage. Real decals require pre-baked alpha PNGs under `public/models/derby/decals/`.
- Particle-based smoke and fire. v1 uses scaled translucent boxes for the markers so the visualizer ships without a particle system. Swap to instanced point sprites with a per-instance lifetime ramp once a shared particle module exists; the slot above the hood is already named (`derbyDamageSmoke`, `derbyDamageFire`) so the swap is local.
- Broader vehicle balance tuning pass. v1 now has harder physical impact, capped per-hit damage, a damage cooldown, and mass-aware collision impulse, but a balance pass before broad release should still reduce the chance of one vehicle dominating the per-arena fastest-win board.
- Derby leaderboard pagination plus initials editor. The slice ships only the top 50 readout and falls back to `readStoredInitials() ?? 'YOU'`. Add a dedicated leaderboard panel and a post-round initials prompt to close out the loop / drag parity gap.
- Per-vehicle leaderboard tabs if a single vehicle ends up dominating the single board. The data is already stored on each entry's `vehicle` field, so post-hoc slicing is a UI change with no schema migration.

## Continuous-angle migration

The migration is complete: Stages 0, 0.5, 1, 2 (Workstream A and
the seven Workstream B slices), and 3 (flag flip) have all shipped,
and the slice 6 cascading-reconciliation and slice 7 OBB
false-positives followups have closed. See
`docs/CONTINUOUS_ANGLE_PLAN.md` for the authoritative status and
the contracts that pinned each stage.
