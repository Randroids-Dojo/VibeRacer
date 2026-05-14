/**
 * Session-storage key for the most recent World Tour race result. The
 * race page persists the result here on race finish; the results page
 * reads it on mount. The store is intentionally sessionStorage (not
 * localStorage) so a closed tab clears the value and a fresh visit to
 * /tour/results does not show stale data.
 */
export const WORLD_TOUR_LAST_RESULT_KEY = 'viberacer.worldTour.lastRaceResult'
