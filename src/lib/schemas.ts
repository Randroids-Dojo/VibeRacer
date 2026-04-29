import { z } from 'zod'
import { CarParamsSchema, InputModeSchema } from './tuningSettings'
import { ReplaySchema } from './replay'
import { TimeOfDaySchema } from './lighting'
import { WeatherSchema } from './weather'
import {
  DEFAULT_TRACK_TRANSMISSION,
  TRACK_TRANSMISSION_MODES,
} from '@/game/transmission'

export const PieceTypeSchema = z.enum([
  'straight',
  'left90',
  'right90',
  'scurve',
  'scurveLeft',
  'sweepRight',
  'sweepLeft',
])
export type PieceType = z.infer<typeof PieceTypeSchema>

export const RotationSchema = z.union([
  z.literal(0),
  z.literal(90),
  z.literal(180),
  z.literal(270),
])
export type Rotation = z.infer<typeof RotationSchema>

export const PieceSchema = z.object({
  type: PieceTypeSchema,
  row: z.number().int(),
  col: z.number().int(),
  rotation: RotationSchema,
})
export type Piece = z.infer<typeof PieceSchema>

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

export const TrackTransmissionModeSchema = z.enum(TRACK_TRANSMISSION_MODES)
export type TrackTransmissionMode = z.infer<typeof TrackTransmissionModeSchema>

export const TrackSchema = z
  .object({
    pieces: z.array(PieceSchema).min(1).max(MAX_PIECES_PER_TRACK),
    checkpointCount: CheckpointCountSchema.optional(),
    mood: TrackMoodSchema.optional(),
    transmission: TrackTransmissionModeSchema.default(DEFAULT_TRACK_TRANSMISSION),
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
  })
export type Track = z.infer<typeof TrackSchema>

export const TrackVersionSchema = z.object({
  pieces: z.array(PieceSchema),
  checkpointCount: CheckpointCountSchema.optional(),
  mood: TrackMoodSchema.optional(),
  transmission: TrackTransmissionModeSchema.default(DEFAULT_TRACK_TRANSMISSION),
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
