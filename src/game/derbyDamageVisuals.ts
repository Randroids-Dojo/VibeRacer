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
  type SubmeshName,
} from './derbyVehicleLoader'
import type { DerbyCarState } from './derbyVehicleState'
import { isDestroyed } from './derbyVehicleState'

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

// Paint darkens gradually with damage. Kept close to 1.0 in the
// early tiers so a lightly damaged car still reads as "in the fight"
// rather than already crumpled; critical-but-still-alive is darker but
// not yet wreck-black. detachAllRemaining (on destruction) handles the
// rest of the "fully wrecked" look.
const TIER_PAINT_MULTIPLIER: Record<DamageTier, number> = {
  pristine: 1.0,
  light: 0.92,
  moderate: 0.82,
  heavy: 0.7,
  critical: 0.6,
}

// Per-hit panel detach is reserved for hard rams. Most hits land in the
// 3 to 10 range; only the top of that band (and any clamped MAX_HIT)
// strips a door mid-fight. Front and rear hits never detach a panel.
const PANEL_DETACH_DAMAGE_THRESHOLD = 9
// Paint targets include the body and the doors so the whole shell
// darkens uniformly with damage. Variants whose asset.submeshes omits
// the optional doors (Kenney sliced sedan/truck/race) simply do not
// contribute door entries to the visualizer's working sets.
const PAINT_TARGET_NAMES: SubmeshName[] = ['body', 'hood', 'trunk', 'door_l', 'door_r']
// Only doors are detachable. The hood and trunk stay welded on for the
// full life of the car; the demo for v3 is that a side hit drops a
// door and nothing else comes off, including on destruction.
const DETACHABLE_PANELS: SubmeshName[] = ['door_l', 'door_r']

const SMOKE_COLOR = new Color(0x444444)
const FIRE_COLOR = new Color(0xff5022)

