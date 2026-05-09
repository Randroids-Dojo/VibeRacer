---
title: Migrate src/lib/portable/ to consume @randroids-dojo/vibekit
status: open
priority: 2
issue-type: task
created-at: "2026-05-08T23:26:48.745563-05:00"
---

src/lib/portable/ duplicates virtual-joystick / editor-history / confetti that now live in ../VibeKit/src/. Add @randroids-dojo/vibekit as a file:../VibeKit dep, then either delete src/lib/portable/ and rewrite the 7 import sites to point at @randroids-dojo/vibekit directly, or keep the folder as a single re-export shim. Tests in tests/unit/ continue to pin behavior at the new import paths.
