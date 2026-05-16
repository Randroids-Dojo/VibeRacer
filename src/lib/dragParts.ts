import { z } from 'zod'
import { RacingNumberSettingSchema, type RacingNumberSetting } from './racingNumber'

// Drag racing parts catalog. Players cannot tune drag cars with the regular
// CarParams sliders; instead they pick one item per category and the runtime
// derives a CarParams + LaunchProfile from the loadout plus the chosen strip
// (see src/game/dragTuning.ts). The catalog is small on purpose: 5 tires x
// 4 bodies x 5 engines x 4 transmissions gives 400 combinations, enough for
// real choice without ballooning the UI.
//
// Every part carries a weight so the total mass aggregates predictably. The
// weight is in arbitrary units; only the ratio against REFERENCE_WEIGHT_KG in
// dragTuning matters. Tires also carry a baseGrip and a per-surface affinity
// table; the runtime picks one of the five surface keys (dry, wet, snow,
// sand, dirt) based on the strip's biome and weather and multiplies the
// tire's affinity against its baseGrip. The dirt key serves the derby
// arena and is unused by the drag-strip biome resolver today.

const PartIdSchema = z.string().min(1).max(64)

const SurfaceAffinitySchema = z
  .object({
    dry: z.number().finite(),
    wet: z.number().finite(),
    snow: z.number().finite(),
    sand: z.number().finite(),
    // Loose dirt: derby arena surface. Drag strips never map to dirt today
    // via surfaceFromBiomeWeather, so this entry stays unused on the drag
    // path; it lives here so a derby loadout can drive the same tuning
    // pipeline a future variant might want without splitting the affinity
    // schema in two. Initial values mirror each tire's sand affinity.
    dirt: z.number().finite(),
  })
  .strict()

export type SurfaceKey = keyof z.infer<typeof SurfaceAffinitySchema>

export const DragTireSchema = z
  .object({
    id: PartIdSchema,
    label: z.string().min(1),
    weight: z.number().positive(),
    baseGrip: z.number().positive(),
    surfaceAffinity: SurfaceAffinitySchema,
  })
  .strict()
export type DragTire = z.infer<typeof DragTireSchema>

export const DragBodySchema = z
  .object({
    id: PartIdSchema,
    label: z.string().min(1),
    weight: z.number().positive(),
    dragCoefficient: z.number().positive(),
  })
  .strict()
export type DragBody = z.infer<typeof DragBodySchema>

export const DragEngineSchema = z
  .object({
    id: PartIdSchema,
    label: z.string().min(1),
    weight: z.number().positive(),
    launchRpm: z.number().positive(),
    peakPower: z.number().positive(),
  })
  .strict()
export type DragEngine = z.infer<typeof DragEngineSchema>

export const DragTransmissionSchema = z
  .object({
    id: PartIdSchema,
    label: z.string().min(1),
    weight: z.number().positive(),
    firstGearRatio: z.number().positive(),
    topGearRatio: z.number().positive(),
  })
  .strict()
export type DragTransmission = z.infer<typeof DragTransmissionSchema>

export const DragLoadoutSchema = z
  .object({
    tire: PartIdSchema,
    body: PartIdSchema,
    engine: PartIdSchema,
    transmission: PartIdSchema,
    // Car body paint as a 6-digit hex (e.g. "#ff8800") or omitted for the
    // stock GLB colormap. Stored with the leaderboard entry so a future
    // race can rebuild the ghost car in the same livery the racer used.
    paint: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    // Roof racing-number plate setting (enabled, value, plate color, text
    // color). Optional so legacy stored loadouts without a plate keep
    // validating. When present the ghost rebuilds the plate the way the
    // original racer had it; when omitted the ghost shows no plate.
    racingNumber: RacingNumberSettingSchema.optional(),
  })
  .strict()
export type DragLoadout = z.infer<typeof DragLoadoutSchema>

