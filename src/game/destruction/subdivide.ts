import { BufferAttribute, BufferGeometry, Float32BufferAttribute, Uint32BufferAttribute } from 'three'

// One pass of triangle subdivision. Each input triangle becomes four
// child triangles by inserting an edge midpoint on each of its three
// edges. Positions and UVs interpolate; normals are not preserved (the
// caller should call computeVertexNormals once the geometry is rebuilt).
//
// This exists because Kenney's low-poly Car Kit panels do not have
// enough verts to dent convincingly. One pass turns a 12-tri hood into
// 48 tris (~80 verts), which the CPU deformer can push around with
// visible localized depressions.
//
// Why this and not three's LoopSubdivision: we want a strictly linear
// midpoint split that preserves UVs and panel silhouettes. Loop
// subdivision smooths the surface, which would round off hard edges
// the Kenney style depends on.

interface SharedEdgeCache {
  // Key is "i,j" with i < j; value is the inserted midpoint vertex index.
  map: Map<string, number>
}

function edgeKey(a: number, b: number): string {
  return a < b ? `${a},${b}` : `${b},${a}`
}

// Subdivide a single indexed BufferGeometry once. Non-indexed input is
// rejected because the midpoint dedup relies on stable vertex indices.
// Attributes preserved: `position` (required), `uv` (when present).
// Other attributes are dropped because the deformer does not consume
// them; if a future caller needs normals on subdivided meshes they
// should call `computeVertexNormals()` after this returns.
export function subdivideOnce(input: BufferGeometry): BufferGeometry {
  const indexAttr = input.getIndex()
  if (!indexAttr) {
    throw new Error('subdivideOnce requires an indexed BufferGeometry')
  }
  const posAttr = input.getAttribute('position')
  if (!posAttr) {
    throw new Error('subdivideOnce requires a position attribute')
  }
  const uvAttr = input.getAttribute('uv') ?? null

  const positions: number[] = []
  const uvs: number[] = []

  // Seed the output with the input vertices so existing indices stay
  // valid. We append midpoint verts at the end of each list.
  const baseCount = posAttr.count
  for (let i = 0; i < baseCount; i++) {
    positions.push(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i))
    if (uvAttr) uvs.push(uvAttr.getX(i), uvAttr.getY(i))
  }

  const cache: SharedEdgeCache = { map: new Map() }

  function midpoint(a: number, b: number): number {
    const key = edgeKey(a, b)
    const cached = cache.map.get(key)
    if (cached !== undefined) return cached
    const ax = positions[a * 3]
    const ay = positions[a * 3 + 1]
    const az = positions[a * 3 + 2]
    const bx = positions[b * 3]
    const by = positions[b * 3 + 1]
    const bz = positions[b * 3 + 2]
    positions.push((ax + bx) * 0.5, (ay + by) * 0.5, (az + bz) * 0.5)
    if (uvAttr) {
      const au = uvs[a * 2]
      const av = uvs[a * 2 + 1]
      const bu = uvs[b * 2]
      const bv = uvs[b * 2 + 1]
      uvs.push((au + bu) * 0.5, (av + bv) * 0.5)
    }
    const idx = positions.length / 3 - 1
    cache.map.set(key, idx)
    return idx
  }

  const outIndices: number[] = []
  const triCount = indexAttr.count / 3
  for (let t = 0; t < triCount; t++) {
    const i0 = indexAttr.getX(t * 3)
    const i1 = indexAttr.getX(t * 3 + 1)
    const i2 = indexAttr.getX(t * 3 + 2)
    const m01 = midpoint(i0, i1)
    const m12 = midpoint(i1, i2)
    const m20 = midpoint(i2, i0)
    // Four child triangles: three corner triangles plus the central
    // inverted triangle made of the midpoints. Winding preserved.
    outIndices.push(i0, m01, m20)
    outIndices.push(i1, m12, m01)
    outIndices.push(i2, m20, m12)
    outIndices.push(m01, m12, m20)
  }

  const out = new BufferGeometry()
  out.setAttribute('position', new Float32BufferAttribute(positions, 3))
  if (uvAttr) out.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  // Output may exceed 16-bit range after a few panels, so always emit a
  // 32-bit index. WebGL2 (required by Next.js's three target) supports
  // 32-bit indices natively.
  out.setIndex(new Uint32BufferAttribute(outIndices, 1))
  return out
}

// Run subdivideOnce N times. Each pass quadruples triangle count, so
// passes=1 is the sweet spot for Kenney panels (about 50 tris); passes=2
// quadruples again. Returns the input untouched when passes <= 0.
export function subdivideN(input: BufferGeometry, passes: number): BufferGeometry {
  let geom = input
  for (let i = 0; i < passes; i++) {
    const next = subdivideOnce(geom)
    if (geom !== input) geom.dispose()
    geom = next
  }
  return geom
}

// Re-export so test files can construct attributes without pulling
// three directly. Convenience only; production code imports from three.
export { BufferAttribute, BufferGeometry }
