---
title: Declutter in-game HUD per approved plan
status: closed
priority: 1
issue-type: task
created-at: "\"2026-04-29T00:00:59.842223-05:00\""
closed-at: "2026-04-29T00:09:03.430991-05:00"
close-reason: "Already shipped in PR #25. Evidence: docs/PROGRESS_LOG.md entry 'In-Race HUD Declutter', docs/GDD_COVERAGE.json Section 2 evidence includes src/components/HUD.tsx, src/lib/hudNotifications.ts, and tests/unit/hudNotifications.test.ts."
---

# In-Race HUD Declutter - VibeRacer

## Context

The in-race HUD currently renders ~20 distinct UI elements clustered in the top half of the screen. The root causes of the overlap and clutter:

1. **One monolithic top row.** `HUD.tsx:649` flexes 9 stat blocks (CURRENT, PROJECTED, LAST LAP, BEST SESSION, BEST ALL-TIME with 4 attached chips, OPTIMAL, RECORD, LAP, RACER) plus medal / next-medal / streak / rank / consistency badges. With `flex-wrap: wrap`, the layout breaks unpredictably across viewport widths and on mobile produces multi-row stacking that pushes the road horizon out of frame.
2. **Floating chips fight for the same vertical band.** Reaction time (`top:60`), split delta (`top:88`), challenge banner (`top:92`), pace note (`top:96`), top-speed PB (`top:100`), ghost gap (`top:132`), sector PB (`top:134`) all anchor at `left:50%` with hardcoded `top` values within a 75 px band. Any two firing simultaneously overlap.
3. **Persistent reference data competes with live action data.** PB, OPTIMAL, RECORD, RACER initials, leaderboard rank are reference values you check between laps, not while you're cornering. They occupy the same prime real estate as the live lap timer and position.

Goal: a sim-racing dashboard aesthetic - tabular monospace numerics, dark semi-transparent panels, deterministic zones - where every element has a fixed role and they cannot overlap.

## Design principles

