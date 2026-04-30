---
title: Pause music when tab is in background
status: closed
priority: 2
issue-type: task
created-at: "\"\\\"2026-04-29T01:14:58.411152-05:00\\\"\""
closed-at: "2026-04-29T01:39:56.277760-05:00"
close-reason: "Merged PR #38 at d48cd63. Verified local dash checks, git diff check, JSON parse, type-check, focused Vitest, full Vitest, build, Playwright smoke, PR CodeQL, Vercel preview, main CodeQL, production deploy, and production smoke on vibe-racer-three.vercel.app."
---

Repro: open the game in multiple tabs on Android, music plays from all tabs simultaneously. Fix: listen for 'visibilitychange' (or use Page Visibility API) and pause/resume music + sound effects when document.hidden flips. Should also help battery life and avoid audio collision.
