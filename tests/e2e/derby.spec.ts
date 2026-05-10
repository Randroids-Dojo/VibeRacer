import { test, expect } from '@playwright/test'

test('title screen surfaces the Derby tile', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Derby' })).toBeVisible()
})

test('derby hub lists the dust bowl arena', async ({ page }) => {
  await page.goto('/derby')
  await expect(page.getByRole('heading', { name: 'Derby' })).toBeVisible()
  await expect(page.getByText('Dust Bowl')).toBeVisible()
})

test('arena page shows the four vehicle cards', async ({ page }) => {
  await page.goto('/derby/dust-bowl')
  await expect(page.getByRole('heading', { name: 'Dust Bowl' })).toBeVisible()
  await expect(page.getByText('Sedan')).toBeVisible()
  await expect(page.getByText('School Bus')).toBeVisible()
  await expect(page.getByText('Big Truck')).toBeVisible()
  await expect(page.getByText('Racecar')).toBeVisible()
})

test('selecting a vehicle and starting mounts the round HUD', async ({
  page,
}) => {
  await page.goto('/derby/dust-bowl')
  await page.getByRole('button', { name: /Big Truck/ }).click()
  await page.getByTestId('derby-start-button').click()
  await expect(page.locator('[data-derby-place-chip="true"]')).toBeVisible()
  await expect(page.locator('[data-derby-cars-left-chip="true"]')).toBeVisible()
  await expect(page.locator('[data-derby-health-bar="true"]')).toBeVisible()
})
