import {
  Group,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
} from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { subdivideN } from './subdivide'
import { PANELS, type PanelId } from './panels'

// Independent loader for the Destruction Lab. Mirrors the derby loader's
// shape (named submeshes, wheel pivots) but is intentionally separate so
// the destruction stack does not couple to derby's lifecycle. The
// destruction lab owns the loaded asset end-to-end: subdivision pass on
// deformable panels happens on load, materials are cloned per-panel so
// wear and dents stay scoped, wheels get steer + spin pivots so the
// integrator can drive them.

export type WheelName = 'wheel_fl' | 'wheel_fr' | 'wheel_rl' | 'wheel_rr'

export interface WheelPivot {
  steer: Group
  spin: Group
}

export interface DestructionAsset {
  group: Group
  // Map from PanelId to the resolved Mesh. Deformable panels are
  // single Mesh instances post-subdivision; non-deformable named
  // submeshes (headlights, etc.) are not exposed here because the lab
  // does not need to address them by panel id. Engine has no mesh.
  panelMeshes: Partial<Record<PanelId, Mesh>>
  wheelPivots: Record<WheelName, WheelPivot>
  dispose(): void
}

export interface LoadOptions {
  // Path to the GLB under /public. The lab ships with the sedan as
  // the hero car, but the option is plumbed so a follow-up can swap
  // in another variant without changing the loader signature.
  modelUrl: string
  paintColor: number
  // How many subdivision passes to run on deformable panels. 1 is
  // plenty for Kenney sedan panels; 2 quadruples the cost.
  subdivisionPasses?: number
}

// One-shot loader. The lab calls this on mount; on Repair it disposes
// the previous asset and reloads via this function so the geometry
// (which the deformer mutates in place) starts clean.
export async function loadDestructionCar(
  options: LoadOptions,
): Promise<DestructionAsset> {
  const loader = new GLTFLoader()
  const gltf = await loader.loadAsync(options.modelUrl)
  const root = gltf.scene.clone(true)
  // Hoist children out of the GLB's possibly-wrapped root group so
  // direct-child lookups by name find the named submeshes at the top.
  const group = new Group()
  group.name = 'destruction.car'
  for (const child of [...root.children]) group.add(child)

  // Apply paint tint to every named paint panel. Materials are cloned
  // so subsequent wear edits stay scoped to this car instance.
  tintPaintPanels(group, options.paintColor)

  // Resolve panel meshes from the GLB's named submeshes. The GLB ships
  // each panel as either a Mesh or a Group of one Mesh (Blender's
  // exporter quirks). We find the first Mesh descendant for each name.
  const panelMeshes: Partial<Record<PanelId, Mesh>> = {}
  for (const id of Object.keys(PANELS) as PanelId[]) {
    const cfg = PANELS[id]
    if (!cfg.submesh) continue
    const node = findChildByName(group, cfg.submesh)
    if (!node) continue
    const mesh = firstMeshOf(node)
    if (mesh) panelMeshes[id] = mesh
  }

  // Subdivide deformable panels so the CPU deformer has enough verts
  // to dent visibly. Kenney panels arrive at ~12 to 24 tris; one
  // subdivision pass brings them into the 50 to 100 tri range, which
  // is enough for a noticeable dent without blowing up the budget.
  const passes = options.subdivisionPasses ?? 1
  for (const id of Object.keys(panelMeshes) as PanelId[]) {
    if (!PANELS[id].deformable) continue
    const mesh = panelMeshes[id]
    if (!mesh) continue
    const subdivided = subdivideN(mesh.geometry, passes)
    if (subdivided !== mesh.geometry) {
      mesh.geometry.dispose()
      mesh.geometry = subdivided
    }
  }

  // Wheel pivots: wrap each wheel mesh in a steer + spin Group so the
  // lab can drive turn-and-roll independently each frame. Mirrors the
  // derby loader's approach but lives in this module so the
  // destruction stack does not import from the derby tree.
  const wheelPivots = attachWheelPivots(group)

  return {
    group,
    panelMeshes,
    wheelPivots,
    dispose() {
      group.traverse((node) => {
        if (node instanceof Mesh) {
          node.geometry.dispose()
          const m = node.material
          if (Array.isArray(m)) {
            for (const item of m) item.dispose()
          } else if (m) {
            m.dispose()
          }
        }
      })
    },
  }
}

const PAINT_NODE_NAMES = new Set(['body', 'hood', 'trunk', 'door_l', 'door_r'])

function tintPaintPanels(root: Group, paintColor: number): void {
  root.traverse((node) => {
    if (!PAINT_NODE_NAMES.has(node.name)) return
    for (const mesh of meshesOf(node)) {
      const mat = mesh.material
      if (Array.isArray(mat)) {
        mesh.material = mat.map((m) => recolorMaterial(m, paintColor))
      } else if (mat) {
        mesh.material = recolorMaterial(mat, paintColor)
      }
    }
  })
}

function recolorMaterial(mat: unknown, paintColor: number): MeshStandardMaterial {
  const clone = (mat as MeshStandardMaterial).clone()
  clone.color.setHex(paintColor)
  return clone
}

function findChildByName(root: Object3D, name: string): Object3D | null {
  let found: Object3D | null = null
  root.traverse((node) => {
    if (found) return
    if (node.name === name) found = node
  })
  return found
}

function firstMeshOf(node: Object3D): Mesh | null {
  if (node instanceof Mesh) return node
  let found: Mesh | null = null
  node.traverse((child) => {
    if (found) return
    if (child instanceof Mesh) found = child
  })
  return found
}

function meshesOf(node: Object3D): Mesh[] {
  const out: Mesh[] = []
  node.traverse((child) => {
    if (child instanceof Mesh) out.push(child)
  })
  return out
}

const WHEEL_NAMES: WheelName[] = ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr']

function attachWheelPivots(parent: Group): Record<WheelName, WheelPivot> {
  parent.updateMatrixWorld(true)
  const pivots = {} as Record<WheelName, WheelPivot>
  for (const name of WHEEL_NAMES) {
    const wheel = findChildByName(parent, name)
    if (!wheel) {
      // Defensive: synthesize an empty pivot pair so the orchestrator
      // does not need null-checks. The lab does not steer the empty
      // pivots and the wheel mesh stays wherever the GLB put it.
      pivots[name] = { steer: new Group(), spin: new Group() }
      continue
    }
    const local = wheel.position.clone()
    if (wheel.parent && wheel.parent !== parent) {
      wheel.getWorldPosition(local)
      parent.worldToLocal(local)
    }
    const steer = new Group()
    steer.name = `${name}_steer`
    steer.position.copy(local)
    const spin = new Group()
    spin.name = `${name}_spin`
    steer.add(spin)
    spin.add(wheel)
    wheel.position.set(0, 0, 0)
    parent.add(steer)
    pivots[name] = { steer, spin }
  }
  return pivots
}