export const DRAG_TIRES: readonly DragTire[] = [
  {
    id: 'slick',
    label: 'Slicks',
    weight: 60,
    baseGrip: 1.15,
    surfaceAffinity: { dry: 1.05, wet: 0.5, snow: 0.45, sand: 0.7, dirt: 0.7 },
  },
  {
    id: 'allRounder',
    label: 'All-rounders',
    weight: 70,
    baseGrip: 1.0,
    surfaceAffinity: { dry: 1.0, wet: 0.95, snow: 0.85, sand: 0.95, dirt: 0.95 },
  },
  {
    id: 'rain',
    label: 'Rain tires',
    weight: 75,
    baseGrip: 0.95,
    surfaceAffinity: { dry: 0.9, wet: 1.2, snow: 0.95, sand: 0.85, dirt: 0.85 },
  },
  {
    id: 'winter',
    label: 'Winter studs',
    weight: 85,
    baseGrip: 0.95,
    surfaceAffinity: { dry: 0.85, wet: 0.95, snow: 1.25, sand: 0.85, dirt: 0.85 },
  },
  {
    id: 'offRoad',
    label: 'Off-road knobby',
    weight: 90,
    baseGrip: 0.92,
    surfaceAffinity: { dry: 0.9, wet: 0.9, snow: 1.05, sand: 1.2, dirt: 1.2 },
  },
] as const

export const DRAG_BODIES: readonly DragBody[] = [
  {
    id: 'lightweight',
    label: 'Lightweight shell',
    weight: 600,
    dragCoefficient: 0.32,
  },
  {
    id: 'standard',
    label: 'Standard chassis',
    weight: 850,
    dragCoefficient: 0.34,
  },
  {
    id: 'reinforced',
    label: 'Reinforced chassis',
    weight: 1100,
    dragCoefficient: 0.38,
  },
  {
    id: 'aero',
    label: 'Aero shell',
    weight: 760,
    dragCoefficient: 0.26,
  },
] as const

export const DRAG_ENGINES: readonly DragEngine[] = [
  {
    id: 'eco',
    label: 'Eco-tune',
    weight: 180,
    launchRpm: 4500,
    peakPower: 140,
  },
  {
    id: 'standard',
    label: 'Standard block',
    weight: 220,
    launchRpm: 6000,
    peakPower: 200,
  },
  {
    id: 'turbo',
    label: 'Turbocharged',
    weight: 260,
    launchRpm: 7000,
    peakPower: 320,
  },
  {
    id: 'race',
    label: 'Race-spec V8',
    weight: 310,
    launchRpm: 8200,
    peakPower: 460,
  },
  {
    id: 'nitro',
    label: 'Nitro injection',
    weight: 290,
    launchRpm: 9000,
    peakPower: 540,
  },
] as const

export const DRAG_TRANSMISSIONS: readonly DragTransmission[] = [
  {
    id: 'short',
    label: 'Short ratio',
    weight: 90,
    firstGearRatio: 3.4,
    topGearRatio: 1.0,
  },
  {
    id: 'standard',
    label: 'Standard ratio',
    weight: 95,
    firstGearRatio: 2.8,
    topGearRatio: 0.85,
  },
  {
    id: 'long',
    label: 'Long ratio',
    weight: 100,
    firstGearRatio: 2.2,
    topGearRatio: 0.62,
  },
  {
    id: 'closeRatio',
    label: 'Close-ratio',
    weight: 110,
    firstGearRatio: 3.0,
    topGearRatio: 0.78,
  },
] as const

export const DEFAULT_DRAG_LOADOUT: DragLoadout = {
  tire: 'allRounder',
  body: 'standard',
  engine: 'standard',
  transmission: 'standard',
}

function lookup<T extends { id: string }>(
  catalog: readonly T[],
  id: string,
  fallback: T,
): T {
  return catalog.find((entry) => entry.id === id) ?? fallback
}

export function findTire(id: string): DragTire {
  return lookup(DRAG_TIRES, id, DRAG_TIRES[1])
}

export function findBody(id: string): DragBody {
  return lookup(DRAG_BODIES, id, DRAG_BODIES[1])
}

export function findEngine(id: string): DragEngine {
  return lookup(DRAG_ENGINES, id, DRAG_ENGINES[1])
}

export function findTransmission(id: string): DragTransmission {
  return lookup(DRAG_TRANSMISSIONS, id, DRAG_TRANSMISSIONS[1])
}

export interface ResolvedDragLoadout {
  tire: DragTire
  body: DragBody
  engine: DragEngine
  transmission: DragTransmission
  paint: string | null
  racingNumber: RacingNumberSetting | null
}

export function resolveLoadout(loadout: DragLoadout): ResolvedDragLoadout {
  return {
    tire: findTire(loadout.tire),
    body: findBody(loadout.body),
    engine: findEngine(loadout.engine),
    transmission: findTransmission(loadout.transmission),
    paint: loadout.paint ?? null,
    racingNumber: loadout.racingNumber ?? null,
  }
}
