import {
  type Mesh,
  type MeshStandardMaterial,
  type Object3D,
  Quaternion,
  Vector3,
} from 'three'
import { createPanelDeformer, inwardLocalNormal, type PanelDeformer } from './deform'
import { applyWear, createWearHandle, disposeWearHandle, type WearHandle } from './wear'
import { applyPanelDamage, engineBleedFor, fractionOf, initAllPanels, PANELS, type PanelId, type PanelState } from './panels'
import { createDecalPool } from './decals'
import { createEmitter } from './smoke'
import { derive, fireIntensity, IDENTITY_DRIVABILITY, smokeIntensity, type Drivability } from './drivability'
import type { DestructionAsset } from './asset'
import { spawnFreeBody, type FreeBody } from './freeBody'

// Orchestrator. Owns the loaded asset, per-panel state, deformer,
// decals, wear, smoke. Public API is intentionally small: take a hit,
// tick per frame, read drivability, repair, detonate, dispose. The
// client component (DestructionLab.tsx) calls these in response to
// pointer events and the rAF loop.
//
// Internal invariants:
// - Detached panels are removed from the asset's group and handed to
//   the free body integrator. The orchestrator does not own them after
//   handoff; the integrator does, until repair recycles the entire
//   asset.
// - Wear handles clone the panel material once and write to the clone
//   on every wear update. Disposal is owned by the orchestrator.
// - All wall-clock timestamps come from the caller (performance.now())
//   so unit / integration tests can drive them deterministically.

export interface HitInput {
  panelId: PanelId
  // World-space contact point and outward normal.
  worldPoint: Vector3
  worldNormal: Vector3
  // Damage magnitude. Range: 8 to 35 typical.
  amount: number
  // Wall-clock ms for splat timestamp + smoke seeding.
  nowMs: number
  // Seeded RNG for jitter inside the decals + free body integrator.
  rng: () => number
}

export interface DestructionCar {
  applyHit(hit: HitInput): { detached: Object3D | null }
  tick(dtSec: number, spawnPos?: { x: number; y: number; z: number }): void
  repair(): void
  detonate(nowMs: number, rng: () => number): Object3D[]
  getDrivability(): Drivability
  getPanels(): Readonly<Record<PanelId, PanelState>>
  getTotalHits(): number
  dispose(): void
  readonly asset: DestructionAsset
}

export interface CarOptions {
  asset: DestructionAsset
  scene: Object3D
  // Free body container that the orchestrator pushes detached panels
  // into. The caller is responsible for ticking it each frame.
  freeBodies: FreeBody[]
  // Cap on simultaneous detached free bodies. Older bodies past the
  // cap are not removed by the orchestrator (the integrator owns
  // lifecycle) but the orchestrator stops detaching when the cap is
  // reached so the visible wreck stays bounded.
  freeBodyCap?: number
}

