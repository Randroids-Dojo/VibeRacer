import { test, expect } from '@playwright/test'

// Regression: the stage section used `width: 480` which sized its grid track
// to 480px and dragged the title off the right edge on iPhone-class widths
// even after the font clamp shipped. Lock the title's right edge to the
// viewport so this can't silently regress again.
test('title fits within viewport on narrow phones', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const heading = page.getByRole('heading', { name: 'VibeRacer' })
  await expect(heading).toBeVisible()
  const box = await heading.evaluate((el) => {
    const rect = el.getBoundingClientRect()
    return {
      left: rect.left,
      right: rect.right,
      viewportWidth: window.innerWidth,
    }
  })
  expect(box.right).toBeLessThanOrEqual(box.viewportWidth)
  expect(box.left).toBeGreaterThanOrEqual(0)
})
