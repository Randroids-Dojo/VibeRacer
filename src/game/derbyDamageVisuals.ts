import {
  BoxGeometry,
  Color,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  Quaternion,
  Vector3,
} from 'three'
import {
  meshesOf,
  type DerbyVehicleAsset,
  type RequiredSubmeshName,
} from './derbyVehicleLoader'
import type { DerbyCarState } from './derbyVehicleState'

// Damage visualization for derby mode. Maps a car's health (0..maxHealth)
// to visible decay: paint darkening, broken lights, smoke + fire markers,
// and per-hit panel detachment. The visualizer is stateful per car: it
// holds the original paint color so successive tier changes do not
// compound, and it tracks which panels have already been detached so a
// second hard hit does not detach the same panel twice.
//
// Effects use simple primitives (translucent boxes for smoke and fire,
// material swaps for lights). Particle systems and decal overlays are
// open followups; the visible-pixel decay required by RULE 10 is met
// because every tier change moves a mesh's material color or visibility.

export type DamageTier = 'pristine' | 'light' | 'moderate' | 'heavy' | 'critical'

export const DAMAGE_TIER_HEALTH_FRACTIONS = {
  pristine: 0.75,
  light: 0.6,
  moderate: 0.4,
  heavy: 0.2,
} as const

export function tierFromFraction(fraction: number): DamageTier {
  if (fraction > DAMAGE_TIER_HEALTH_FRACTIONS.pristine) return 'pristine'
  if (fraction > DAMAGE_TIER_HEALTH_FRACTIONS.light) return 'light'
  if (fraction > DAMAGE_TIER_HEALTH_FRACTIONS.moderate) return 'moderate'
  if (fraction > DAMAGE_TIER_HEALTH_FRACTIONS.heavy) return 'heavy'
  return 'critical'
}

const TIER_PAINT_MULTIPLIER: Record<DamageTier, number> = {
  pristine: 1.0,
  light: 0.85,
  moderate: 0.7,
  heavy: 0.6,
  critical: 0.5,
}

// Roughly the upper third of a clamped hit (MAX_HIT_DAMAGE in derbyDamage).
// Tuned so a hard ram detaches a panel, while mild side-bumps do not.
const PANEL_DETACH_DAMAGE_THRESHOLD = 12
const PAINT_TARGET_NAMES: RequiredSubmeshName[] = ['body', 'hood', 'trunk', 'door_l', 'door_r']
const DETACHABLE_PANELS: RequiredSubmeshName[] = ['hood', 'trunk', 'door_l', 'door_r']

const SMOKE_COLOR = new Color(0x444444)
const FIRE_COLOR = new Color(0xff5022)

export interface DerbyDamageVisualizer {
  // Update visuals from the current car state. Idempotent and cheap.
  update(state: DerbyCarState): void
  // Roll a panel detach for this hit. amount is the clamped damage;
  // worldNx/worldNz is the contact normal in world XZ pointing toward the
  // attacker; victimHeading is the victim's heading in radians (0 = +X).
  // The visualizer rotates the normal into the victim's local frame
  // before picking a panel so a side hit on a rotated car still reads as
  // a side hit. Returns the detached panel mesh (with world-space
  // transform baked in) when a panel actually detaches, or null
  // otherwise.
  applyHit(
    amount: number,
    worldNx: number,
    worldNz: number,
    victimHeading: number,
    rng: () => number,
  ): Object3D | null
  // Free any allocations the visualizer added to the asset. Restores the
  // original paint and light materials so the asset can be reused for a
  // future round (not used in v1; round end disposes the asset entirely).
  dispose(): void
}

interface PaintEntry {
  mesh: Mesh
  originalColor: Color
}

interface LightEntry {
  mesh: Mesh
  originalMaterial: MeshStandardMaterial
  brokenMaterial: MeshStandardMaterial
  broken: boolean
}