export interface DerbyDamageVisualizer {
  // Update visuals from the current car state. Idempotent and cheap.
  // Returns the panels that just got detached as a result of this call
  // (a damage-tier transition may detach one or more panels so the car
  // visibly sheds parts as it takes wear). Returns an empty array when
  // nothing changed.
  update(state: DerbyCarState): Object3D[]
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
  // Trigger a brief paint flash (white blend that fades over ~150 ms).
  // Stronger hits flash brighter. The flash decays in tickFlash() so the
  // canvas can call applyFlash() once per hit without managing timers.
  applyFlash(strength: number): void
  // Advance the flash decay by dtSec. Idempotent and cheap; the canvas
  // calls this every frame regardless of whether a flash is active.
  tickFlash(dtSec: number): void
  // Blow off every still-attached detachable panel. Called once when a car
  // is destroyed so the wreck sheds the rest of its panels into the world
  // (regardless of how few hits got it to zero). Returns the list of
  // detached panels in world-space so the caller can hand them to debris.
  detachAllRemaining(): Object3D[]
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
    ] as SubmeshName[]
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

  const detachedPanels = new Set<SubmeshName>()
  // Filter the static DETACHABLE list to panels actually present on this
  // asset; doors are optional on Kenney sliced variants.
  const availableDetachables: SubmeshName[] = DETACHABLE_PANELS.filter(
    (p) => asset.submeshes[p] !== undefined,
  )
  let lastTier: DamageTier = 'pristine'
  // Hit-flash state. flashLevel in [0..1] tracks how strongly the paint
  // is currently blended toward white; the canvas pumps applyFlash() to
  // raise it on each hit, and tickFlash() decays it linearly each frame
  // until it reaches zero. We re-apply the tier color combined with the
  // flash blend whenever flashLevel changes so the same color update path
  // handles both effects.
  let flashLevel = 0
  let lastAppliedFlash = 0
  const FLASH_COLOR = new Color(0xffffff)
  const FLASH_DECAY_PER_SEC = 6

  function repaint(): void {
    const mul = TIER_PAINT_MULTIPLIER[lastTier]
    const flash = flashLevel
    for (const entry of paintEntries) {
      const mat = entry.mesh.material as MeshStandardMaterial
      mat.color
        .copy(entry.originalColor)
        .multiplyScalar(mul)
        .lerp(FLASH_COLOR, flash)
    }
    lastAppliedFlash = flash
  }

  let lastDestroyed = false

  function setTier(tier: DamageTier, destroyed: boolean): void {
    lastTier = tier
    lastDestroyed = destroyed
    // Repaint applies the new tier's paint multiplier alongside the
    // current flash level so a flash that's still mid-decay is preserved
    // when a tier change lands on the same frame.
    repaint()
    // Lights stay intact until the damage is real. Headlights break only
    // at heavy and below so a lightly damaged car still has working
    // running lights; taillights hold until the car is destroyed.
    const breakHeadlights = tier === 'heavy' || tier === 'critical' || destroyed
    const breakTaillights = destroyed
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
    // Smoke ramps up gradually so the player can read how badly hurt a
    // car is at a glance, but fire is reserved for an actual destruction.
    // A critical-but-still-alive car has a heavy smoke plume; only when
    // it is destroyed does the fire light up alongside the wreck tilt.
    if (destroyed) {
      smoke.visible = true
      smokeMat.opacity = 0.8
      fire.visible = true
      fireMat.opacity = 0.85
    } else {
      fire.visible = false
      fireMat.opacity = 0
      if (tier === 'critical') {
        smoke.visible = true
        smokeMat.opacity = 0.55
      } else if (tier === 'heavy') {
        smoke.visible = true
        smokeMat.opacity = 0.35
      } else {
        smoke.visible = false
        smokeMat.opacity = 0
      }
    }
  }

  function pickDoorByHitSide(
    worldNx: number,
    worldNz: number,
    victimHeading: number,
  ): SubmeshName | null {
    // Rotate the world-space hit normal into the victim's local frame.
    // DerbyCanvas applies group.rotation.y = -heading + PI/2, so the car's
    // local +X (front) maps to the world direction (cos(heading),
    // -sin(heading)). Rotating the world vector by +heading aligns the
    // local frame so local +X is forward and local +Z is right.
    const cos = Math.cos(victimHeading)
    const sin = Math.sin(victimHeading)
    const localFwd = worldNx * cos + worldNz * -sin
    const localRight = worldNx * sin + worldNz * cos
    // Only side hits drop a door. A front-on or rear-on hit (where the
    // forward component dominates) leaves the doors alone; the player
    // sees a panel come off only when they actually rammed the side.
    if (Math.abs(localRight) <= Math.abs(localFwd)) return null
    const choice: SubmeshName = localRight > 0 ? 'door_r' : 'door_l'
    if (detachedPanels.has(choice)) return null
    if (!availableDetachables.includes(choice)) return null
    return choice
  }

  function detachPanel(choice: SubmeshName): Object3D | null {
    const panel = asset.submeshes[choice]
    // pickDoorByHitSide only returns names already filtered against
    // availableDetachables; the explicit check keeps the type checker
    // happy and covers the detachAllRemaining path on optional doors.
    if (!panel) return null
    detachedPanels.add(choice)
    // Real detach: capture the panel's world transform, remove it from its
    // parent in the car asset, then return it so the caller can add it to
    // the scene as free-standing debris.
    asset.group.updateWorldMatrix(true, true)
    const worldPos = panel.getWorldPosition(new Vector3())
    const worldQuat = panel.getWorldQuaternion(new Quaternion())
    const worldScale = panel.getWorldScale(new Vector3())
    panel.removeFromParent()
    panel.position.copy(worldPos)
    panel.quaternion.copy(worldQuat)
    panel.scale.copy(worldScale)
    panel.visible = true
    return panel
  }

  return {
    update(state: DerbyCarState) {
      // Health drives paint, smoke, fire, lights. Panel detach is now
      // strictly hit-driven via applyHit; tier transitions never strip
      // a panel on their own, so the only parts that come off mid-fight
      // are the doors when a side-impact lands hard enough.
      const fraction =
        state.maxHealth > 0 ? state.health / state.maxHealth : 0
      const tier = tierFromFraction(fraction)
      const destroyed = isDestroyed(state)
      const tierChanged = tier !== lastTier
      const destroyedChanged = destroyed !== lastDestroyed
      if (tierChanged || destroyedChanged) setTier(tier, destroyed)
      return []
    },
    applyHit(amount, worldNx, worldNz, victimHeading, rng) {
      if (amount < PANEL_DETACH_DAMAGE_THRESHOLD) return null
      void rng
      // Door-only panel mechanic: a left-side hit pops the left door, a
      // right-side hit pops the right door, anything front or rear
      // returns null. The hood and trunk never come off mid-fight.
      const choice = pickDoorByHitSide(worldNx, worldNz, victimHeading)
      if (choice === null) return null
      return detachPanel(choice)
    },
    applyFlash(strength) {
      // Hits stack: a second hit during an active flash drives the level
      // back up to its peak rather than overwriting the decay that's
      // still in progress.
      const target = Math.max(0, Math.min(1, strength))
      if (target > flashLevel) flashLevel = target
      repaint()
    },
    tickFlash(dtSec) {
      if (flashLevel <= 0) {
        // Repaint when the flash JUST settled to ensure paint is back to
        // tier color even if a fractional residue stayed in the
        // multiplier accumulator.
        if (lastAppliedFlash > 0) repaint()
        return
      }
      flashLevel = Math.max(0, flashLevel - FLASH_DECAY_PER_SEC * dtSec)
      repaint()
    },
    detachAllRemaining() {
      const out: Object3D[] = []
      // Snapshot the remaining list before mutation; detachPanel adds to
      // detachedPanels which would otherwise filter mid-iteration.
      const remaining = availableDetachables.filter(
        (p) => !detachedPanels.has(p),
      )
      for (const name of remaining) {
        const panel = detachPanel(name)
        if (panel) out.push(panel)
      }
      return out
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
