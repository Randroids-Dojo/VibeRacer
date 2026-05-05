import { z } from 'zod'
import { CarParamsSchema, InputModeSchema } from './tuningSettings'
import { ReplaySchema } from './replay'
import { TimeOfDaySchema } from './lighting'
import { WeatherSchema } from './weather'
import { TrackBiomeSchema } from './biomes'
export { TrackBiomeSchema } from './biomes'
import {
  MAX_DECORATIONS_PER_TRACK,
  TrackDecorationSchema,
} from './decorations'
import { footprintCellKeys } from '@/game/trackFootprint'
export {
  MAX_DECORATIONS_PER_TRACK,
  TrackDecorationKindSchema,
  TrackDecorationSchema,
} from './decorations'
export {
  TrackMusicScaleFlavorSchema,
  TrackMusicSchema,
  MusicFinishStingerPatternSchema,
  MusicStepPatternSchema,
  MusicVoiceConfigSchema,
  MusicWaveSchema,
} from './trackMusic'
export type { TrackMusic, TrackMusicScaleFlavor } from './trackMusic'

export const PieceTypeSchema = z.enum([
  'straight',
  'left90',
  'right90',
  'scurve',
  'scurveLeft',
  'sweepRight',
  'sweepLeft',
  'megaSweepRight',
  'megaSweepLeft',
  'hairpin',
  'hairpinTight',
  'hairpinWide',
  'arc45',
  'arc45Left',
  'diagonal',
  'wideArc45Right',
  'wideArc45Left',
  'diagonalSweepRight',
  'diagonalSweepLeft',
  'kinkRight',
  'kinkLeft',
  'offsetStraightRight',
  'offsetStraightLeft',
  'grandSweepRight',
  'grandSweepLeft',
  'flexStraight',
])
export type PieceType = z.infer<typeof PieceTypeSchema>

export const RotationSchema = z.union([
  z.literal(0),
  z.literal(90),
  z.literal(180),
  z.literal(270),
])
export type Rotation = z.infer<typeof RotationSchema>

export const PieceFootprintCellSchema = z
  .object({
    dr: z.number().int(),
    dc: z.number().int(),
  })
  .strict()
export type PieceFootprintCell = z.infer<typeof PieceFootprintCellSchema>

// Flex straight runs from the anchor cell's south edge midpoint to the cell at
// (anchor.row + dr, anchor.col + dc)'s north edge midpoint, in the local frame
// at rotation 0. Endpoints sit at row +0.5 and row (dr - 0.5) in cell units,
// so the vertical run is |dr - 1| cells (i.e. |dr| + 1 cells when dr is
// negative, which is the only allowed sign). The line angle off cardinal is
// therefore atan2(|dc|, |dr - 1|), which can be any sub-45 (or super-45)
// angle the user picks. Constraints: the line must travel forward
// (dr < 0 in the local frame) so it has a well-defined entry and exit.
export const FLEX_STRAIGHT_MIN_LENGTH = 1
export const FLEX_STRAIGHT_MAX_LENGTH = 12
export const FLEX_STRAIGHT_MAX_LATERAL = 8

export const FlexStraightSpecSchema = z
  .object({
    dr: z
      .number()
      .int()
      .min(-FLEX_STRAIGHT_MAX_LENGTH)
      .max(-FLEX_STRAIGHT_MIN_LENGTH),
    dc: z.number().int().min(-FLEX_STRAIGHT_MAX_LATERAL).max(FLEX_STRAIGHT_MAX_LATERAL),
  })
  .strict()
export type FlexStraightSpec = z.infer<typeof FlexStraightSpecSchema>

export const DEFAULT_FLEX_STRAIGHT_SPEC: FlexStraightSpec = { dr: -3, dc: 1 }

export const PieceSchema = z
  .object({
    type: PieceTypeSchema,
    row: z.number().int(),
    col: z.number().int(),
    rotation: RotationSchema,
    footprint: z.array(PieceFootprintCellSchema).min(1).optional(),
    flex: FlexStraightSpecSchema.optional(),
  })
  .superRefine((piece, ctx) => {
    if (piece.type === 'flexStraight' && piece.flex === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['flex'],
        message: 'flexStraight requires a flex spec',
      })
    }
    if (piece.type !== 'flexStraight' && piece.flex !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['flex'],
        message: 'flex is only allowed on flexStraight pieces',
      })
    }
  })
export type Piece = z.infer<typeof PieceSchema>

export const TrackCheckpointSchema = z
  .object({
    row: z.number().int(),
    col: z.number().int(),
  })
  .strict()
export type TrackCheckpoint = z.infer<typeof TrackCheckpointSchema>

export const MAX_PIECES_PER_TRACK = 64
export const MIN_CHECKPOINT_COUNT = 3

const CheckpointCountSchema = z
  .number()
  .int()
  .min(MIN_CHECKPOINT_COUNT)
  .max(MAX_PIECES_PER_TRACK)

// Optional per-track-author "preferred mood": a time-of-day and / or weather
// preset baked into the saved track version. The race page applies these on
// load so every player sees the author's intended look (unless the player
// turns off the "respect track mood" toggle in Settings). Both fields are
// optional so a track author can pick one, both, or neither. The mood is NOT
// included in the version hash, so adding or changing the mood on an existing
// track keeps every prior leaderboard entry intact.
export const TrackMoodSchema = z
  .object({
    timeOfDay: TimeOfDaySchema.optional(),
    weather: WeatherSchema.optional(),
  })
  .strict()
export type TrackMood = z.infer<typeof TrackMoodSchema>

