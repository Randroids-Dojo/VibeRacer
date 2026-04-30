---
title: Settings tabs cut off at bottom (Vehicle tab)
status: closed
priority: 2
issue-type: task
created-at: "\"\\\"2026-04-29T00:01:07.217287-05:00\\\"\""
closed-at: "2026-04-29T00:22:25.338766-05:00"
close-reason: "Shipped in PR #29. Fixed settings modal viewport containment by portaling menu overlays, made the settings tab panel own scrolling, added Playwright coverage, and verified type-check, unit tests, build, smoke e2e, PR checks, Vercel preview, main CodeQL, production deploy status, and production smoke."
---

On the settings screen, some tabs (e.g. Vehicle) have their content cut off at the bottom of the viewport. Tab content needs scroll containment or the tab panel needs to size to remaining viewport height instead of overflowing.
