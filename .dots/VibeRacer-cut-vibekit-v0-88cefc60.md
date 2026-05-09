---
title: Cut VibeKit v0.1.0 release upstream then flip ledgers from commit-pin to tag-pin
status: open
priority: 2
issue-type: task
created-at: "2026-05-09T11:43:37.701984-05:00"
---

VibeKit (Randroids-Dojo/VibeKit) has release-please configured but no published tags yet. All sibling projects' DEPENDENCY_LEDGER.md entries reference v0.1.0 but Flatline is the only consumer and it commit-pins to 0b2b104. When the first feat: commit lands on VibeKit main, release-please opens a release PR. Merging it cuts v0.1.0 + GitHub Release. Then: (1) Flatline package.json flips from commit hash to #v0.1.0, ledger Currently pinned line updates; (2) any project that has adopted by then runs the upgrade gate; (3) the four projects whose ledgers say 'planned, not yet adopted' can flip to real pins as they adopt.