- **Information hierarchy by role.** Live action top, transient feedback center stack, reference data docked bottom-left.
- **Three deterministic top zones.** Top-left = current lap timer (only). Top-center = alerts band (pace / wrong-way / off-track). Top-right = LAP + POS + minimap.
- **Single notification queue.** All transient pop-fade chips flow through one centered stack with reserved vertical slots so two events at once cannot collide.
- **Persistent live-vs-other-car indicators sit near the road.** Ghost gap and challenge / rival banners move to a bottom-center band above the speedometer (driver's natural eye line).
- **Reference data demoted.** BEST (Session), BEST (All-Time) + medal / streak / rank / consistency, OPTIMAL, RECORD collapse into one bottom-left "session strip", smaller, single row.

## Target layout

```
Desktop / landscape
+--------------------------------------------------+
|  CURRENT                          LAP 2/3   P 3  |
|  0:42.193                            [MINIMAP]   |
|       --- pace / wrong-way / off-track ---       |  alerts band
|             [transient queue slot 1]             |  reserved
|                                                  |
|             [transient queue slot 2]             |  reserved
|                                                  |
|  DRIFT  ____  x1.4                               |
|  BEST 0:41.234 . OPT 0:40.910 . REC ABC 0:40.500 |  session strip
|        vs GHOST -0.41 . CHALLENGE BEAT 0:40.5    |  live band
|              GAS . BRK . GEAR . 202 km/h         |
+--------------------------------------------------+
```

## Files to modify

- `src/components/HUD.tsx` - primary refactor (JSX `~647-810`, styles `~810-end`).
- `src/components/Minimap.tsx` - accept a `compact` prop and a `placement` prop so it can render at top-right during the race (currently bottom-right per the file).
- `src/lib/hudNotifications.ts` *(new)* - queue helper: `useHudNotificationStack({ slots: 2 })` returns ordered, non-overlapping live entries.
- `src/lib/useViewportWidth.ts` *(new)* - small hook returning a `compact` boolean at `< 600px`.
- `src/components/__tests__/HUD.test.tsx` - update assertions to query by `role` / `aria-live` rather than absolute position, since position will change.

## Concrete changes

### 1. Replace `topRow` with three anchored zones

Remove the single flex-wrap row. Three absolute containers:

- `topLeft` (`top:8, left:8`): big monospace `CURRENT` lap timer only. No background card. Applies the existing `timeBig` clamp.
- `topRight` (`top:8, right:8`): vertical stack - `LAP n/N` chip on top, `POS n/N` chip below, then the Minimap card. Single `display:flex; flex-direction:column; gap:8px`.
- `topCenter` (`top:48, left:50%, transform:translateX(-50%)`): alerts band. Pace-note chip when active; replaced by the wrong-way banner when wrong-way fires; replaced by `OFF TRACK` text when off-track. Only one of these renders at a time (priority: wrong-way > off-track > pace).

Move the existing pace-note styling into `topCenterAlert` and reuse for all three states (different colors / accent).

### 2. Build `<NotificationStack/>`

New component anchored at `top:120, left:50%, transform:translateX(-50%); display:flex; flex-direction:column; gap:8px; align-items:center`. Renders up to 2 simultaneous chips; older entries fade out when a newer higher-priority chip arrives.

Replace these direct renders with stack entries (each declares `priority`, `durationMs`, `keyId`):

- reaction-time chip (currently `top:60`)
- top-speed PB chip (currently `top:100`)
- split-delta tile (currently `top:88`)
- sector-PB badge (currently `top:134`)
- lap toast (currently `top:30%`)
- celebration burst stays where it is (`top:36%`) - it's the full-screen flash and conceptually different.

The stack mounts each chip with its existing pop-fade animation; it just owns the vertical positioning so two chips never pin to the same `top`.

### 3. New `<SessionStrip/>` bottom-left dock

One horizontal monospace row, `position:absolute; left:8; bottom:80` (clears speedometer card). Tiles, separated by ` . ` (thin dot):

- `BEST 0:41.234`
- `OPTIMAL 0:40.910` (gold when `optimalLapComplete`, dim otherwise)
- `RECORD ABC 0:40.500`
- accent dot at left edge tinted by current `medalTier` color (replaces the explicit medal badge).

Move medal / next-medal / streak / rank / consistency chips behind a small ⓘ icon at the right end of the strip - tap / hover reveals a popover with all five chips. This keeps the data accessible without pinning five badges to the prime row.

### 4. `<LiveBand/>` bottom-center

Single horizontal pill row at `bottom:200px, left:50%, transform:translateX(-50%)`. Contains:

- ghost-gap chip (formerly `top:132`)
- challenge banner (formerly `top:92`)
- rival banner (formerly `top:92` or `top:132`)

Same cyan family as today, just relocated. Pills sit `gap:8px`. Hidden when none active.

### 5. Drift panel - keep position, slim it

DriftPanel stays at `left:8, top:90` *but the new layout makes that slot empty* (the top row is gone). Rename anchor to `top:64` so it tucks under `CURRENT`. On `compact` viewports (`< 600px`) hide the BEST (LAP) / BEST (ALL) sub-row and render only the live readout.

### 6. Mobile breakpoint (`compact = viewport < 600px`)

Via the new `useViewportWidth()` hook applied in `HUD.tsx`:

- Minimap: `132x132` -> `88x88` and drop to `top-right` corner alignment with smaller padding.
- SessionStrip: collapse to `BEST . RECORD` only, ⓘ tap expands the rest.
- Top-center alerts: drop one font tier (`30px` -> `20px` for wrong-way).
- LiveBand: stack pills vertically instead of horizontally if they overflow.

### 7. Visual unification (sim-racing dashboard)

Add three CSS variables on `wrap`:

```ts
'--hud-bg': 'rgba(8, 12, 20, 0.55)',
'--hud-border': 'rgba(180, 200, 230, 0.18)',
'--hud-accent': 'rgba(255, 255, 255, 0.92)',
```

Apply to every panel (`block`, `paceNoteChipStyle`, banner styles, SessionStrip, LiveBand pills) for one consistent family. Add `font-variant-numeric: tabular-nums` to every monospace value so digit width is fixed and tiles don't shift as the timer ticks.

## Non-goals

- Speedometer, TouchControls, manual gear chip - keep as is. They are not the source of overlap.
- Existing pop / fade animation timings - keep all `@keyframes` blocks. Only the positioning containers change.
- New gameplay features. No new HUD data is being added or removed.
- Aria / a11y semantics - preserve every existing `role` and `aria-live` on the moved elements.

## Verification

1. `npm run dev`. Drive a lap with pace notes ON, manual transmission, drift visible, and a rival selected via leaderboard. Confirm:
   - No two HUD elements ever overlap visually.
   - Top-left has only the live lap timer; top-right has only LAP/POS/minimap.
   - Wrong-way + off-track + challenge banner active simultaneously: only one alert renders at a time per priority.
2. Trigger every transient at once by replaying a known fast lap (sector PB + split delta + top-speed PB + reaction time + lap toast). Confirm the notification stack queues them with `gap:8px` - no overlap.
3. Chrome DevTools, viewport `360x640`. Confirm the screen is readable, top row never wraps, minimap renders 88x88, SessionStrip collapses to two tiles.
4. `npm test` and update `src/components/__tests__/HUD.test.tsx` to query by `role` / `aria-live` / data-testid where it currently asserts on positional CSS. No new tests required for the queue helper unless `npm test` is the right place - if the project already has hook tests, add one for `useHudNotificationStack` covering: priority preemption, slot limit, fade-out ordering.
5. Run `npm run typecheck` (or `tsc --noEmit`) - the prop additions to `Minimap` and the new hook must type-check cleanly.

## Rollout

Single PR. The change is purely a layout refactor with no behavior changes; component tests + visual smoke test on mobile and desktop should be sufficient. Roll forward; no feature flag needed.