export type TrackBiome = z.infer<typeof TrackBiomeSchema>
export type TrackDecoration = z.infer<typeof TrackDecorationSchema>

export const TrackSchema = z
  .object({
    pieces: z.array(PieceSchema).min(1).max(MAX_PIECES_PER_TRACK),
    checkpointCount: CheckpointCountSchema.optional(),
    checkpoints: z.array(TrackCheckpointSchema)
      .min(MIN_CHECKPOINT_COUNT)
      .max(MAX_PIECES_PER_TRACK)
      .optional(),
    mood: TrackMoodSchema.optional(),
    biome: TrackBiomeSchema.optional(),
    decorations: z.array(TrackDecorationSchema)
      .max(MAX_DECORATIONS_PER_TRACK)
      .optional(),
    creatorTuning: CarParamsSchema.optional(),
  })
  .superRefine((track, ctx) => {
    if (
      track.checkpointCount !== undefined &&
      track.checkpointCount > track.pieces.length
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['checkpointCount'],
        message: 'checkpointCount must not exceed piece count',
      })
    }
    if (track.checkpointCount !== undefined && track.checkpoints !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['checkpoints'],
        message: 'checkpoints cannot be combined with checkpointCount',
      })
    }
    if (track.checkpoints !== undefined) {
      const cells = new Set(track.pieces.flatMap((p) => footprintCellKeys(p)))
      const seen = new Set<string>()
      const startKey =
        track.pieces.length > 0
          ? `${track.pieces[0].row},${track.pieces[0].col}`
          : null
      for (let i = 0; i < track.checkpoints.length; i++) {
        const cp = track.checkpoints[i]
        const key = `${cp.row},${cp.col}`
        if (!cells.has(key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['checkpoints', i],
            message: 'checkpoint must be placed on a track piece',
          })
        }
        if (key === startKey) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['checkpoints', i],
            message: 'checkpoint cannot be placed on the start piece',
          })
        }
        if (seen.has(key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['checkpoints', i],
            message: 'duplicate checkpoint',
          })
        }
        seen.add(key)
      }
    }
    if (track.decorations !== undefined) {
      const pieceCells = new Set(track.pieces.map((p) => `${p.row},${p.col}`))
      const seenDecorations = new Set<string>()
      for (let i = 0; i < track.decorations.length; i++) {
        const decoration = track.decorations[i]
        const key = `${decoration.row},${decoration.col}`
        if (pieceCells.has(key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['decorations', i],
            message: 'decoration cannot be placed on a track piece',
          })
        }
        if (seenDecorations.has(key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['decorations', i],
            message: 'duplicate decoration cell',
          })
        }
        seenDecorations.add(key)
      }
    }
  })
export type Track = z.infer<typeof TrackSchema>

export const TrackVersionSchema = z.object({
  pieces: z.array(PieceSchema),
  checkpointCount: CheckpointCountSchema.optional(),
  checkpoints: z.array(TrackCheckpointSchema)
    .min(MIN_CHECKPOINT_COUNT)
    .max(MAX_PIECES_PER_TRACK)
    .optional(),
  mood: TrackMoodSchema.optional(),
  biome: TrackBiomeSchema.optional(),
  decorations: z.array(TrackDecorationSchema)
    .max(MAX_DECORATIONS_PER_TRACK)
    .optional(),
  // Snapshot of the author's car setup at save time. Surfaces in the pre-race
  // setup picker as "Track creator's setup" so a racer can race the track the
  // way the author intended. Optional so versions saved before this field was
  // introduced still parse.
  creatorTuning: CarParamsSchema.optional(),
  createdByRacerId: z.string().uuid(),
  createdAt: z.string().datetime(),
})
export type TrackVersion = z.infer<typeof TrackVersionSchema>

export const InitialsSchema = z
  .string()
  .transform((v) => v.toUpperCase())
  .pipe(z.string().regex(/^[A-Z]{3}$/))
export type Initials = z.infer<typeof InitialsSchema>

export const RacerIdSchema = z.string().uuid()
export type RacerId = z.infer<typeof RacerIdSchema>

export const SlugSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'slug must be kebab-case')
export type Slug = z.infer<typeof SlugSchema>

export function normalizeSlug(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .replace(/^-+/, '')
    .slice(0, 128)
}

export const VersionHashSchema = z.string().regex(/^[a-f0-9]{64}$/)
export type VersionHash = z.infer<typeof VersionHashSchema>

export const RaceTokenPayloadSchema = z.object({
  slug: SlugSchema,
  versionHash: VersionHashSchema,
  nonce: z.string().regex(/^[a-f0-9]{32}$/),
  issuedAt: z.number().int().positive(),
  racerId: RacerIdSchema,
})
export type RaceTokenPayload = z.infer<typeof RaceTokenPayloadSchema>

export const CheckpointHitSchema = z.object({
  cpId: z.number().int().nonnegative(),
  tMs: z.number().int().nonnegative(),
})
export type CheckpointHit = z.infer<typeof CheckpointHitSchema>

export const SubmissionSchema = z.object({
  token: z.string().min(1),
  checkpoints: z.array(CheckpointHitSchema).min(1),
  lapTimeMs: z.number().int().positive(),
  initials: InitialsSchema,
  // Both fields are optional to keep older clients submitting. The route
  // backfills missing values from defaults / 'keyboard'.
  tuning: CarParamsSchema.optional(),
  inputMode: InputModeSchema.optional(),
  // Optional ghost-car replay path for the lap. Old clients omit it; the
  // server stores it when present so future races can show this lap as a
  // ghost.
  replay: ReplaySchema.optional(),
})
export type Submission = z.infer<typeof SubmissionSchema>
