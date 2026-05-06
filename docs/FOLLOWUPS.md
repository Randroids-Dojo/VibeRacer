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
free-placement drag, and numeric Transform panel have shipped as PRs
#104 / #105 / #106 / #107. Slice 6 (loop reconciliation) is in flight
on branch `claude/continuous-angle-stage-2-loop-reconciliation`. See
`docs/CONTINUOUS_ANGLE_PLAN.md` for the authoritative status, the
slicing plan for Workstream B, the file map, and the contracts that
pinned Stage 1 and Stage 2 Workstream A (Rule 1 and Rule 2 are
reproduced inside the plan).

### Stage 2 Workstream B: editor UX (slice 7)

Slices 0.5 through 6 are shipped or in flight. The remaining slice is
queued.

- Slice 7: OBB-vs-OBB overlap detection: spatial hash plus AABB
  pre-check before full OBB. The footprint contract stays a list of
  cells; arbitrary-angle pieces enumerate cells via the existing
  supercover.

### Stage 2 Workstream B slice 6 cascading reconciliation (follow-up)

Single-piece reconciliation in a CLOSED loop with one perturbation
moves the gap from the perturbed connection to the next downstream
connection rather than closing it (each snap moves the chosen piece
rigidly, so its still-connected other endpoint drifts onto the next
broken connection). The shipped reconciliation works for OPEN chains
where the moving piece sits at the chain end (its other endpoint is
unconnected); the closed-loop case needs either a multi-piece
distribute-drift adjustment or a "rotate around connected endpoint"
move that leaves the OTHER endpoint position fixed. Capture this
when a user reports the closed-loop case in real authoring.

### Stage 3

- Flip the feature flag, update tutorials, and decide whether the Flex
  Straight stays as a discrete-snap shortcut for rational `atan(p/q)`
  angles or gets deprecated.

