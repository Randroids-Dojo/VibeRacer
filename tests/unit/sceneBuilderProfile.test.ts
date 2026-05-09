import { describe, expect, it } from 'vitest'
import {
  profiledTerrainSkirtGeometry,
  profiledTrackSurfaceGeometry,
  trackSurfaceGeometry,
} from '@/game/sceneBuilder'
import { buildTrackPath } from '@/game/trackPath'
import {
  DRAG_STRIPS,
  dragStripCheckpoints,
  dragStripPieces,
} from '@/lib/dragStrips'
import {
  FLAT_PROFILE,
  verticalProfileFromNormalized,
  type VerticalProfile,
} from '@/game/dragVerticalProfile'

function buildPath(slug: keyof typeof DRAG_STRIPS) {
  const strip = DRAG_STRIPS[slug]
  return buildTrackPath(
    dragStripPieces(strip),
    undefined,
    dragStripCheckpoints(strip),
  )
}

function ysOf(geom: ReturnType<typeof profiledTrackSurfaceGeometry>): number[] {
  const positions = geom.getAttribute('position')
  const out: number[] = []
  for (let i = 0; i < positions.count; i++) {
    out.push(positions.getY(i))
  }
  return out
}

describe('profiledTrackSurfaceGeometry', () => {
  it('lays the road flat at y=0 when the profile has no rise', () => {
    const path = buildPath('salt-flats')
    const geom = profiledTrackSurfaceGeometry(path, FLAT_PROFILE)
    const ys = ysOf(geom)
    expect(ys.length).toBeGreaterThan(0)
    for (const y of ys) expect(y).toBeCloseTo(0, 9)
  })

  it('matches the closed-loop trackSurfaceGeometry vertex count for the same path', () => {
    const path = buildPath('salt-flats')
    const flat = trackSurfaceGeometry(path)
    const profiled = profiledTrackSurfaceGeometry(path, FLAT_PROFILE)
    expect(profiled.getAttribute('position').count).toBe(
      flat.getAttribute('position').count,
    )
  })

  it('paired road-edge vertices share a y value at every sample', () => {
    const path = buildPath('alpine-pass')
    const strip = DRAG_STRIPS['alpine-pass']
    const geom = profiledTrackSurfaceGeometry(path, strip.verticalProfile)
    const positions = geom.getAttribute('position')
    expect(positions.count % 2).toBe(0)
    for (let i = 0; i < positions.count; i += 2) {
      // Left and right edge of the road at the same arc length must share
      // height; otherwise the road would tilt sideways across the strip.
      expect(positions.getY(i)).toBeCloseTo(positions.getY(i + 1), 9)
    }
  })

  it('rises monotonically over arc length on a strict uphill profile', () => {
    const profile = verticalProfileFromNormalized(800, [
      { sFrac: 0, height: 0 },
      { sFrac: 1, height: 30 },
    ])
    const path = buildPath('salt-flats')
    const geom = profiledTrackSurfaceGeometry(path, profile)
    const ys = ysOf(geom)
    // Use the per-pair "outer" y value (every even index). Smoothstep gives
    // a strictly increasing curve between the two keyframes, so consecutive
    // samples must non-decrease and at least one earlier sample must be
    // strictly less than a later one (the curve is not constant).
    let strictlyIncreased = false
    for (let i = 0; i < ys.length - 2; i += 2) {
      const a = ys[i]
      const b = ys[i + 2]
      expect(b).toBeGreaterThanOrEqual(a - 1e-9)
      if (b > a + 1e-9) strictlyIncreased = true
    }
    expect(strictlyIncreased).toBe(true)
  })

  it('produces 2 triangles per sample-pair gap (back-compat with the flat builder)', () => {
    const path = buildPath('coastal-strip')
    const strip = DRAG_STRIPS['coastal-strip']
    const profiled = profiledTrackSurfaceGeometry(path, strip.verticalProfile)
    const flat = trackSurfaceGeometry(path)
    expect(profiled.getIndex()?.count).toBe(flat.getIndex()?.count)
  })

  it('returns finite y values across every shipping strip and combination', () => {
    for (const slug of Object.keys(DRAG_STRIPS) as Array<keyof typeof DRAG_STRIPS>) {
      const strip = DRAG_STRIPS[slug]
      const path = buildPath(slug)
      const geom = profiledTrackSurfaceGeometry(path, strip.verticalProfile)
      const ys = ysOf(geom)
      for (const y of ys) expect(Number.isFinite(y)).toBe(true)
    }
  })
})

