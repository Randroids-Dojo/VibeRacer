# Followups

Backlog spillover discovered during implementation. Keep items PR-sized when possible.

## High Priority

- None recorded.

## Medium Priority

- None recorded.

## Low Priority

- Gamepad rumble: collision-magnitude impulses. Blocked until gameplay has a real collision event source. Current barriers, cones, trees, and decorations are visual-only, and the physics integrator only emits off-track drag state. Once the vehicle can hit a wall or obstacle, emit an impact magnitude so the rumble path can scale a one-shot cue to contact strength.

## Continuous-angle migration

Stages 0, 0.5, 1, and 2 (Workstream A and the seven Workstream B
slices) have shipped. Stage 3 (flag flip) is in flight on branch
`claude/continuous-angle-stage-3-flip-flag`. See
`docs/CONTINUOUS_ANGLE_PLAN.md` for the authoritative status and
the contracts that pinned each stage.

### Slice 6 cascading reconciliation (follow-up)

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

### Slice 7 OBB false-positives on non-rectangular footprints (follow-up)

The OBB is built from the AABB of each piece-type's footprint
offsets, so non-rectangular footprints (wideArc45, hairpin,
flexStraight) over-approximate. Two such pieces can produce an OBB
overlap warning even when there is no duplicate-cell collision. The
warning is informational only (save is not blocked), so this is
acceptable for now; if authoring noise becomes a problem, replace
the AABB-of-footprint approximation with a per-piece-type road
polygon table.

