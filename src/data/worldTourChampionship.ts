/**
 * Bundled championship data for the World Tour. Read-only at runtime.
 * The shape and helpers live in `src/lib/worldTourChampionship.ts`; this
 * file owns the actual constants the game ships with.
 *
 * The MVP exposes one championship (`world-tour-standard`) with one
 * authored tour (`velvet-coast`) and a four-car grid (player plus three
 * AI). Phase 4 of the World Tour plan adds two more tours and scales the
 * field to 12; Phase 6 fills out the remaining five tours. Every tour
 * carries placeholder `trackIds` that resolve to authored tracks under
 * `public/tours/{tour-id}/`; the manifest extension that lets a track
 * advertise its tour membership lands in Phase 0d.
 */

import {
  FIELD_SIZE_MVP,
  validateChampionship,
  type AiDriver,
  type Championship,
} from '@/lib/worldTourChampionship'

// Three named AI drivers for the four-car MVP grid. The colors are
// distinct enough that the player can tell opponents apart at a glance;
// the names are placeholders that can be re-themed in Phase 6.
const DRIVERS_MVP: AiDriver[] = [
  { id: 'driver-velvet-1', name: 'Rook Vance', color: '#ff5470' },
  { id: 'driver-velvet-2', name: 'Iris Quill', color: '#3da9fc' },
  { id: 'driver-velvet-3', name: 'Otto Lane', color: '#f7c948' },
]

export const VELVET_COAST_TOUR_ID = 'velvet-coast'
export const STANDARD_CHAMPIONSHIP_ID = 'world-tour-standard'

/**
 * The bundled standard championship. Frozen so a stray mutation in the
 * tour-selection UI or the race scene cannot silently corrupt the
 * shared data. Use `findTour`/`nextTourOf` rather than reading
 * `tours[i]` directly so a future re-ordering does not break callers.
 */
export const STANDARD_CHAMPIONSHIP: Championship = Object.freeze({
  id: STANDARD_CHAMPIONSHIP_ID,
  name: 'World Tour',
  drivers: DRIVERS_MVP,
  tours: [
    {
      id: VELVET_COAST_TOUR_ID,
      name: 'Velvet Coast',
      region: 'Velvet Coast',
      theme: {
        primary: '#f4a8c0',
        secondary: '#5b3a8a',
        accent: '#fff1c4',
      },
      weather: 'clear',
      requiredStanding: 2,
      fieldSize: FIELD_SIZE_MVP,
      trackIds: [
        'velvet-coast-1',
        'velvet-coast-2',
        'velvet-coast-3',
        'velvet-coast-4',
      ],
      aiDriverIds: DRIVERS_MVP.map((d) => d.id),
    },
  ],
}) as Championship

// Validate the bundled data at module load. A misshaped championship is
// a programmer error, not a user error; failing loudly here prevents the
// race scene from spawning an invalid grid.
const validation = validateChampionship(STANDARD_CHAMPIONSHIP)
if (!validation.ok) {
  throw new Error(
    `STANDARD_CHAMPIONSHIP failed validation: ${validation.errors.join('; ')}`,
  )
}

/**
 * Convenience accessor for the single bundled championship. Returns the
 * frozen reference; do not mutate.
 */
export function getStandardChampionship(): Championship {
  return STANDARD_CHAMPIONSHIP
}
