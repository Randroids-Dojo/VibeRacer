---
title: Migrate localStorage helpers to @randroids-dojo/vibekit/storage
status: open
priority: 2
issue-type: task
created-at: "2026-05-08T23:27:16.466735-05:00"
---

VibeRacer has ~10 localStorage-backed feature stores (myTracks, myPbs, recentTracks, dailyStreakStorage, localBest, tuningSettings, audioSettings, controlSettings, myMusic, slugsVisited, etc.) each re-implementing the same defensive read/write pattern. ../VibeKit/src/storage.ts exposes readStorage<T>(key, schema) / writeStorage / removeStorage / updateStorage / listenStorage / notifyStorageChange validated with zod. After @randroids-dojo/vibekit is added as a file:../VibeKit dep, sweep these stores: replace inline try/catch+JSON.parse+schema chains with readStorage; replace inline window.dispatchEvent custom events with the kit's notifyStorageChange (or rely on writeStorage's automatic dispatch); replace storage-event listeners with listenStorage. Keep behavior identical (every dispatch event name and key shape preserved unless project explicitly opts in to the gamekit:storage convention).
