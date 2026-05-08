# Followups

Backlog spillover discovered during implementation. Keep items PR-sized when possible.

## High Priority

- None recorded.

## Medium Priority

- None recorded.

## Low Priority

- Gamepad rumble: collision-magnitude impulses. Blocked until gameplay has a real collision event source. Current barriers, cones, trees, and decorations are visual-only, and the physics integrator only emits off-track drag state. Once the vehicle can hit a wall or obstacle, emit an impact magnitude so the rumble path can scale a one-shot cue to contact strength.

## Continuous-angle migration

The migration is complete: Stages 0, 0.5, 1, 2 (Workstream A and
the seven Workstream B slices), and 3 (flag flip) have all shipped,
and the slice 6 cascading-reconciliation and slice 7 OBB
false-positives followups have closed. See
`docs/CONTINUOUS_ANGLE_PLAN.md` for the authoritative status and
the contracts that pinned each stage.

