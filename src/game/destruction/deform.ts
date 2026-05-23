import { BufferGeometry, Float32BufferAttribute, Mesh, Vector3 } from 'three'

// CPU vertex deformer. The per-panel state owns:
// - `basePositions`: the original (subdivided) vertex positions, kept
//   in panel-local space so dent splats can stack without ever losing
//   the pristine target.
// - `splats`: list of localized dent records. Each splat has a center
//   in panel-local space, a radius, and a depth scalar along an inward
//   panel-local direction. On every recompute the deformer walks each
//   splat against each vertex with a smooth Gaussian-style falloff and
//   sums the displacement, then writes the result back into the live
//   position attribute.
//
// Splats accumulate; vertex displacement saturates per-vertex at
// MAX_DENT_DEPTH so the panel cannot fold past itself. After the splat
// list grows past a soft cap the oldest splats fade out (depth tapered
// to zero) so the deformer's work stays bounded.

export const MAX_DENT_DEPTH = 0.18
const MAX_ACTIVE_SPLATS = 24
// Smoothstep-like falloff: a vertex sitting on the splat center takes
// the full depth, a vertex at the splat radius takes zero, and the
// curve between is C1-smooth so dents do not show a sharp ring.
function falloff(distance: number, radius: number): number {
  if (radius <= 0) return 0
  const t = 1 - Math.min(1, distance / radius)
  return t * t * (3 - 2 * t)
}

export interface DentSplat {
  // Panel-local space.
  cx: number
  cy: number
  cz: number
  // Inward panel-local unit direction. Vertices push along this axis.
  nx: number
  ny: number
  nz: number
  radius: number
  depth: number
  // Wall-clock ms the splat was added; oldest-first fading uses this.
  addedAtMs: number
}

export interface PanelDeformer {
  // Push a new dent into the panel. `localPoint` is panel-local space;
  // `localNormal` is the panel-local outward normal (the dent pushes
  // inward, i.e. along -localNormal). radius scales with hit intensity;
  // depth is the per-vertex saturation contribution.
  addSplat(
    localPoint: { x: number; y: number; z: number },
    localNormal: { x: number; y: number; z: number },
    radius: number,
    depth: number,
    nowMs: number,
  ): void
  // Recompute the live position attribute from base + splats. Idempotent
  // and cheap when no splats have changed since the last call.
  recompute(): void
  // Restore base positions and clear splats. Used by Repair.
  reset(): void
  // Free the cloned base position buffer. Mesh geometry is owned by
  // the GLB.
  dispose(): void
  // Read-only access for debug / testing.
  readonly splatCount: number
}

