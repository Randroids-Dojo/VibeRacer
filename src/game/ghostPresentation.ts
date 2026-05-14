/**
 * Shared per-frame wiring for the ghost car + floating nameplate.
 *
 * The closed-loop game (`RaceCanvas`) and Drag mode (`DragRace`) both
 * sample a `Replay` by elapsed-since-race-start, place a translucent ghost
 * GLB clone at the sampled pose, and float a "WHO + TIME" nameplate above
 * it that fades when it gets close to the player car. The two used to
 * inline this logic side by side; this helper is the single source of
 * truth for both.
 *
 * The helper mutates Three.js objects in place and keeps a tiny state
 * object across frames so the canvas-backed nameplate texture is only
 * redrawn on a real (meta, source) change. The state struct is
 * intentionally minimal so the call site can store it in a closure
 * variable or a ref without ceremony.
 *
 * Drag mode passes a `resolveTerrain` callback so the ghost car follows
 * the strip's hilly profile (height + pitch). Closed-loop tracks pass
 * nothing and the ghost sits at y=0 with no pitch, matching the flat
 * road. The pose returned to the caller is always the raw replay
 * sample (pre-terrain), so callers driving a minimap pose ref get the
 * same x/z/heading the recorder captured.
 */

import type { Group } from 'three'
import type { Replay } from '@/lib/replay'
import { interpolateGhostPose } from '@/lib/replay'
import {
  nameplateCacheKey,
  nameplateOpacityForDistance,
  type GhostMeta,
  type NameplateSource,
} from './ghostNameplate'
import type { GhostNameplate } from './sceneBuilder'

export interface GhostPresentationState {
  // The (meta, source) cache key the nameplate texture was last drawn
  // for. Re-applies skip the canvas redraw when the key has not changed
  // since the previous frame, which is the steady-state path.
  lastNameplateKey: string | null
  // True when the nameplate sprite is currently visible. We track this
  // so a hide-then-show cycle re-applies the texture even when the cache
  // key stayed the same (the apply path also flips the sprite back on).
  lastNameplateVisible: boolean
}

export function initGhostPresentation(): GhostPresentationState {
  return { lastNameplateKey: null, lastNameplateVisible: false }
}

export interface GhostPresentationInput {
  ghostCar: Group
  ghostPlate: GhostNameplate
  // The active replay, or null when no rival has been loaded yet (or the
  // viewer toggled the ghost off).
  replay: Replay | null
  // Race start timestamp in `performance.now()` units, or null before GO.
  // The helper computes elapsed-since-start internally; null hides the
  // ghost without sampling.
  raceStartMs: number | null
  // `performance.now()` for this frame. Passed in so the helper does not
  // call `performance.now()` itself, keeping the function deterministic
  // for tests.
  nowMs: number
  // Master "should the ghost render at all" gate. False hides the ghost
  // car AND the nameplate regardless of replay state. Caller composes
  // its own conditions (settings toggle, race phase, etc.) into this.
  active: boolean
  // Master "should the nameplate render" gate. False hides the plate
  // even when the ghost car is visible.
  showNameplate: boolean
  // Identity tuple to draw on the plate, or null to draw the placeholder
  // "GHOST / ???" texture.
  meta: GhostMeta | null
  // Which ghost source picked this rival; rendered as the small TAG
  // (TOP / PB / LAST / GHOST) on the plate.
  source: NameplateSource
  // Player position used to compute the distance-to-player fade for the
  // nameplate.
  playerX: number
  playerZ: number
  // Optional terrain sampler for hilly strips. When omitted the helper
  // places the ghost at y=0 with no pitch, matching the closed-loop
  // game's flat road. When present, called with the sampled replay pose
  // to look up the y / pitch for that point on the strip.
  resolveTerrain?: (x: number, z: number) => { y: number; pitch: number }
}

export interface GhostPresentationOutput {
  // True when the ghost car was made visible this frame.
  visible: boolean
  // Raw replay sample for this frame, or null when the ghost was not
  // sampled (no replay, race not started, sample past replay end). The
  // caller can fan this out to a minimap pose ref or similar without
  // re-sampling the replay.
  pose: { x: number; z: number; heading: number } | null
  // Distance from the player to the ghost in world units. Returns
  // `Number.POSITIVE_INFINITY` when the ghost was not visible this
  // frame.
  distance: number
}

export function applyGhostPresentation(
  state: GhostPresentationState,
  input: GhostPresentationInput,
): GhostPresentationOutput {
  const {
    ghostCar,
    ghostPlate,
    replay,
    raceStartMs,
    nowMs,
    active,
    showNameplate,
    meta,
    source,
    playerX,
    playerZ,
    resolveTerrain,
  } = input

  let visible = false
  let distance = Number.POSITIVE_INFINITY
  let pose: { x: number; z: number; heading: number } | null = null

  if (active && replay && raceStartMs !== null) {
    const t = Math.max(0, nowMs - raceStartMs)
    const sampled = interpolateGhostPose(replay, t)
    if (sampled) {
      const terrain = resolveTerrain
        ? resolveTerrain(sampled.x, sampled.z)
        : ZERO_TERRAIN
      ghostCar.position.set(sampled.x, terrain.y, sampled.z)
      ghostCar.rotation.set(-terrain.pitch, sampled.heading, 0)
      ghostCar.visible = true
      visible = true
      distance = Math.hypot(sampled.x - playerX, sampled.z - playerZ)
      pose = sampled
    } else {
      ghostCar.visible = false
    }
  } else {
    ghostCar.visible = false
  }

  const opacity = nameplateOpacityForDistance(distance)
  const wantPlate = visible && showNameplate && opacity > 0
  if (wantPlate) {
    const key = nameplateCacheKey(meta, source)
    if (key !== state.lastNameplateKey || !state.lastNameplateVisible) {
      ghostPlate.apply(meta, source)
      state.lastNameplateKey = key
      state.lastNameplateVisible = true
    }
    ghostPlate.setOpacity(opacity)
  } else if (state.lastNameplateVisible) {
    ghostPlate.setVisible(false)
    state.lastNameplateVisible = false
    state.lastNameplateKey = null
  }

  return { visible, pose, distance }
}

const ZERO_TERRAIN = { y: 0, pitch: 0 } as const
