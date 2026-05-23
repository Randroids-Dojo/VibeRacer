// Pure zoom math for the Destruction Lab's overhead camera. The
// camera sits at (centerX, height, centerZ) looking straight down at
// the arena center; "zoom" means changing the height, not the FOV.
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
