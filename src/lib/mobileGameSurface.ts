'use client'
import type { CSSProperties } from 'react'

// Shared mobile-safe game surface styles. Every full-screen game mode
// (closed-loop, drag, derby, tuning) needs the same set of touch
// suppressions so the browser stops eating pointer events for its own
// gestures:
//
//   - `touchAction: 'none'`         disables double-tap zoom, pinch zoom,
//                                   and pull-to-refresh inside the surface
//                                   so every touch reaches the game's
//                                   pointer listeners.
//   - `userSelect: 'none'` (+vendor variants) prevents the long-press
//                                   text-selection box that appears when
//                                   a finger sits on a label. Redundant
//                                   with the app-wide default in
//                                   globals.css, kept here as defense in
//                                   depth for game surfaces.
//   - `WebkitTouchCallout: 'none'`  blocks the iOS long-press callout
//                                   ("Copy / Look Up") so a held throttle
//                                   does not summon the system menu.
//
// Game.tsx had this set inline as a `root` const; Drag, Derby, and parts
// of Tuning Lab were missing one or more lines and had broken touch as a
// result. This module is the single source of truth.
//
// Followup: lift this to `@randroids-dojo/vibekit` once that package
// accepts React-CSS exports. The contract is just a CSSProperties object;
// no React-only types are leaked beyond `import type`.
export const MOBILE_GAME_SURFACE_STYLES: CSSProperties = {
  position: 'fixed',
  inset: 0,
  overflow: 'hidden',
  touchAction: 'none',
  userSelect: 'none',
  WebkitUserSelect: 'none',
  WebkitTouchCallout: 'none',
}
