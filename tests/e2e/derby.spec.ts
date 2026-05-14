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
  await expect(page.getByRole('button', { name: /^Sedan\b/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Ambulance\b/ })).toBeVisible()
  await expect(
    page.getByRole('button', { name: /^Pickup Truck\b/ }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: /^Race Car\b/ })).toBeVisible()
})

test('selecting a vehicle and starting mounts the round HUD', async ({
  page,
}) => {
  await page.goto('/derby/dust-bowl')
  await page.getByRole('button', { name: /^Pickup Truck\b/ }).click()
  await page.getByTestId('derby-start-button').click()
  await expect(page.locator('[data-derby-place-chip="true"]')).toBeVisible()
  await expect(page.locator('[data-derby-cars-left-chip="true"]')).toBeVisible()
  await expect(page.locator('[data-derby-health-bar="true"]')).toBeVisible()
})

test('derby round uses the mobile viewport and shared touch joystick', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => {
    localStorage.setItem(
      'viberacer.controls',
      JSON.stringify({
        keyBindings: {
          forward: ['KeyW', 'ArrowUp'],
          backward: ['KeyS', 'ArrowDown'],
          left: ['KeyA', 'ArrowLeft'],
          right: ['KeyD', 'ArrowRight'],
          handbrake: ['Space'],
          shiftDown: ['KeyQ'],
          shiftUp: ['KeyE'],
          restartLap: ['KeyR'],
        },
        touchMode: 'single',
        camera: {
          height: 3.5,
          distance: 8,
          lookAhead: 3,
          followSpeed: 1.2,
          cameraForward: -7,
          targetHeight: 1,
          fov: 92,
        },
      }),
    )
  })

  await page.goto('/derby/dust-bowl')
  await page.getByRole('button', { name: /^Race Car\b/ }).click()
  await page.getByTestId('derby-start-button').click()

  const canvas = page.getByTestId('derby-canvas')
  await expect(canvas).toBeVisible()

  const box = await canvas.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.width).toBeGreaterThanOrEqual(389)
  expect(box!.height).toBeGreaterThanOrEqual(843)

  await canvas.dispatchEvent('pointerdown', {
    pointerType: 'touch',
    pointerId: 23,
    clientX: 195,
    clientY: 620,
    bubbles: true,
    cancelable: true,
  })
  await expect(page.getByTestId('touch-joystick-ring')).toBeVisible()
  await expect(page.getByTestId('touch-joystick-knob')).toBeVisible()
  await page.dispatchEvent('body', 'pointerup', {
    pointerType: 'touch',
    pointerId: 23,
    clientX: 195,
    clientY: 620,
    bubbles: true,
    cancelable: true,
  })
})
