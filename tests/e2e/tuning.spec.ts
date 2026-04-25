import { test, expect } from '@playwright/test'

test('home page exposes a Tuning Lab launcher', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Tuning Lab' })).toBeVisible()
})

test('/tune renders the Tuning Lab heading', async ({ page }) => {
  await page.goto('/tune')
  await expect(page.getByRole('heading', { name: 'Tuning Lab' })).toBeVisible()
})

test('/tune lets the user start a session and shows the countdown', async ({
  page,
}) => {
  await page.goto('/tune')
  await page.getByRole('button', { name: /start a tuning session/i }).click()
  await page.getByRole('button', { name: /start drive/i }).click()
  // Countdown overlay paints READY first.
  await expect(page.getByText('READY', { exact: true })).toBeVisible()
})
