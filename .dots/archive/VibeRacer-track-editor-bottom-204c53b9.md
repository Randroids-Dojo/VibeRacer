---
title: Track editor bottom menu overflows on mobile; move undo/redo to floating HUD
status: closed
priority: 2
issue-type: task
created-at: "\"\\\"2026-04-28T22:31:49.933172-05:00\\\"\""
closed-at: "2026-04-28T23:20:36.964049-05:00"
close-reason: "Implemented in PR #26 with local tests, preview checks, and mobile editor smoke verification"
---

Bottom action bar (Cancel, Undo, Redo, Reverse direction, Clear, Add...) doesn't fit on mobile screen widths and the rightmost buttons get cut off. Move Undo and Redo out of the bottom bar and into floating HUD arrow buttons on the screen, similar to the existing zoom (+/-) controls. This frees up space and makes undo/redo more accessible during editing.
