import { Color, MeshStandardMaterial } from 'three'

// PBR material wear. As a panel's HP drops, its paint loses gloss and
// darkens toward a sooty target. We clone the material on the first
// damage tick so the wear stays scoped to this car instance (the GLB
// loader uses one shared material across panels by default).
//
// All math is pure and tested. Three.js only enters the picture in
// applyWearTo(), which performs the side effect of mutating the live
// material that the renderer reads each frame.

// Worn roughness curve. Pristine paint stays at the original value;
// fully wrecked paint approaches a near-fully-rough scuffed finish so
// reflections die off as damage accumulates.
export const WORN_ROUGHNESS_TARGET = 0.95
// Worn color target. A warm sooty gray reads as scorched metal under
// the lab's neutral lighting.
export const WORN_COLOR_TARGET = 0x2a2520

export function wornRoughness(
  originalRoughness: number,
  fraction: number,
): number {
  const clamped = clampFraction(fraction)
  // Interpolate from original (clamped fraction = 1) to the worn target
  // (clamped fraction = 0). The original is preserved when the panel
  // is pristine, which is the contract the tests rely on.
  const t = 1 - clamped
  return originalRoughness + (WORN_ROUGHNESS_TARGET - originalRoughness) * t
}

export function wornColor(originalHex: number, fraction: number): Color {
  const clamped = clampFraction(fraction)
  const t = 1 - clamped
  const original = new Color(originalHex)
  const target = new Color(WORN_COLOR_TARGET)
  return original.clone().lerp(target, t)
}

function clampFraction(fraction: number): number {
  if (!Number.isFinite(fraction)) return 0
  if (fraction <= 0) return 0
  if (fraction >= 1) return 1
  return fraction
}

// Side-effecting helper used by the car orchestrator. Clones the
// material on first call so two cars that loaded the same GLB do not
// share dented paint, returns the working material so subsequent calls
// can mutate it in place.
export interface WearHandle {
  // Bookkeeping pointers; the orchestrator passes these back on every
  // tick so we do not need a separate map per panel.
  material: MeshStandardMaterial
  originalColorHex: number
  originalRoughness: number
}

export function createWearHandle(
  source: MeshStandardMaterial,
): WearHandle {
  const cloned = source.clone()
  return {
    material: cloned,
    originalColorHex: cloned.color.getHex(),
    originalRoughness: cloned.roughness,
  }
}

export function applyWear(handle: WearHandle, fraction: number): void {
  handle.material.roughness = wornRoughness(handle.originalRoughness, fraction)
  handle.material.color.copy(
    wornColor(handle.originalColorHex, fraction),
  )
}

export function disposeWearHandle(handle: WearHandle): void {
  handle.material.dispose()
}
