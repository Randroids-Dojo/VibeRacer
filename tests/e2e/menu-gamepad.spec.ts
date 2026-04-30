import { test, expect } from '@playwright/test'

// We can't drive a real gamepad from Playwright, but we can stub the Gamepad
// API. The injected snapshot is read on every requestAnimationFrame poll and
// the test mutates it to simulate button presses.
const STUB_INIT = `
  (() => {
    const buttons = new Array(17).fill(null).map(() => ({ pressed: false, value: 0, touched: false }))
    const axes = [0, 0, 0, 0]
    const pad = {
      id: 'TestPad (STANDARD GAMEPAD)',
      index: 0,
      connected: true,
      mapping: 'standard',
      timestamp: 0,
      buttons,
      axes,
    }
    window.__pad = pad
    navigator.getGamepads = function () { return [pad] }
    // Fire a connect event so any code listening for it can wake up.
    setTimeout(() => {
      window.dispatchEvent(new GamepadEvent('gamepadconnected', { gamepad: pad }))
    }, 0)
  })()
`

async function press(page: import('@playwright/test').Page, idx: number) {
  await page.evaluate((i) => {
    const w = window as unknown as { __pad: Gamepad }
    const b = w.__pad.buttons[i]
    ;(b as { pressed: boolean; value: number }).pressed = true
    ;(b as { pressed: boolean; value: number }).value = 1
  }, idx)
  await page.waitForTimeout(40)
  await page.evaluate((i) => {
    const w = window as unknown as { __pad: Gamepad }
    const b = w.__pad.buttons[i]
    ;(b as { pressed: boolean; value: number }).pressed = false
    ;(b as { pressed: boolean; value: number }).value = 0
  }, idx)
  await page.waitForTimeout(40)
}

test.describe('gamepad menu nav', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(STUB_INIT)
  })

  test('B button closes the Settings overlay', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Settings' }).click()
    await expect(page.getByRole('tab', { name: 'Profile' })).toBeVisible()
    // B = button 1.
    await press(page, 1)
    await expect(page.getByRole('tab', { name: 'Profile' })).toHaveCount(0)
  })

  test('RB switches tabs in the Settings overlay', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Settings' }).click()
    await expect(page.getByRole('tab', { name: 'Profile' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    // RB = button 5.
    await press(page, 5)
    await expect(page.getByRole('tab', { name: 'Audio' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })
})
