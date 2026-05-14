import { test, expect } from '@playwright/test'

test('drag hub lists the four strips', async ({ page }) => {
  await page.goto('/drag')
  await expect(page.getByRole('heading', { name: 'Drag Racing' })).toBeVisible()
  await expect(page.getByText('Salt Flats Mile')).toBeVisible()
  await expect(page.getByText('Coastal Strip')).toBeVisible()
  await expect(page.getByText('Alpine Pass')).toBeVisible()
  await expect(page.getByText('Harbor Night Run')).toBeVisible()
})

test('Salt Flats opens the garage with the parts picker', async ({ page }) => {
  await page.goto('/drag/salt-flats')
  await expect(page.getByText('GARAGE', { exact: true })).toBeVisible()
  await expect(
    page.getByText('Salt Flats Mile', { exact: true }).first(),
  ).toBeVisible()
  await expect(page.getByText('Tires', { exact: true })).toBeVisible()
  await expect(page.getByText('Engine', { exact: true })).toBeVisible()
  await expect(page.getByText('Transmission', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Race' })).toBeVisible()
})

test('drag speedometer needle visibly moves under throttle', async ({ page }) => {
  await page.goto('/drag/salt-flats')
  await page.getByRole('button', { name: 'Race' }).click()
  await expect(page.getByTestId('hud-speedometer')).toBeVisible({
    timeout: 6000,
  })

  const needle = page.getByTestId('speedometer-needle')
  const before = await needle.getAttribute('transform')
  await page.keyboard.down('ArrowUp')
  await expect
    .poll(async () => needle.getAttribute('transform'), { timeout: 4000 })
    .not.toBe(before)
  await page.keyboard.up('ArrowUp')
})

test('title screen surfaces the Drag Racing tile', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Drag Racing' })).toBeVisible()
})
