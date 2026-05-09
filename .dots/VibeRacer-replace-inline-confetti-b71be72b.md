---
title: Replace inline confetti makeRng with @randroids-dojo/vibekit/rng
status: open
priority: 3
issue-type: task
created-at: "2026-05-08T23:27:01.612121-05:00"
---

src/lib/portable/confetti.ts has its own makeRng (Mulberry32). VibeKit's src/rng.ts is the canonical version with extra helpers (range, pick, gauss). After the migration to VibeKit lands, delete the inline makeRng from confetti and import from @randroids-dojo/vibekit. Lower priority since it is purely cosmetic dedup.
