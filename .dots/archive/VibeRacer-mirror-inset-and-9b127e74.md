---
title: Mirror inset and bottom speedometer/text overlap in HUD
status: closed
priority: 2
issue-type: task
created-at: "\"\\\"2026-04-29T00:01:07.214369-05:00\\\"\""
closed-at: "2026-04-29T00:34:17.387214-05:00"
close-reason: "Shipped in PR #30. Fixed HUD mirror and bottom-lane overlap, added mobile Playwright coverage, verified local checks, PR CodeQL and Vercel preview, no Copilot review threads after settled wait, main CodeQL, production deploy, and production HTTP 200 smoke."
---

Continued HUD overlap issues after recent passes: rear-view mirror inset overlaps with elements near it, and at the bottom of the screen the speedometer collides with adjacent text. Likely partially addressed by VibeRacer-declutter-in-game-9258bd07 but needs explicit attention to the mirror band and bottom-center stacking.
