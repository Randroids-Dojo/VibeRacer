---
title: Declutter in-game HUD per approved plan
status: closed
priority: 1
issue-type: task
created-at: "\"\\\"2026-04-28T22:44:44.902560-05:00\\\"\""
closed-at: "2026-04-28T23:06:52.871084-05:00"
close-reason: "PR #25 opened after implementation. Local verification passed: dash checks, diff check, GDD coverage JSON parse, hud notification unit test, full unit suite, type-check, build, Playwright smoke, and desktop/mobile screenshots."
---

Plan file: ~/.claude/plans/there-s-a-lot-of-structured-umbrella.md. Reorganize HUD by information role: live action top, transient feedback in a single notification stack, reference data demoted to bottom-left session strip, persistent live indicators (ghost gap, challenge/rival) move to bottom-center band above speedometer. Sim-racing dashboard aesthetic (tabular monospace, dark panels, unified CSS vars). Add useViewportWidth hook for compact mobile breakpoint. Files: src/components/HUD.tsx, src/components/Minimap.tsx, new src/lib/hudNotifications.ts, new src/lib/useViewportWidth.ts, update HUD test.
