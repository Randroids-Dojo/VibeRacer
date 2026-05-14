import { describe, expect, it } from 'vitest'
import { MOBILE_GAME_SURFACE_STYLES } from '@/lib/mobileGameSurface'

// Frozen test for the mobile-safe game surface contract. Every full-
// screen game mode roots into this style object; if any property drifts
// the regression below should catch it BEFORE someone has to find out
// on their phone.
describe('MOBILE_GAME_SURFACE_STYLES', () => {
  it('disables browser touch gestures inside the surface', () => {
    expect(MOBILE_GAME_SURFACE_STYLES.touchAction).toBe('none')
  })

  it('blocks the long-press text-selection box (cross-vendor)', () => {
    expect(MOBILE_GAME_SURFACE_STYLES.userSelect).toBe('none')
    expect(MOBILE_GAME_SURFACE_STYLES.WebkitUserSelect).toBe('none')
  })

  it('blocks the iOS long-press callout menu', () => {
    expect(MOBILE_GAME_SURFACE_STYLES.WebkitTouchCallout).toBe('none')
  })

  it('pins to the viewport without scroll', () => {
    expect(MOBILE_GAME_SURFACE_STYLES.position).toBe('fixed')
    expect(MOBILE_GAME_SURFACE_STYLES.inset).toBe(0)
    expect(MOBILE_GAME_SURFACE_STYLES.overflow).toBe('hidden')
  })
})
