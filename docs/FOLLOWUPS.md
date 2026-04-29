# Followups

Backlog spillover discovered during implementation. Keep items PR-sized when possible.

## High Priority

- Advanced authoring: selected track transforms. After rectangle selection lands, add move, rotate, and flip actions for selected pieces with collision checks, validation feedback, keyboard / button UI, and focused editor tests.
- Advanced authoring: track templates. After transforms land, add a small template or stamp library so authors can place reusable loops or sections quickly, with save-safe validation and smoke coverage.

## Medium Priority

- None recorded.

## Low Priority

- Add deeper progress history if older archived Dots need to be summarized for future agents.
- Gamepad rumble: collision-magnitude impulses. Requires the physics integrator to emit collision events so the rumble path can scale impact intensity to the contact magnitude. Today the rumble system carries engine, surface, slip, brake-lock, and the lap / off-track impulses, but never reacts to a hard wall hit.
- Gamepad rumble: wrong-way and achievement-unlock impulses. Both events already exist in the game state; wiring them through `fireGamepadImpulse` would extend the cue table without changing the per-frame loop.
- Gamepad rumble: per-channel intensity sliders. Today the strong / weak motor magnitudes are baked into `RUMBLE_EFFECTS` and the continuous mapper. Some players may want to dial back the engine purr while keeping the slip cue at full strength.
- Gamepad rumble: Xbox One / Series trigger rumble. The `'trigger-rumble'` effect is supported on Xbox One+ controllers in Chromium. Xbox 360 has no impulse triggers, so this is a strict superset: layer it on top of the dual-rumble path when an Xbox One+ pad is detected.
- Gamepad rumble: continuous off-track rumble (in addition to the rising-edge impulse) so players feel the entire grass excursion, not just the moment they cross the line. Today the audio off-track rumble is the continuous half and the gamepad gets only the impulse. Pairing them would mean blending an extra strong-motor bias for the duration of `!onTrack`.
