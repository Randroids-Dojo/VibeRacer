# Followups

Backlog spillover discovered during implementation. Keep items PR-sized when possible.

## High Priority

- None recorded.

## Medium Priority

- None recorded.

## Low Priority

- Gamepad rumble: collision-magnitude impulses. Blocked until gameplay has a real collision event source. Current barriers, cones, trees, and decorations are visual-only, and the physics integrator only emits off-track drag state. Once the vehicle can hit a wall or obstacle, emit an impact magnitude so the rumble path can scale a one-shot cue to contact strength.

## Continuous-angle migration

Stages 0, 0.5, 1, and Stage 2 Workstream A (the runtime migration) have
shipped. Stage 2 Workstream B's foundation, rendering / rotate handle,
and free-placement drag have shipped as PRs #104 / #105 / #106. Slice
5 (numeric input) is in flight on branch
`claude/continuous-angle-stage-2-numeric-input`. See
`docs/CONTINUOUS_ANGLE_PLAN.md` for the authoritative status, the
slicing plan for Workstream B, the file map, and the contracts that
pinned Stage 1 and Stage 2 Workstream A (Rule 1 and Rule 2 are
reproduced inside the plan).

### Stage 2 Workstream B: editor UX (slices 6 and 7)

Slices 0.5, 1, 2, 3, 4, and now 5 (numeric input) are shipped or in
flight. The remaining slices are queued.

- Slice 6: reconciliation pass for nearly-closed continuous-angle loops:
  detect "loop closes within wider epsilon" and snap the last endpoint
  exactly to the first before save.
- Slice 7: OBB-vs-OBB overlap detection: spatial hash plus AABB
  pre-check before full OBB. The footprint contract stays a list of
  cells; arbitrary-angle pieces enumerate cells via the existing
  supercover.

### Stage 3

- Flip the feature flag, update tutorials, and decide whether the Flex
  Straight stays as a discrete-snap shortcut for rational `atan(p/q)`
  angles or gets deprecated.

