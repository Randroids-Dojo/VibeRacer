import { describe, it, expect } from 'vitest'
import {
  ZOOM_DEFAULT,
  ZOOM_MAX,
  ZOOM_MIN,
  clampZoom,
  distance,
  fitZoom,
  pinchZoom,
  shiftZoomTowardCursor,
} from '@/game/editorZoom'

describe('clampZoom', () => {
  it('passes a value inside the range through unchanged', () => {
    expect(clampZoom(1)).toBe(1)
    expect(clampZoom(0.75)).toBe(0.75)
  })

  it('clamps below ZOOM_MIN', () => {
    expect(clampZoom(0.01)).toBe(ZOOM_MIN)
    expect(clampZoom(-5)).toBe(ZOOM_MIN)
  })

  it('clamps above ZOOM_MAX', () => {
    expect(clampZoom(99)).toBe(ZOOM_MAX)
  })

  it('returns the default for non-finite input', () => {
    expect(clampZoom(Number.NaN)).toBe(ZOOM_DEFAULT)
    expect(clampZoom(Number.POSITIVE_INFINITY)).toBe(ZOOM_DEFAULT)
  })
})

describe('shiftZoomTowardCursor', () => {
  it('keeps the world point under the cursor pinned in place', () => {
    // Setup: container is scrolled to (100, 50), cursor sits at (200, 100)
    // inside the container. World anchor = (100+200)/1 = 300 horizontally.
    const out = shiftZoomTowardCursor({
      oldZoom: 1,
      newZoom: 2,
      scrollLeft: 100,
      scrollTop: 50,
      cursorClientX: 200,
      cursorClientY: 100,
    })
    // After zoom = 2, world point 300 should sit at scroll' + 200 = 600.
    // So scroll' = 400.
    expect(out.zoom).toBe(2)
    expect(out.scrollLeft).toBe(400)
    // World y anchor = 50 + 100 = 150. Doubled => 300. scroll' = 300 - 100 = 200.
    expect(out.scrollTop).toBe(200)
  })

  it('clamps the requested zoom and never returns negative scroll', () => {
    const out = shiftZoomTowardCursor({
      oldZoom: 1,
      newZoom: 0.001,
      scrollLeft: 0,
      scrollTop: 0,
      cursorClientX: 100,
      cursorClientY: 100,
    })
    expect(out.zoom).toBe(ZOOM_MIN)
    expect(out.scrollLeft).toBeGreaterThanOrEqual(0)
    expect(out.scrollTop).toBeGreaterThanOrEqual(0)
  })

  it('treats a degenerate oldZoom of 0 as the default zoom', () => {
    const out = shiftZoomTowardCursor({
      oldZoom: 0,
      newZoom: 1,
      scrollLeft: 0,
      scrollTop: 0,
      cursorClientX: 50,
      cursorClientY: 50,
    })
    expect(out.zoom).toBe(1)
  })
})

describe('fitZoom', () => {
  it('picks the limiting axis when content is wider than tall vs viewport', () => {
    // 800x400 content into 400x400 viewport. Horizontal limit: 400/800 = 0.5.
    // Vertical limit: 400/400 = 1. Min = 0.5.
    expect(
      fitZoom({
        contentWidth: 800,
        contentHeight: 400,
        viewportWidth: 400,
        viewportHeight: 400,
      }),
    ).toBe(0.5)
  })

  it('honors padding by shrinking the available area', () => {
    // 800x400 content into 400x400 viewport with 50 px padding on every side.
    // Available horizontal: 300. Limit: 300/800 = 0.375.
    expect(
      fitZoom({
        contentWidth: 800,
        contentHeight: 400,
        viewportWidth: 400,
        viewportHeight: 400,
        padding: 50,
      }),
    ).toBe(0.4) // clamped to ZOOM_MIN
  })

  it('clamps to the legal zoom range', () => {
    // Tiny content in a huge viewport would compute > ZOOM_MAX.
    expect(
      fitZoom({
        contentWidth: 10,
        contentHeight: 10,
        viewportWidth: 1000,
        viewportHeight: 1000,
      }),
    ).toBe(ZOOM_MAX)
  })

  it('returns the default zoom on degenerate input', () => {
    expect(
      fitZoom({
        contentWidth: 0,
        contentHeight: 0,
        viewportWidth: 100,
        viewportHeight: 100,
      }),
    ).toBe(ZOOM_DEFAULT)
  })
})

describe('pinchZoom', () => {
  it('scales the captured zoom by the distance ratio', () => {
    expect(pinchZoom(1, 100, 200)).toBe(2)
    expect(pinchZoom(1, 200, 100)).toBe(0.5)
  })

  it('clamps the result to the legal zoom range', () => {
    expect(pinchZoom(1, 1, 1000)).toBe(ZOOM_MAX)
    expect(pinchZoom(1, 1000, 1)).toBe(ZOOM_MIN)
  })

  it('returns the clamped start zoom on degenerate distances', () => {
    expect(pinchZoom(1.5, 0, 100)).toBe(1.5)
    expect(pinchZoom(1.5, 100, 0)).toBe(1.5)
  })
})

describe('distance', () => {
  it('returns the euclidean distance between two points', () => {
    expect(distance(0, 0, 3, 4)).toBe(5)
    expect(distance(1, 1, 1, 1)).toBe(0)
  })
})
