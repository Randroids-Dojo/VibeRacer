---
title: Improve derby destroyed-car fire effect
status: open
priority: 3
issue-type: task
created-at: "2026-05-17T14:35:00.000000-05:00"
---

The destroyed-vehicle "fire" in src/game/derbyDamageVisuals.ts:82-193 is a translucent orange BoxGeometry (0.9 x 0.7 x 0.9, color 0xff5022, opacity 0.85, position y=2.0). It was hidden inside the solid body shell before, but with carved door / hood / trunk cavities the box is now plainly visible as a flat orange rectangle inside the wreck.

Options:
- Replace with a stacked-sheets billboard flame (a few alpha-mapped planes that always face the camera)
- Particle system with short-lived flame sprites
- Animated emissive shader on a small jittered shape
- At minimum: smaller box, dropped to floor height (y≈0.3 instead of 2.0), and tint randomization per car

Adjacent: the matching `smoke` BoxGeometry above the fire (1.2 x 0.6 x 1.2) deserves the same pass; both share the placeholder feel now that the wreck shape is real.
