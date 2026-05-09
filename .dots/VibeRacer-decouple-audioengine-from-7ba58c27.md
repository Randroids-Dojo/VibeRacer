---
title: Decouple audioEngine from AudioSettings to qualify for VibeKit
status: open
priority: 3
issue-type: task
created-at: "2026-05-08T23:26:55.973302-05:00"
---

src/game/audioEngine.ts imports effectiveMusicGain / effectiveSfxGain / readStoredAudioSettings / AudioSettings from src/lib/audioSettings.ts. To move it into ../VibeKit it needs an AudioSettings provider as a constructor argument or interface (the kit defines AudioSettings shape; consumers wire in their persistence). Once decoupled, contribute the engine to VibeKit. Audio is the highest-value next abstraction since 4+ projects re-implement Web Audio plumbing.
