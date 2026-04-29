import { test, expect } from '@playwright/test'

test('@smoke update banner appears when /api/version reports a new sha', async ({
  page,
}) => {
  const localVersion = (
    await (await page.request.get('/api/version')).json()
  ).version as string

  test.skip(
    !localVersion || localVersion === 'dev',
    'Skipping when no build sha is baked into the client (npm run dev / no git)',
  )

  await page.clock.install()

  await page.route('**/api/version', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ version: 'forced-update-from-test' }),
    })
  })

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'VibeRacer' })).toBeVisible()

  await page.clock.fastForward(31_000)

  const banner = page.getByRole('status').filter({ hasText: 'NEW VERSION AVAILABLE' })
  await expect(banner).toBeVisible()
  await expect(banner.getByRole('button', { name: 'RELOAD' })).toBeEnabled()
})