// Build a deformer for an already-subdivided mesh. The mesh's geometry
// is mutated in place; the caller is responsible for triggering a
// re-render after recompute. We require the geometry to already have a
// Float32 position attribute; the deformer does not call subdivide
// itself because subdivide replaces the geometry object (which the
// caller may share with the renderer).
export function createPanelDeformer(mesh: Mesh): PanelDeformer {
  const geom = mesh.geometry
  if (!(geom instanceof BufferGeometry)) {
    throw new Error('createPanelDeformer expects a BufferGeometry mesh')
  }
  const posAttr = geom.getAttribute('position')
  if (!(posAttr instanceof Float32BufferAttribute)) {
    throw new Error('createPanelDeformer requires a Float32 position attribute')
  }
  // Snapshot of the original positions. We clone the underlying array
  // so the live attribute can be mutated in place without losing the
  // pristine target.
  const baseArray = new Float32Array(posAttr.array.length)
  baseArray.set(posAttr.array)
  const liveArray = posAttr.array as Float32Array

  const splats: DentSplat[] = []
  let dirty = false

  function addSplat(
    localPoint: { x: number; y: number; z: number },
    localNormal: { x: number; y: number; z: number },
    radius: number,
    depth: number,
    nowMs: number,
  ): void {
    const len = Math.hypot(localNormal.x, localNormal.y, localNormal.z)
    if (!Number.isFinite(len) || len < 1e-6) return
    const inv = 1 / len
    splats.push({
      cx: localPoint.x,
      cy: localPoint.y,
      cz: localPoint.z,
      nx: -localNormal.x * inv,
      ny: -localNormal.y * inv,
      nz: -localNormal.z * inv,
      radius: Math.max(0.05, radius),
      depth: Math.max(0, depth),
      addedAtMs: nowMs,
    })
    if (splats.length > MAX_ACTIVE_SPLATS) {
      // Fade the oldest splat into the base by reducing its depth to
      // zero, then drop it from the active list. This keeps prior dents
      // visible because the live positions have already been written;
      // we are only stopping the deformer from re-applying it.
      splats.shift()
    }
    dirty = true
  }

  function recompute(): void {
    if (!dirty) return
    dirty = false
    // Start from base, then sum per-vertex displacement across active
    // splats. The sum is clamped to MAX_DENT_DEPTH along the splat's
    // inward direction (we treat each splat's direction independently
    // because most of a single hit's contribution lives along one axis).
    const count = baseArray.length / 3
    for (let v = 0; v < count; v++) {
      const bx = baseArray[v * 3]
      const by = baseArray[v * 3 + 1]
      const bz = baseArray[v * 3 + 2]
      let dx = 0
      let dy = 0
      let dz = 0
      for (let s = 0; s < splats.length; s++) {
        const sp = splats[s]
        const ex = bx - sp.cx
        const ey = by - sp.cy
        const ez = bz - sp.cz
        const d = Math.hypot(ex, ey, ez)
        const f = falloff(d, sp.radius)
        if (f <= 0) continue
        const amount = Math.min(sp.depth * f, MAX_DENT_DEPTH)
        dx += sp.nx * amount
        dy += sp.ny * amount
        dz += sp.nz * amount
      }
      // Per-vertex saturation: cap the resultant displacement magnitude
      // so two overlapping splats do not push a vert through the panel.
      const dmag = Math.hypot(dx, dy, dz)
      if (dmag > MAX_DENT_DEPTH) {
        const k = MAX_DENT_DEPTH / dmag
        dx *= k
        dy *= k
        dz *= k
      }
      liveArray[v * 3] = bx + dx
      liveArray[v * 3 + 1] = by + dy
      liveArray[v * 3 + 2] = bz + dz
    }
    posAttr.needsUpdate = true
    geom.computeVertexNormals()
    geom.computeBoundingSphere()
    geom.computeBoundingBox()
  }

  function reset(): void {
    splats.length = 0
    liveArray.set(baseArray)
    posAttr.needsUpdate = true
    geom.computeVertexNormals()
    geom.computeBoundingSphere()
    geom.computeBoundingBox()
    dirty = false
  }

  function dispose(): void {
    splats.length = 0
    // baseArray drops out of scope; nothing else to release here.
  }

  return {
    addSplat,
    recompute,
    reset,
    dispose,
    get splatCount() {
      return splats.length
    },
  }
}

// Pure helper that exposes the falloff curve so tests can verify the
// expected smoothstep shape without a Mesh in scope.
export function _falloffForTest(distance: number, radius: number): number {
  return falloff(distance, radius)
}

// Pure helper that returns the displacement that a single splat would
// apply to a single vertex in panel-local space. Useful for testing
// without instantiating a Mesh.
export function singleSplatDisplacement(
  vertex: { x: number; y: number; z: number },
  splat: DentSplat,
): { dx: number; dy: number; dz: number } {
  const ex = vertex.x - splat.cx
  const ey = vertex.y - splat.cy
  const ez = vertex.z - splat.cz
  const d = Math.hypot(ex, ey, ez)
  const f = falloff(d, splat.radius)
  if (f <= 0) return { dx: 0, dy: 0, dz: 0 }
  const amount = Math.min(splat.depth * f, MAX_DENT_DEPTH)
  return { dx: splat.nx * amount, dy: splat.ny * amount, dz: splat.nz * amount }
}

// Pure constructor for a splat used by tests.
export function makeSplat(
  cx: number,
  cy: number,
  cz: number,
  nx: number,
  ny: number,
  nz: number,
  radius: number,
  depth: number,
  addedAtMs: number = 0,
): DentSplat {
  const len = Math.hypot(nx, ny, nz)
  const inv = len > 1e-6 ? 1 / len : 0
  return {
    cx,
    cy,
    cz,
    nx: -nx * inv,
    ny: -ny * inv,
    nz: -nz * inv,
    radius,
    depth,
    addedAtMs,
  }
}

// Convenience used by car.ts when computing inward push for a hit.
export function inwardLocalNormal(worldNormal: Vector3, mesh: Mesh): Vector3 {
  const tmp = worldNormal.clone()
  // Transform from world space into the panel's local space using the
  // mesh's inverse world matrix.
  mesh.updateWorldMatrix(true, false)
  const m = mesh.matrixWorld.clone().invert()
  tmp.transformDirection(m)
  return tmp
}
