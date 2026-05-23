import { describe, expect, it } from 'vitest'
import {
  BufferGeometry,
  Float32BufferAttribute,
  Uint32BufferAttribute,
} from 'three'
import { subdivideOnce, subdivideN } from '@/game/destruction/subdivide'

function makeTriangle(): BufferGeometry {
  const geom = new BufferGeometry()
  geom.setAttribute(
    'position',
    new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3),
  )
  geom.setAttribute('uv', new Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2))
  geom.setIndex(new Uint32BufferAttribute([0, 1, 2], 1))
  return geom
}

function makeQuad(): BufferGeometry {
  // Two triangles sharing an edge: (0,0)-(1,0)-(0,1) and (1,0)-(1,1)-(0,1).
  const geom = new BufferGeometry()
  geom.setAttribute(
    'position',
    new Float32BufferAttribute(
      [0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0],
      3,
    ),
  )
  geom.setAttribute(
    'uv',
    new Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2),
  )
  geom.setIndex(new Uint32BufferAttribute([0, 1, 2, 1, 3, 2], 1))
  return geom
}

describe('subdivideOnce', () => {
  it('quadruples the triangle count of a single triangle', () => {
    const input = makeTriangle()
    const output = subdivideOnce(input)
    // 1 input tri -> 4 output tris -> 12 indices.
    expect(output.getIndex()?.count).toBe(12)
    // 3 input verts + 3 new midpoints = 6 verts.
    expect(output.getAttribute('position').count).toBe(6)
  })

  it('preserves shared edge midpoints across adjacent triangles', () => {
    const input = makeQuad()
    const output = subdivideOnce(input)
    // 2 input tris -> 8 output tris.
    expect(output.getIndex()?.count).toBe(8 * 3)
    // The two input triangles share edge (1,0)-(0,1) which yields one
    // midpoint. The unique vertex count is therefore: 4 originals + 5
    // unique midpoints (each tri contributes 3, minus the 1 shared) = 9.
    expect(output.getAttribute('position').count).toBe(9)
  })

  it('inserts midpoint UVs by linear interpolation', () => {
    const input = makeTriangle()
    const output = subdivideOnce(input)
    const uv = output.getAttribute('uv')
    // The first added midpoint is the average of UV 0 and UV 1: (0.5, 0).
    expect(uv.getX(3)).toBeCloseTo(0.5, 6)
    expect(uv.getY(3)).toBeCloseTo(0, 6)
  })

  it('throws on a non-indexed geometry', () => {
    const geom = new BufferGeometry()
    geom.setAttribute(
      'position',
      new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3),
    )
    expect(() => subdivideOnce(geom)).toThrow(/indexed/i)
  })
})

describe('subdivideN', () => {
  it('returns the input unchanged for passes <= 0', () => {
    const input = makeTriangle()
    expect(subdivideN(input, 0)).toBe(input)
    expect(subdivideN(input, -3)).toBe(input)
  })

  it('compounds: two passes quadruples per pass', () => {
    const input = makeTriangle()
    const output = subdivideN(input, 2)
    // 1 -> 4 -> 16 tris -> 48 indices.
    expect(output.getIndex()?.count).toBe(48)
  })
})
