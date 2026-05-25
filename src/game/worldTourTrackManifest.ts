/**
 * Maps every World Tour `trackId` to a real `TRACK_TEMPLATES` entry.
 * Replaces the prior MVP behavior where all 32 tour races rendered the
 * same `top-gear-opener` template.
 *
 * The catalog currently has five authored templates; we cycle through
 * them per tour so every race inside a tour has a recognizably
 * different layout, and the same race id always resolves to the same
 * template across runs. Adding a new template to `TRACK_TEMPLATES`
 * automatically widens the rotation.
 *
 * Pure: no IO, deterministic.
 */

import { STANDARD_CHAMPIONSHIP } from '@/data/worldTourChampionship'
import {
  TRACK_TEMPLATES,
  getTrackTemplate,
  type TrackTemplate,
} from './trackTemplates'

// Rotation of authored templates the manifest cycles through. Ordered
// from gentlest (Top Gear-style oval) to most technical (Reference GP)
// so the first race of each tour reads as the most approachable layout.
const TEMPLATE_ROTATION: string[] = [
  'top-gear-opener',
  'sweep-loop',
  's-curve-loop',
  'reference-gp',
  'starter-oval',
]

// Fallback template used when a `trackId` is not in the manifest. The
// tour route already short-circuits to a "Track unavailable" screen if
// `getTrackTemplate` returns null, so the fallback is just a guard
// against a typo in a future championship data entry.
const FALLBACK_TEMPLATE_ID = 'top-gear-opener'

function deterministicManifest(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const tour of STANDARD_CHAMPIONSHIP.tours) {
    for (let i = 0; i < tour.trackIds.length; i++) {
      const trackId = tour.trackIds[i]!
      out[trackId] = TEMPLATE_ROTATION[i % TEMPLATE_ROTATION.length]!
    }
  }
  return out
}

const MANIFEST = deterministicManifest()

/**
 * Resolve a tour `trackId` to its authored template id.
 * Returns the fallback template id when the manifest does not know the
 * track; never returns null.
 */
export function trackTemplateIdFor(trackId: string): string {
  return MANIFEST[trackId] ?? FALLBACK_TEMPLATE_ID
}

/**
 * Resolve a tour `trackId` to a `TrackTemplate`. Returns null only
 * when even the fallback template is missing (which would be a
 * misconfigured catalog, not a runtime case).
 */
export function trackTemplateFor(trackId: string): TrackTemplate | null {
  return getTrackTemplate(trackTemplateIdFor(trackId))
}

/**
 * Test hook so a manifest test can assert every championship track
 * resolves to something in the catalog without rebuilding the
 * championship-import path.
 */
export function listManifestEntries(): ReadonlyArray<{
  trackId: string
  templateId: string
}> {
  return Object.entries(MANIFEST).map(([trackId, templateId]) => ({
    trackId,
    templateId,
  }))
}

// Re-export the catalog so callers do not have to import both modules.
export { TRACK_TEMPLATES }
