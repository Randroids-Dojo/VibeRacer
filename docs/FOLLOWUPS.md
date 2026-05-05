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
shipped. See `docs/CONTINUOUS_ANGLE_PLAN.md` for the authoritative
status, file map, and the contract that pinned Stage 1 (Rule 1 and Rule
2 are reproduced inside the plan). The remaining work lives ahead in
Stage 2 Workstream B and Stage 3.

### Stage 2 Workstream B: editor UX

- Rotate handle on the editor selection: drag rotates the entire piece
  around an endpoint, preserving connection at the other end.
- Free-placement mode behind a feature flag: nearest-neighbor query
  against unconnected endpoints in a snap radius (about 15 world units,
  30 degrees) with soft pull so the dragged endpoint frame matches.
- Optional numeric input on long-press for `x, z, theta` for power
  users.
- Reconciliation pass for nearly-closed continuous-angle loops: detect
  "loop closes within wider epsilon" and snap the last endpoint exactly
  to the first before save.
- OBB-vs-OBB overlap detection: spatial hash plus AABB pre-check before
  full OBB. The footprint contract stays a list of cells; arbitrary-angle
  pieces enumerate cells via the existing supercover.

### Stage 3

- Flip the feature flag, update tutorials, and decide whether the Flex
  Straight stays as a discrete-snap shortcut for rational `atan(p/q)`
  angles or gets deprecated.

