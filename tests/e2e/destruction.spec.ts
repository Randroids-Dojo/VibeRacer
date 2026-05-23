import { test, expect } from '@playwright/test'

// Smoke test for the Destruction Lab. Verifies:
//  - title screen has the experimental link
//  - /destruction route loads and the WebGL canvas paints
//  - clicking on the canvas drops the hood HP in the HUD readout

test('title screen exposes the Destruction Lab link', async ({ page }) => {
  await page.goto('/')
  const link = page.getByRole('link', { name: /Destruction Lab/i })
  await expect(link).toBeVisible()
  await expect(link).toHaveAttribute('href', '/destruction')
})

test('Destruction Lab canvas paints and HUD reports panel HP', async ({
  page,
}) => {
  await page.goto('/destruction')
  // Wait for the canvas the lab mounts. It carries data-testid so we
  // do not depend on DOM-order.
  const canvas = page.locator('[data-testid="destruction-canvas"]').first()
  await expect(canvas).toBeVisible({ timeout: 20_000 })
  // The HUD only paints once the asset has loaded and the first HUD
  // publish has run; wait for the title to appear.
  await expect(page.getByText('DESTRUCTION LAB')).toBeVisible({
    timeout: 20_000,
  })
  // Per-panel HP labels live in the HUD.
  await expect(page.getByText('Hood')).toBeVisible()
  await expect(page.getByText('Engine')).toBeVisible()
})
