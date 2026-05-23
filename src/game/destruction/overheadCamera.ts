// Pure zoom math for the Destruction Lab's overhead camera. The
// camera sits at (centerX + panX, height, centerZ + panZ) looking
// straight down at (centerX + panX, 0, centerZ + panZ); "zoom"
// means changing the height, "pan" means sliding (panX, panZ).
// All side effects (event listeners, ref writes) live in the lab
// component; this module just exposes the math + bounds so the
// integration is unit-testable.

// Default height fits the 60 m arena disk + the scenery skirt (out
// to SKIRT_OUTER_RADIUS = 128 m) comfortably at fov 70 on landscape.
// Minimum gets close enough to follow the AI car as it laps the
// rail. Maximum shows the full stadium ring with framing.
export const OVERHEAD_DEFAULT_HEIGHT = 120
export const OVERHEAD_MIN_HEIGHT = 35
export const OVERHEAD_MAX_HEIGHT = 280

// Max pan radius from the arena center. Beyond this the arena
// loses context and the user can pan into empty world. 100 m
// covers the arena (60) + a generous look at the scenery skirt.
export const OVERHEAD_PAN_MAX = 100

// One wheel notch (typical browser deltaY ~ 100) zooms by this
// ratio. 1.15 = 15% per notch, smooth without feeling sluggish.
export const WHEEL_STEP_RATIO = 1.15

export function clampOverheadHeight(h: number): number {
  // NaN is a hard error (typically a divide-by-zero somewhere
  // upstream); fall back to the default so the camera does not
  // teleport to an invalid pose. Infinity is treated directionally:
  // +Inf hits the max clamp, -Inf hits the min clamp.
  if (Number.isNaN(h)) return OVERHEAD_DEFAULT_HEIGHT
  if (h < OVERHEAD_MIN_HEIGHT) return OVERHEAD_MIN_HEIGHT
  if (h > OVERHEAD_MAX_HEIGHT) return OVERHEAD_MAX_HEIGHT
  return h
}

// Scroll wheel zoom. Positive deltaY (scroll down) zooms OUT (camera
// rises), negative deltaY zooms in. Step magnitude is exponential
// so each notch changes height by a fixed ratio rather than a fixed
// distance, which keeps the zoom feel consistent across the range.
export function heightAfterWheel(
  currentHeight: number,
  deltaY: number,
  stepRatio: number = WHEEL_STEP_RATIO,
): number {
  if (!Number.isFinite(deltaY) || deltaY === 0) {
    return clampOverheadHeight(currentHeight)
  }
  const ratio = deltaY > 0 ? stepRatio : 1 / stepRatio
  return clampOverheadHeight(currentHeight * ratio)
}

// Pinch zoom. Fingers moving apart (currentDistance > initialDistance)
// means the user is "zooming in" => smaller height. Fingers moving
// together means "zooming out" => larger height. Degenerate
// distances (zero or non-finite) return the initial height
// unchanged so a stray event cannot teleport the camera.
export function heightAfterPinch(
  initialHeight: number,
  initialDistance: number,
  currentDistance: number,
): number {
  if (
    !Number.isFinite(initialDistance) ||
    !Number.isFinite(currentDistance) ||
    initialDistance <= 0 ||
    currentDistance <= 0
  ) {
    return clampOverheadHeight(initialHeight)
  }
  return clampOverheadHeight(initialHeight * (initialDistance / currentDistance))
}

// Clamp a pan offset (x, z) to a disk of the given radius around
// the origin so the camera cannot drift arbitrarily far from the
// arena. Non-finite components fall back to 0.
export function clampPanOffset(
  x: number,
  z: number,
  maxRadius: number = OVERHEAD_PAN_MAX,
): { x: number; z: number } {
  const sx = Number.isFinite(x) ? x : 0
  const sz = Number.isFinite(z) ? z : 0
  const r = Math.hypot(sx, sz)
  if (r <= maxRadius || maxRadius <= 0) {
    return { x: sx, z: sz }
  }
  const k = maxRadius / r
  return { x: sx * k, z: sz * k }
}

// Convert a pointer drag in screen pixels into the camera pan
// delta that makes the world point under the finger follow the
// finger ("drag-the-world" convention). Sign math:
//
// Overhead camera up = (0, 0, -1), forward = (0, -1, 0), right =
// (1, 0, 0). Screen +X = camera right = world +X. Screen +Y
// (typical pixel-coord convention is downward) = camera down =
// world +Z. So a pixel delta (dxPx, dyPx) corresponds to a world
// delta of the point under the finger of (+dxPx', +dyPx') (where
// the primes are scaled by the view's world extent at the ground).
// To make that world point follow the finger, the CAMERA moves
// the opposite direction: (-dxPx', -dyPx').
export function pixelDragToPanDelta(
  dxPx: number,
  dyPx: number,
  viewportWidthPx: number,
  viewportHeightPx: number,
  cameraHeight: number,
  fovDeg: number,
): { dx: number; dz: number } {
  if (
    !Number.isFinite(dxPx) ||
    !Number.isFinite(dyPx) ||
    viewportWidthPx <= 0 ||
    viewportHeightPx <= 0 ||
    cameraHeight <= 0 ||
    fovDeg <= 0
  ) {
    return { dx: 0, dz: 0 }
  }
  const visibleV = 2 * cameraHeight * Math.tan((fovDeg * Math.PI) / 360)
  const visibleH = visibleV * (viewportWidthPx / viewportHeightPx)
  return {
    dx: -(dxPx / viewportWidthPx) * visibleH,
    dz: -(dyPx / viewportHeightPx) * visibleV,
  }
}
