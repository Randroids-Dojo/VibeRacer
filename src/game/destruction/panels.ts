// Static panel catalogue + per-part state for the Destruction Lab.
// Panels mirror the Kenney sliced sedan: hood, trunk, two doors, body
// (the chassis shell minus the detachables), and a synthetic "engine"
// part that has no submesh but is the HP pool that drives stall + smoke.
// Engine HP drains alongside the front-end panels (hood, body); a
// runtime helper at the bottom of this module computes the blend.

export type PanelId =
  | 'hood'
  | 'trunk'
  | 'door_l'
  | 'door_r'
  | 'body'
  | 'engine'

export interface PanelConfig {
  id: PanelId
  // The contract submesh name on the loaded GLB. null for the synthetic
  // engine pool, which is not a visible mesh.
  submesh: string | null
  // Display name in the HUD.
  label: string
  // Maximum HP for this panel. Tuned so a hood goes in ~3 solid hits,
  // doors in ~4, body in ~6, engine in ~5 once front-end damage starts
  // bleeding into it.
  maxHp: number
  // HP value at which the panel detaches from the car. null means the
  // panel never detaches (body, engine).
  detachAtHp: number | null
  // Whether the deformer should subdivide and dent this panel's mesh.
  // Lights, wheels, glass slots are excluded because dents on them look
  // worse than not denting at all.
  deformable: boolean
}

export const PANEL_ORDER: readonly PanelId[] = [
  'hood',
  'trunk',
  'door_l',
  'door_r',
  'body',
  'engine',
]

export const PANELS: Readonly<Record<PanelId, PanelConfig>> = {
  hood: {
    id: 'hood',
    submesh: 'hood',
    label: 'Hood',
    maxHp: 60,
    detachAtHp: 0,
    deformable: true,
  },
  trunk: {
    id: 'trunk',
    submesh: 'trunk',
    label: 'Trunk',
    maxHp: 60,
    detachAtHp: 0,
    deformable: true,
  },
  door_l: {
    id: 'door_l',
    submesh: 'door_l',
    label: 'Door L',
    maxHp: 80,
    detachAtHp: 0,
    deformable: true,
  },
  door_r: {
    id: 'door_r',
    submesh: 'door_r',
    label: 'Door R',
    maxHp: 80,
    detachAtHp: 0,
    deformable: true,
  },
  body: {
    id: 'body',
    submesh: 'body',
    label: 'Body',
    maxHp: 140,
    detachAtHp: null,
    deformable: true,
  },
  engine: {
    id: 'engine',
    submesh: null,
    label: 'Engine',
    maxHp: 100,
    detachAtHp: null,
    deformable: false,
  },
}

export interface PanelState {
  id: PanelId
  hp: number
  detached: boolean
  // Cumulative number of impacts this panel has absorbed since the last
  // repair. The HUD reads this for the hit counter; deform.ts uses it
  // only as a debug signal.
  hits: number
}

export function initPanelState(id: PanelId): PanelState {
  return {
    id,
    hp: PANELS[id].maxHp,
    detached: false,
    hits: 0,
  }
}

export function initAllPanels(): Record<PanelId, PanelState> {
  return {
    hood: initPanelState('hood'),
    trunk: initPanelState('trunk'),
    door_l: initPanelState('door_l'),
    door_r: initPanelState('door_r'),
    body: initPanelState('body'),
    engine: initPanelState('engine'),
  }
}

// Subtract damage from a panel and report whether this hit crossed the
// detach threshold (so the caller can pop the panel into a free body).
// Detached panels absorb no further damage. Engine never returns a
// detach event because its threshold is null.
export interface ApplyResult {
  damageDealt: number
  newHp: number
  justDetached: boolean
}

export function applyPanelDamage(
  state: PanelState,
  amount: number,
): ApplyResult {
  if (state.detached) {
    return { damageDealt: 0, newHp: state.hp, justDetached: false }
  }
  const safe = Number.isFinite(amount) && amount > 0 ? amount : 0
  const before = state.hp
  const after = Math.max(0, before - safe)
  state.hp = after
  state.hits += safe > 0 ? 1 : 0
  const config = PANELS[state.id]
  const justDetached =
    config.detachAtHp !== null && before > config.detachAtHp && after <= config.detachAtHp
  if (justDetached) state.detached = true
  return { damageDealt: before - after, newHp: after, justDetached }
}

// Convenience accessors used by drivability / HUD code.
export function fractionOf(state: PanelState): number {
  const max = PANELS[state.id].maxHp
  return max > 0 ? state.hp / max : 0
}

// Damage that bleeds onto the engine from a hit on a body / hood panel.
// Engine HP drains at a fraction of the impact so the engine outlasts
// any single panel but eventually fails once the front of the car is
// destroyed. Tuned for a sedan: hood and body each pipe ~35% of their
// hit into the engine; doors and trunk do not (cosmetic side / rear).
const ENGINE_BLEED: Record<PanelId, number> = {
  hood: 0.35,
  body: 0.35,
  trunk: 0,
  door_l: 0,
  door_r: 0,
  // A direct engine hit is unusual since the engine has no mesh, but
  // the orchestrator may forward damage explicitly. Full bleed because
  // there is no buffer.
  engine: 1,
}

export function engineBleedFor(sourcePanel: PanelId, amount: number): number {
  const mul = ENGINE_BLEED[sourcePanel] ?? 0
  const safe = Number.isFinite(amount) && amount > 0 ? amount : 0
  return safe * mul
}