export function createDestructionCar(opts: CarOptions): DestructionCar {
  const { asset, scene, freeBodies } = opts
  const freeBodyCap = opts.freeBodyCap ?? 6

  let panels = initAllPanels()
  let totalHits = 0
  let lastDrivability: Drivability = IDENTITY_DRIVABILITY

  // Build deformer + wear for each deformable panel that has a mesh on
  // the asset. The maps are keyed by PanelId so applyHit can dispatch
  // directly without walking arrays.
  const deformers: Partial<Record<PanelId, PanelDeformer>> = {}
  const wearHandles: Partial<Record<PanelId, WearHandle>> = {}
  for (const id of Object.keys(PANELS) as PanelId[]) {
    if (!PANELS[id].deformable) continue
    const mesh = asset.panelMeshes[id]
    if (!mesh) continue
    deformers[id] = createPanelDeformer(mesh)
    const mat = mesh.material as MeshStandardMaterial
    const handle = createWearHandle(mat)
    mesh.material = handle.material
    wearHandles[id] = handle
  }

  const decalPool = createDecalPool(asset.group)
  const emitter = createEmitter(scene, Math.random)

  function applyHit(hit: HitInput): { detached: Object3D | null } {
    const panel = panels[hit.panelId]
    if (!panel) return { detached: null }
    if (panel.detached) return { detached: null }
    totalHits += 1
    const result = applyPanelDamage(panel, hit.amount)
    // Engine bleed: front-end and body damage erodes the engine. This
    // is what eventually stalls the car even though the player never
    // hits an "engine" point directly.
    const bleed = engineBleedFor(hit.panelId, result.damageDealt)
    if (bleed > 0) {
      applyPanelDamage(panels.engine, bleed)
    }

    // Deformation: only deformable panels with a mesh + deformer
    // registered. Hits with no deformer (engine, lights) skip silently.
    const deformer = deformers[hit.panelId]
    const mesh = asset.panelMeshes[hit.panelId]
    if (deformer && mesh) {
      // Convert the world contact point into panel-local space.
      mesh.updateWorldMatrix(true, false)
      const local = mesh.worldToLocal(hit.worldPoint.clone())
      // Inward direction in panel-local space. inwardLocalNormal
      // returns the world normal transformed by inverse world matrix.
      const localNormal = inwardLocalNormal(hit.worldNormal, mesh)
      const radius = 0.35 + Math.min(hit.amount / 60, 0.6)
      const depth = 0.07 + Math.min(hit.amount / 200, 0.12)
      deformer.addSplat(
        { x: local.x, y: local.y, z: local.z },
        { x: localNormal.x, y: localNormal.y, z: localNormal.z },
        radius,
        depth,
        hit.nowMs,
      )
    }

    // Decal: only on panels that have a mesh. The decal pool projects
    // a scuff onto the surface; DecalGeometry handles the conform.
    if (mesh) {
      decalPool.addDecal(mesh, hit.worldPoint, hit.worldNormal, hit.rng)
    }

    // Material wear keyed off the panel's current HP fraction.
    const handle = wearHandles[hit.panelId]
    if (handle) {
      applyWear(handle, fractionOf(panel))
    }

    // Detach: if this hit drove HP through the panel's detach
    // threshold and we are under the cap, hand the panel to the free
    // body integrator.
    let detached: Object3D | null = null
    if (
      result.justDetached &&
      mesh &&
      freeBodies.length < freeBodyCap
    ) {
      detached = detachPanel(hit.panelId, hit.worldNormal, hit.rng)
    }

    // Refresh drivability + emitter intensities so callers reading
    // these on the same frame see the updated values.
    lastDrivability = derive(panels)
    emitter.setIntensity01('smoke', smokeIntensity(panels))
    emitter.setIntensity01('fire', fireIntensity(panels))

    return { detached }
  }

  function detachPanel(
    id: PanelId,
    worldNormal: Vector3,
    rng: () => number,
  ): Object3D | null {
    const mesh = asset.panelMeshes[id]
    if (!mesh) return null
    // Capture world transform so the freed panel inherits its visible
    // position / orientation / scale. Then unparent and reparent to
    // the world scene at the captured transform.
    asset.group.updateWorldMatrix(true, true)
    const worldPos = mesh.getWorldPosition(new Vector3())
    const worldQuat = mesh.getWorldQuaternion(new Quaternion())
    const worldScale = mesh.getWorldScale(new Vector3())
    mesh.removeFromParent()
    mesh.position.copy(worldPos)
    mesh.quaternion.copy(worldQuat)
    mesh.scale.copy(worldScale)
    mesh.visible = true
    scene.add(mesh)
    // Spawn into the integrator. The normal is the world-outward
    // direction; we project it onto XZ for the linear kick.
    const nx = worldNormal.x
    const nz = worldNormal.z
    const len = Math.hypot(nx, nz) || 1
    freeBodies.push(
      spawnFreeBody(mesh, {
        position: { x: worldPos.x, y: worldPos.y, z: worldPos.z },
        outward: { nx: nx / len, nz: nz / len },
        linearSpeed: 4.5,
        upKick: 3.5,
        rng,
      }),
    )
    return mesh
  }

  function tick(
    dtSec: number,
    spawnPos: { x: number; y: number; z: number } = { x: 0, y: 1.2, z: 0 },
  ): void {
    // Recompute every dirty deformer. The deformer itself skips work
    // when nothing changed since the last call.
    for (const id of Object.keys(deformers) as PanelId[]) {
      const d = deformers[id]
      if (d) d.recompute()
    }
    emitter.tick(dtSec, spawnPos)
  }

  function repair(): void {
    panels = initAllPanels()
    totalHits = 0
    for (const id of Object.keys(deformers) as PanelId[]) {
      const d = deformers[id]
      if (d) d.reset()
    }
    for (const id of Object.keys(wearHandles) as PanelId[]) {
      const h = wearHandles[id]
      const panel = panels[id]
      if (h && panel) applyWear(h, fractionOf(panel))
    }
    emitter.reset()
    emitter.setIntensity01('smoke', 0)
    emitter.setIntensity01('fire', 0)
    lastDrivability = derive(panels)
  }

  function detonate(nowMs: number, rng: () => number): Object3D[] {
    // Drive every panel HP to zero in panel order. We still go through
    // applyHit-like dispatch so the deformer, decals, wear, smoke, and
    // detach pipeline all run. The caller can stagger these across
    // frames (60ms apart) so it reads as a chain reaction; this
    // function applies them immediately, leaving the staggering to
    // the caller.
    const detached: Object3D[] = []
    for (const id of Object.keys(PANELS) as PanelId[]) {
      const panel = panels[id]
      if (!panel || panel.detached) continue
      const mesh = asset.panelMeshes[id]
      const worldPoint = mesh
        ? mesh.getWorldPosition(new Vector3())
        : new Vector3(0, 1.2, 0)
      // Outward normal pointing roughly upward + out from the car so
      // detached parts fly believably.
      const wn = mesh
        ? mesh
            .getWorldPosition(new Vector3())
            .sub(asset.group.getWorldPosition(new Vector3()))
            .setY(0.3)
            .normalize()
        : new Vector3(0, 1, 0)
      const result = applyHit({
        panelId: id,
        worldPoint,
        worldNormal: wn,
        amount: PANELS[id].maxHp + 1,
        nowMs,
        rng,
      })
      if (result.detached) detached.push(result.detached)
    }
    return detached
  }

  function getDrivability(): Drivability {
    return lastDrivability
  }

  function getPanels(): Readonly<Record<PanelId, PanelState>> {
    return panels
  }

  function getTotalHits(): number {
    return totalHits
  }

  function dispose(): void {
    for (const id of Object.keys(deformers) as PanelId[]) {
      const d = deformers[id]
      if (d) d.dispose()
    }
    for (const id of Object.keys(wearHandles) as PanelId[]) {
      const h = wearHandles[id]
      if (h) disposeWearHandle(h)
    }
    decalPool.dispose()
    emitter.dispose()
  }

  // Initial drivability snapshot so callers reading getDrivability()
  // before the first hit get a sensible value.
  lastDrivability = derive(panels)

  return {
    applyHit,
    tick,
    repair,
    detonate,
    getDrivability,
    getPanels,
    getTotalHits,
    dispose,
    asset,
  }
}

// Helper used by the client component when raycasting: given a Mesh
// that was hit, walk up to its panel ancestor name and return the
// matching PanelId. Returns null when the mesh is not part of a known
// panel (e.g. the player clicked on a wheel or a headlight).
export function panelIdForMesh(
  asset: DestructionAsset,
  hit: Mesh,
): PanelId | null {
  for (const id of Object.keys(asset.panelMeshes) as PanelId[]) {
    const panelMesh = asset.panelMeshes[id]
    if (!panelMesh) continue
    if (panelMesh === hit) return id
    // The hit might be a primitive child of a Group named for the
    // panel; walk up parents looking for a match.
    let n: Object3D | null = hit.parent
    while (n) {
      if (n === panelMesh) return id
      n = n.parent
    }
  }
  return null
}
