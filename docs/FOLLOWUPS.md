# Followups

Backlog spillover discovered during implementation. Keep items PR-sized when possible.

## High Priority

- Track Tune Editor Slice 2: add KV persistence, personal tune storage, per-slug overrides, the tune editor UI, step grid, Settings entry point, Track Editor entry point, save/apply flows, and Playwright smoke coverage.
- Track Tune Editor Slice 3: add per-lap key change, off-track scale and ducking, finish stinger scheduling, game state wiring, editor controls for automation, and Vitest coverage for music state transitions.

## Medium Priority

- None recorded.

## Low Priority

- Gamepad rumble: collision-magnitude impulses. Blocked until gameplay has a real collision event source. Current barriers, cones, trees, and decorations are visual-only, and the physics integrator only emits off-track drag state. Once the vehicle can hit a wall or obstacle, emit an impact magnitude so the rumble path can scale a one-shot cue to contact strength.
