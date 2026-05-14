import { test, expect } from '@playwright/test'

test('World Tour opens the first race and dismisses the intro with keyboard input', async ({
  page,
}) => {
  await page.goto('/tour')

  await expect(page.getByRole('heading', { name: 'World Tour' })).toBeVisible()
  await page.getByRole('button', { name: /Velvet Coast/ }).click()

  await expect(page).toHaveURL(/\/tour\/race\?tour=velvet-coast&raceIndex=0/)
  const intro = page.getByRole('button', { name: /Velvet Coast/ })
  await expect(intro).toBeVisible()
  await intro.focus()
  await page.keyboard.press('Enter')
  await expect(intro).toHaveCount(0)
})

test('World Tour race route clamps invalid race indexes', async ({ page }) => {
  await page.goto('/tour/race?tour=velvet-coast&raceIndex=999')
  await expect(page.locator('header').getByText(/Race 4 of 4/)).toBeVisible()

  await page.goto('/tour/race?tour=velvet-coast&raceIndex=not-a-number')
  await expect(page.locator('header').getByText(/Race 1 of 4/)).toBeVisible()
})
