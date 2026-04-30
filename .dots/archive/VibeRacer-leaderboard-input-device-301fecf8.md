---
title: "Leaderboard: input-device icons + clickable rows for tuning details"
status: closed
priority: 2
issue-type: task
created-at: "\"2026-04-29T01:34:28.474729-05:00\""
closed-at: "2026-04-29T02:00:07.207629-05:00"
close-reason: "Merged PR #39 at 2984409. Verified local dash checks, git diff check, JSON parse, type-check, focused Vitest, focused Playwright row-details smoke, full Vitest, build, full Playwright smoke, Copilot thread fixed and resolved, PR CodeQL, Vercel preview, main CodeQL, production deploy, and production smoke on vibe-racer-three.vercel.app."
---

Two related additions to the leaderboard UI: (1) display an icon next to each score indicating the input device used to set it (keyboard, controller, touchscreen/phone). Need to capture input device per run when submitting. (2) Make each leaderboard row clickable to open a details panel showing the car's tuning / setup used for that lap (and any other relevant run metadata).
