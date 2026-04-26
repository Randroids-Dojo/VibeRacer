// Pure helpers for the track editor's pan and zoom controls.
// All math here is deterministic and unit-tested. The React component owns
// the DOM (scroll positions, refs) and calls into these helpers.

export const ZOOM_MIN = 0.4
export const ZOOM_MAX = 2.5
export const ZOOM_DEFAULT = 1
// Step factor used by zoom-in / zoom-out buttons and discrete keyboard taps.
// Wheel and pinch use a continuous multiplier instead.
export const ZOOM_STEP = 1.25

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return ZOOM_DEFAULT
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom))
}

export interface ZoomShiftInput {
  // Current zoom factor (before the change).
  oldZoom: number
  // Target zoom factor (will be clamped).
  newZoom: number
  // Cursor offset within the scrollable container's client area (px).
  cursorClientX: number
  cursorClientY: number
  // Current scroll offsets of the container (px).
  scrollLeft: number
  scrollTop: number
}

export interface ZoomShiftResult {
  // Clamped zoom that the caller should apply.
  zoom: number
  // New scrollLeft / scrollTop the container should jump to so the world
  // point under the cursor stays fixed.
  scrollLeft: number
  scrollTop: number
}

// Compute the new zoom plus the scroll offsets that keep the world point
// currently under the cursor pinned in place. Pure: callers feed in the
// container's measurements; this returns numbers to apply to state and DOM.
export function shiftZoomTowardCursor(input: ZoomShiftInput): ZoomShiftResult {
  const oldZoom = input.oldZoom <= 0 ? ZOOM_DEFAULT : input.oldZoom
  const zoom = clampZoom(input.newZoom)
  const ratio = zoom / oldZoom
  // World-space anchor (in base content coords): (scroll + cursor) / oldZoom.
  // After zoom: scroll' + cursor = world * newZoom.
  const newScrollLeft = (input.scrollLeft + input.cursorClientX) * ratio - input.cursorClientX
  const newScrollTop = (input.scrollTop + input.cursorClientY) * ratio - input.cursorClientY
  return {
    zoom,
    scrollLeft: Math.max(0, newScrollLeft),
    scrollTop: Math.max(0, newScrollTop),
  }
}

export interface FitZoomInput {
  // Pixel size of the content at zoom = 1.
  contentWidth: number
  contentHeight: number
  // Pixel size of the viewport (the scrollable container).
  viewportWidth: number
  viewportHeight: number
  // Optional padding (px) inside the viewport to leave around the content.
  padding?: number
}

// Pick the largest zoom that fits the content inside the viewport.
// Returns ZOOM_DEFAULT if any input is zero or negative (degenerate).
export function fitZoom(input: FitZoomInput): number {
  const pad = input.padding ?? 0
  const availW = Math.max(0, input.viewportWidth - pad * 2)
  const availH = Math.max(0, input.viewportHeight - pad * 2)
  if (
    input.contentWidth <= 0 ||
    input.contentHeight <= 0 ||
    availW <= 0 ||
    availH <= 0
  ) {
    return ZOOM_DEFAULT
  }
  const fit = Math.min(availW / input.contentWidth, availH / input.contentHeight)
  return clampZoom(fit)
}

// Pinch-to-zoom helper. Given the previous and current pointer distances and
// the zoom captured at the start of the gesture, return the new zoom.
// Pure so the React component can stay tiny.
export function pinchZoom(
  startZoom: number,
  startDistance: number,
  currentDistance: number,
): number {
  if (startDistance <= 0 || currentDistance <= 0) return clampZoom(startZoom)
  return clampZoom(startZoom * (currentDistance / startDistance))
}

export function distance(
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = ax - bx
  const dy = ay - by
  return Math.hypot(dx, dy)
}
