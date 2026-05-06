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
shipped. Stage 2 Workstream B's foundation slice (feature flag plus
piece-level transform mutations) is in flight on PR #104. See
`docs/CONTINUOUS_ANGLE_PLAN.md` for the authoritative status, the
slicing plan for Workstream B, the file map, and the contracts that
pinned Stage 1 and Stage 2 Workstream A (Rule 1 and Rule 2 are
reproduced inside the plan).

### Stage 2 Workstream B: editor UX (slices 2 through 7)

- Slice 2: rendering refactor in `TrackEditor.tsx` so non-projectable
  pieces draw at their actual `transform.x / z / theta` rather than
  the cell-snapped position. Prerequisite for every UI slice that
  follows.
- Slice 3: rotate handle on the editor selection: drag rotates the
  entire piece around an endpoint, preserving the chosen endpoint
  frame and updating `transform.theta` continuously.
- Slice 4: free-placement drag behind the flag: nearest-neighbor query
  against unconnected endpoints in a snap radius (about 15 world units,
  30 degrees) with soft pull so the dragged endpoint frame matches.
- Slice 5: optional numeric input on long-press for `x, z, theta` for
  power users.
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

