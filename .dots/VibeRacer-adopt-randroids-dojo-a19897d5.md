---
title: Adopt @randroids-dojo/vibekit/math helpers across src/
status: open
priority: 4
issue-type: task
created-at: "2026-05-08T23:27:06.972775-05:00"
---

Many files in src/game/ and src/lib/ re-implement lerp / clamp / smoothstep / TAU. ../VibeKit/src/math.ts is the canonical version. Sweep src/ for local definitions and replace with imports from @randroids-dojo/vibekit (after the VibeKit migration lands). Lower priority since each definition is correct in isolation; this is dedup, not a fix.
