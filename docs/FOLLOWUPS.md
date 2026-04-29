# Followups

Backlog spillover discovered during implementation. Keep items PR-sized when possible.

## High Priority

- None recorded.

## Medium Priority

- None recorded.

## Low Priority

- Add deeper progress history if older archived Dots need to be summarized for future agents.
- Gamepad rumble: collision-magnitude impulses. Requires the physics integrator to emit collision events so the rumble path can scale impact intensity to the contact magnitude. Today the rumble system carries engine, surface, slip, brake-lock, and the lap / off-track impulses, but never reacts to a hard wall hit.
- Gamepad rumble: Xbox One / Series trigger rumble. The `'trigger-rumble'` effect is supported on Xbox One+ controllers in Chromium. Xbox 360 has no impulse triggers, so this is a strict superset: layer it on top of the dual-rumble path when an Xbox One+ pad is detected.