describe('profiledTerrainSkirtGeometry', () => {
  it('skirt y sits one fixed offset below the road at every sample', () => {
    const path = buildPath('alpine-pass')
    const strip = DRAG_STRIPS['alpine-pass']
    const road = profiledTrackSurfaceGeometry(path, strip.verticalProfile)
    const skirt = profiledTerrainSkirtGeometry(path, strip.verticalProfile, 24)
    const roadPos = road.getAttribute('position')
    const skirtPos = skirt.getAttribute('position')
    expect(skirtPos.count).toBe(roadPos.count)
    const deltas: number[] = []
    for (let i = 0; i < roadPos.count; i++) {
      deltas.push(skirtPos.getY(i) - roadPos.getY(i))
    }
    // All deltas should be the same constant SKIRT_Y_OFFSET (chosen at the
    // module level to defeat z-fighting). Pinning a single value means a
    // future tweak that splits the offset per-axis trips this test.
    // Float32 storage round-trips at ~7 significant digits, so the deltas
    // are equal to within Float32 precision rather than to within Float64.
    const ref = deltas[0]
    for (const d of deltas) expect(d).toBeCloseTo(ref, 6)
    expect(ref).toBeLessThan(0)
    expect(ref).toBeGreaterThan(-0.5)
  })

  it('skirt extends past the road by the requested half-width', () => {
    const path = buildPath('salt-flats')
    const flatProfile: VerticalProfile = FLAT_PROFILE
    const skirtHalfWidth = 24
    const road = profiledTrackSurfaceGeometry(path, flatProfile)
    const skirt = profiledTerrainSkirtGeometry(path, flatProfile, skirtHalfWidth)
    const roadPos = road.getAttribute('position')
    const skirtPos = skirt.getAttribute('position')
    // For a straight strip with constant heading, the skirt's left/right
    // edges sit at the road's centerline plus or minus skirtHalfWidth in
    // the perpendicular direction. The road's edges sit at +/- the road's
    // local half-width, which must be smaller than skirtHalfWidth for the
    // skirt to actually frame the road.
    let maxRoadOffset = 0
    let maxSkirtOffset = 0
    for (let i = 0; i < roadPos.count; i += 2) {
      const roadDx = roadPos.getX(i) - roadPos.getX(i + 1)
      const roadDz = roadPos.getZ(i) - roadPos.getZ(i + 1)
      const roadWidth = Math.hypot(roadDx, roadDz)
      maxRoadOffset = Math.max(maxRoadOffset, roadWidth / 2)
      const skirtDx = skirtPos.getX(i) - skirtPos.getX(i + 1)
      const skirtDz = skirtPos.getZ(i) - skirtPos.getZ(i + 1)
      const skirtWidth = Math.hypot(skirtDx, skirtDz)
      maxSkirtOffset = Math.max(maxSkirtOffset, skirtWidth / 2)
    }
    expect(maxSkirtOffset).toBeCloseTo(skirtHalfWidth, 6)
    expect(maxSkirtOffset).toBeGreaterThan(maxRoadOffset)
  })

  it('skirt y is finite across every shipping strip', () => {
    for (const slug of Object.keys(DRAG_STRIPS) as Array<keyof typeof DRAG_STRIPS>) {
      const strip = DRAG_STRIPS[slug]
      const path = buildPath(slug)
      const skirt = profiledTerrainSkirtGeometry(path, strip.verticalProfile, 24)
      const positions = skirt.getAttribute('position')
      for (let i = 0; i < positions.count; i++) {
        expect(Number.isFinite(positions.getY(i))).toBe(true)
        expect(Number.isFinite(positions.getX(i))).toBe(true)
        expect(Number.isFinite(positions.getZ(i))).toBe(true)
      }
    }
  })
})