export function createDamageVisualizer(
  asset: DerbyVehicleAsset,
): DerbyDamageVisualizer {
  // Capture original paint colors. We work against material color rather
  // than swapping materials so the renderer can keep the same instance
  // across tier changes. A multi-primitive node (e.g. body with paint +
  // glass slots from the Kenney source) becomes one PaintEntry per Mesh
  // descendant; tier changes apply uniformly to every primitive so the
  // whole panel reads as one paint surface.
  const paintEntries: PaintEntry[] = PAINT_TARGET_NAMES.flatMap((name) => {
    const node = asset.submeshes[name]
    if (!node) return []
    return meshesOf(node).map((mesh) => {
      const mat = mesh.material as MeshStandardMaterial
      return { mesh, originalColor: mat.color.clone() }
    })
  })

  const lightEntries: LightEntry[] = (
    [
      'headlight_l',
      'headlight_r',
      'taillight_l',
      'taillight_r',
    ] as RequiredSubmeshName[]
  ).flatMap((name) => {
    const node = asset.submeshes[name]
    if (!node) return []
    return meshesOf(node).map((mesh) => {
      const mat = mesh.material as MeshStandardMaterial
      const broken = new MeshStandardMaterial({
        color: 0x222222,
        emissive: 0x000000,
        roughness: 0.7,
        metalness: 0.0,
      })
      return { mesh, originalMaterial: mat, brokenMaterial: broken, broken: false }
    })
  })

  // Smoke / fire markers: parented to the asset group so they follow the
  // car. Hidden until tier reaches the threshold; scaled with damage.
  const smokeGeo = new BoxGeometry(1.2, 0.6, 1.2)
  const smokeMat = new MeshBasicMaterial({
    color: SMOKE_COLOR,
    transparent: true,
    opacity: 0.0,
  })
  const smoke = new Mesh(smokeGeo, smokeMat)
  smoke.name = 'derbyDamageSmoke'
  smoke.position.set(0, 1.6, 0)
  smoke.visible = false
  asset.group.add(smoke)

  const fireGeo = new BoxGeometry(0.9, 0.7, 0.9)
  const fireMat = new MeshBasicMaterial({
    color: FIRE_COLOR,
    transparent: true,
    opacity: 0.0,
  })
  const fire = new Mesh(fireGeo, fireMat)
  fire.name = 'derbyDamageFire'
  fire.position.set(0, 2.0, 0)
  fire.visible = false
  asset.group.add(fire)

  const detachedPanels = new Set<RequiredSubmeshName>()
  let lastTier: DamageTier = 'pristine'

  function setTier(tier: DamageTier): void {
    const mul = TIER_PAINT_MULTIPLIER[tier]
    for (const entry of paintEntries) {
      const mat = entry.mesh.material as MeshStandardMaterial
      mat.color.copy(entry.originalColor).multiplyScalar(mul)
    }
    // Headlights break first; then taillights at heavy.
    const breakHeadlights = tier === 'moderate' || tier === 'heavy' || tier === 'critical'
    const breakTaillights = tier === 'heavy' || tier === 'critical'
    for (const light of lightEntries) {
      const isHeadlight = light.mesh.name.startsWith('headlight')
      const wantBroken = isHeadlight ? breakHeadlights : breakTaillights
      if (wantBroken && !light.broken) {
        light.mesh.material = light.brokenMaterial
        light.broken = true
      } else if (!wantBroken && light.broken) {
        light.mesh.material = light.originalMaterial
        light.broken = false
      }
    }
    // Smoke / fire markers.
    if (tier === 'heavy' || tier === 'critical') {
      smoke.visible = true
      smokeMat.opacity = tier === 'critical' ? 0.7 : 0.4
    } else {
      smoke.visible = false
      smokeMat.opacity = 0
    }
    if (tier === 'critical') {
      fire.visible = true
      fireMat.opacity = 0.85
    } else {
      fire.visible = false
      fireMat.opacity = 0
    }
    lastTier = tier
  }

  function pickPanelByAngle(
    worldNx: number,
    worldNz: number,
    victimHeading: number,
  ): RequiredSubmeshName | null {
    const candidates = DETACHABLE_PANELS.filter((p) => !detachedPanels.has(p))
    if (candidates.length === 0) return null
    // Rotate the world-space hit normal into the victim's local frame.
    // DerbyCanvas applies group.rotation.y = -heading + PI/2, so the car's
    // local +X (front) maps to the world direction (cos(heading),
    // -sin(heading)). Rotating the world vector by +heading aligns the
    // local frame so local +X is forward and local +Z is right.
    const cos = Math.cos(victimHeading)
    const sin = Math.sin(victimHeading)
    const localFwd = worldNx * cos + worldNz * -sin
    const localRight = worldNx * sin + worldNz * cos
    const absFwd = Math.abs(localFwd)
    const absRight = Math.abs(localRight)
    // Front-on hits (positive forward component) prefer hood; rear-on
    // prefer trunk; side hits prefer the door on the impact side.
    if (absFwd > absRight) {
      const preferred: RequiredSubmeshName = localFwd > 0 ? 'hood' : 'trunk'
      if (candidates.includes(preferred)) return preferred
    } else {
      const preferred: RequiredSubmeshName = localRight > 0 ? 'door_r' : 'door_l'
      if (candidates.includes(preferred)) return preferred
    }
    return candidates[0]
  }

  return {
    update(state: DerbyCarState) {
      const fraction =
        state.maxHealth > 0 ? state.health / state.maxHealth : 0
      const tier = tierFromFraction(fraction)
      if (tier !== lastTier) setTier(tier)
    },
    applyHit(amount, worldNx, worldNz, victimHeading, rng) {
      if (amount < PANEL_DETACH_DAMAGE_THRESHOLD) return null
      // rng is reserved for tie-breaking among equally preferred panels;
      // the angle pick covers the common cases on its own.
      void rng
      const choice = pickPanelByAngle(worldNx, worldNz, victimHeading)
      if (choice === null) return null
      detachedPanels.add(choice)
      const panel = asset.submeshes[choice]
      // Real detach: capture the panel's world transform, remove it from
      // its parent in the car asset, then return it so the caller can add
      // it to the scene as free-standing debris. The panel literally
      // disappears from the car (no more visibility hack) and re-appears
      // in world space at its previous on-car location.
      asset.group.updateWorldMatrix(true, true)
      const worldPos = panel.getWorldPosition(new Vector3())
      const worldQuat = panel.getWorldQuaternion(new Quaternion())
      panel.removeFromParent()
      panel.position.copy(worldPos)
      panel.quaternion.copy(worldQuat)
      panel.visible = true
      return panel
    },
    dispose() {
      smokeGeo.dispose()
      smokeMat.dispose()
      fireGeo.dispose()
      fireMat.dispose()
      for (const light of lightEntries) {
        light.brokenMaterial.dispose()
        if (light.broken) {
          // Restore the original material so the asset's own dispose call
          // releases it normally rather than the broken variant.
          light.mesh.material = light.originalMaterial
        }
      }
      asset.group.remove(smoke)
      asset.group.remove(fire)
    },
  }
}
