import { describe, expect, it } from 'vitest'
import {
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  Uint32BufferAttribute,
} from 'three'
import {
  MAX_DENT_DEPTH,
  _falloffForTest,
  createPanelDeformer,
  makeSplat,
  singleSplatDisplacement,
} from '@/game/destruction/deform'

function gridPanel(): Mesh {
  // 5x5 grid of vertices in the XY plane at z = 0, triangulated.
  const cols = 5
  const rows = 5
  const positions: number[] = []
  const indices: number[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      positions.push(c, r, 0)
    }
  }
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const i0 = r * cols + c
      const i1 = i0 + 1
      const i2 = (r + 1) * cols + c
      const i3 = i2 + 1
      indices.push(i0, i1, i2)
      indices.push(i1, i3, i2)
    }
  }
  const geom = new BufferGeometry()
  geom.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geom.setIndex(new Uint32BufferAttribute(indices, 1))
  return new Mesh(geom, new MeshBasicMaterial())
}

describe('falloff', () => {
  it('is 1 at the center', () => {
    expect(_falloffForTest(0, 1)).toBeCloseTo(1, 6)
  })
  it('is 0 at the radius', () => {
    expect(_falloffForTest(1, 1)).toBeCloseTo(0, 6)
  })
  it('is monotonically decreasing', () => {
    let prev = Number.POSITIVE_INFINITY
    for (let d = 0; d < 1; d += 0.1) {
      const f = _falloffForTest(d, 1)
      expect(f).toBeLessThanOrEqual(prev + 1e-6)
      prev = f
    }
  })
  it('returns zero for non-positive radius', () => {
    expect(_falloffForTest(0.1, 0)).toBe(0)
  })
})

describe('singleSplatDisplacement', () => {
  it('pushes a vertex inside the radius along the inward normal', () => {
    // Outward normal +z; inward direction is -z.
    const splat = makeSplat(2, 2, 0, 0, 0, 1, 1.0, 0.1)
    const inside = singleSplatDisplacement({ x: 2, y: 2, z: 0 }, splat)
    expect(inside.dz).toBeLessThan(0)
    expect(Math.abs(inside.dx)).toBeLessThan(1e-6)
    expect(Math.abs(inside.dy)).toBeLessThan(1e-6)
  })

  it('leaves a vertex outside the radius untouched', () => {
    const splat = makeSplat(2, 2, 0, 0, 0, 1, 1.0, 0.1)
    const outside = singleSplatDisplacement({ x: 5, y: 5, z: 0 }, splat)
    expect(outside.dx).toBe(0)
    expect(outside.dy).toBe(0)
    expect(outside.dz).toBe(0)
  })

  it('saturates each axis at MAX_DENT_DEPTH', () => {
    const splat = makeSplat(0, 0, 0, 0, 0, 1, 1.0, 10) // huge depth
    const center = singleSplatDisplacement({ x: 0, y: 0, z: 0 }, splat)
    expect(Math.abs(center.dz)).toBeLessThanOrEqual(MAX_DENT_DEPTH + 1e-6)
  })
})

describe('createPanelDeformer', () => {
  it('moves nearby verts inward when a splat is added and recomputed', () => {
    const mesh = gridPanel()
    const deformer = createPanelDeformer(mesh)
    // Snapshot a vertex near the splat center for comparison.
    const posAttr = mesh.geometry.getAttribute('position')
    const centerIdx = 12 // (2, 2, 0) in the 5x5 grid.
    const beforeZ = posAttr.getZ(centerIdx)
    deformer.addSplat(
      { x: 2, y: 2, z: 0 },
      { x: 0, y: 0, z: 1 },
      1.0,
      0.12,
      0,
    )
    deformer.recompute()
    const afterZ = posAttr.getZ(centerIdx)
    expect(afterZ).toBeLessThan(beforeZ)
  })

  it('reset restores base positions exactly', () => {
    const mesh = gridPanel()
    const posAttr = mesh.geometry.getAttribute('position')
    const beforeSnapshot = (posAttr.array as Float32Array).slice()
    const deformer = createPanelDeformer(mesh)
    deformer.addSplat(
      { x: 2, y: 2, z: 0 },
      { x: 0, y: 0, z: 1 },
      1.0,
      0.15,
      0,
    )
    deformer.recompute()
    deformer.reset()
    const after = posAttr.array as Float32Array
    for (let i = 0; i < beforeSnapshot.length; i++) {
      expect(after[i]).toBeCloseTo(beforeSnapshot[i], 6)
    }
  })

  it('skipping recompute leaves positions unchanged', () => {
    const mesh = gridPanel()
    const deformer = createPanelDeformer(mesh)
    const posAttr = mesh.geometry.getAttribute('position')
    const before = (posAttr.array as Float32Array).slice()
    deformer.addSplat(
      { x: 2, y: 2, z: 0 },
      { x: 0, y: 0, z: 1 },
      1.0,
      0.12,
      0,
    )
    // recompute() not called: live positions still equal base.
    const after = posAttr.array as Float32Array
    for (let i = 0; i < before.length; i++) {
      expect(after[i]).toBeCloseTo(before[i], 6)
    }
  })
})
