/**
 * Bundled championship data for the World Tour. Read-only at runtime.
 * The shape and helpers live in `src/lib/worldTourChampionship.ts`; this
 * file owns the actual constants the game ships with.
 *
 * Three tours ship from Phase 4 (`velvet-coast`, `iron-borough`,
 * `ember-steppe`). The first is the gentle opener at the 4-car MVP
 * field; tours 2 and onward run the full 12-car grid (3 lanes by 4
 * rows). Phase 6 fills out the remaining five tours.
 *
 * Every tour declares placeholder `trackIds` that resolve to authored
 * tracks under `public/tours/{tour-id}/`; the manifest extension that
 * lets a track advertise its tour membership lives in `schemas.ts`.
 */

import {
  FIELD_SIZE_FULL,
  FIELD_SIZE_MVP,
  validateChampionship,
  type AiDriver,
  type Championship,
} from '@/lib/worldTourChampionship'

// AI driver registry. Eleven named opponents so every 12-car tour can
// fill the grid without recycling ids inside a single race. The MVP
// (Velvet Coast) only picks three; later tours draw the full roster.
// Names are deliberately neutral so a future re-theme does not have
// to rewrite the registry.
const DRIVERS: AiDriver[] = [
  { id: 'driver-rook-vance', name: 'Rook Vance', color: '#ff5470' },
  { id: 'driver-iris-quill', name: 'Iris Quill', color: '#3da9fc' },
  { id: 'driver-otto-lane', name: 'Otto Lane', color: '#f7c948' },
  { id: 'driver-mira-stone', name: 'Mira Stone', color: '#7ce0a3' },
  { id: 'driver-kade-russo', name: 'Kade Russo', color: '#c084fc' },
  { id: 'driver-vega-blake', name: 'Vega Blake', color: '#fb923c' },
  { id: 'driver-juno-park', name: 'Juno Park', color: '#22d3ee' },
  { id: 'driver-axel-mori', name: 'Axel Mori', color: '#f43f5e' },
  { id: 'driver-noor-rey', name: 'Noor Rey', color: '#eab308' },
  { id: 'driver-sage-ito', name: 'Sage Ito', color: '#a3e635' },
  { id: 'driver-cleo-vault', name: 'Cleo Vault', color: '#e879f9' },
]

const VELVET_DRIVER_IDS = DRIVERS.slice(0, FIELD_SIZE_MVP - 1).map((d) => d.id)
const FULL_DRIVER_IDS = DRIVERS.slice(0, FIELD_SIZE_FULL - 1).map((d) => d.id)

export const VELVET_COAST_TOUR_ID = 'velvet-coast'
export const IRON_BOROUGH_TOUR_ID = 'iron-borough'
export const EMBER_STEPPE_TOUR_ID = 'ember-steppe'
export const STANDARD_CHAMPIONSHIP_ID = 'world-tour-standard'

/**
 * The bundled standard championship. Frozen so a stray mutation in
 * the tour-selection UI or the race scene cannot silently corrupt the
 * shared data. Use `findTour`/`nextTourOf` rather than reading
 * `tours[i]` directly so a future re-ordering does not break callers.
 */
export const STANDARD_CHAMPIONSHIP: Championship = Object.freeze({
  id: STANDARD_CHAMPIONSHIP_ID,
  name: 'World Tour',
  drivers: DRIVERS,
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
      aiDriverIds: VELVET_DRIVER_IDS,
    },
    {
      id: IRON_BOROUGH_TOUR_ID,
      name: 'Iron Borough',
      region: 'Iron Borough',
      theme: {
        primary: '#94a3b8',
        secondary: '#1f2937',
        accent: '#fde047',
      },
      weather: 'cloudy',
      requiredStanding: 3,
      fieldSize: FIELD_SIZE_FULL,
      trackIds: [
        'iron-borough-1',
        'iron-borough-2',
        'iron-borough-3',
        'iron-borough-4',
      ],
      aiDriverIds: FULL_DRIVER_IDS,
    },
    {
      id: EMBER_STEPPE_TOUR_ID,
      name: 'Ember Steppe',
      region: 'Ember Steppe',
      theme: {
        primary: '#fb923c',
        secondary: '#7c2d12',
        accent: '#fde68a',
      },
      weather: 'rainy',
      requiredStanding: 2,
      fieldSize: FIELD_SIZE_FULL,
      trackIds: [
        'ember-steppe-1',
        'ember-steppe-2',
        'ember-steppe-3',
        'ember-steppe-4',
      ],
      aiDriverIds: FULL_DRIVER_IDS,
    },
  ],
}) as Championship

// Validate the bundled data at module load. A misshaped championship
// is a programmer error, not a user error; failing loudly here
// prevents the race scene from spawning an invalid grid.
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
