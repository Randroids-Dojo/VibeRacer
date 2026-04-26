---
title: "implement: edit initials in Settings pane"
status: closed
priority: 2
issue-type: task
created-at: "\"\\\"2026-04-26T01:01:38.437036-05:00\\\"\""
closed-at: "2026-04-26T01:06:44.486872-05:00"
close-reason: Added Identity section to SettingsPane with inline initials editing. Extracted storage helpers to src/lib/initials.ts (matches the audioSettings pattern), added INITIALS_EVENT custom event so HUD updates live without reload, wired Game.tsx to subscribe. 4 new unit tests, 306/306 unit tests pass, build green, 11/11 playwright tests pass, no em-dashes.
---

Add an Identity section to SettingsPane that lets the player view and edit their leaderboard initials. The GDD Section 4 + 7 lists this as 'Not yet landed'. Acceptance:
- Add an 'Identity' section to SettingsPane (above or after Audio).
- Show the current initials (from localStorage via the existing InitialsPrompt helpers).
- Provide an inline 3-character input (uppercase A-Z) with the same validation as InitialsPrompt.
- Save updates writeStoredInitials and reflects immediately in HUD next time you race.
- Visual styling matches the rest of the menu (dark theme, MenuUI primitives).
- No need to rewrite historical submissions (per GDD).
- Add unit test coverage for any new pure helper if one is added.

Verify: build passes, tests pass, manually verified initials appear in Settings and persist on save.
