import { test, expect } from '@playwright/test'

function byteDelta(a: Buffer, b: Buffer): number {
  const len = Math.min(a.length, b.length)
  let delta = 0
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) delta++
  }
  return delta + Math.abs(a.length - b.length)
}

test('model viewer tile visibly animates over time', async ({ page }) => {
  await page.goto('/model-viewer')
  const tile = page.getByTestId('model-tile-Assembled').first()
  await expect(tile).toBeVisible({ timeout: 20_000 })

  const first = await tile.screenshot()
  await page.waitForTimeout(900)
  const second = await tile.screenshot()

  expect(byteDelta(first, second)).toBeGreaterThan(500)
})
