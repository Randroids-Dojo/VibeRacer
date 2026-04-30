import { test, expect } from '@playwright/test'

// Keyboard navigation contract:
//  - ArrowDown / ArrowUp move focus inside a vertical menu.
//  - Enter / Space activates the focused button.
//  - Esc closes the topmost overlay (calls onBack).
//  - Range sliders adjust on ArrowLeft / ArrowRight; ArrowUp / ArrowDown moves
//    focus out of the slider.

test('settings pane: arrow keys walk the tab strip and close on Esc', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Settings' }).click()

  // Profile is auto-focused as the first interactive item below the title.
  // Confirm the first tab is selected.
  await expect(page.getByRole('tab', { name: 'Profile' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  // ArrowRight on the focused Profile tab moves focus to the Audio tab. Enter
  // commits the selection (the radio-row pattern).
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('tab', { name: 'Audio' })).toHaveAttribute(
    'aria-selected',
    'true',
  )

  // Esc closes the pane.
  await page.keyboard.press('Escape')
  await expect(page.getByRole('tab', { name: 'Audio' })).toHaveCount(0)
})

test('settings pane: ArrowLeft / ArrowRight steps a focused range slider', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('tab', { name: 'Audio' }).click()

  const slider = page
    .getByRole('tabpanel')
    .locator('input[type="range"]')
    .first()
  await slider.focus()
  const before = await slider.inputValue()
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('ArrowRight')
  }
  const after = await slider.inputValue()
  expect(Number(after)).toBeGreaterThan(Number(before))
})

test('initials prompt: Enter on the input submits without arrow key focus shift', async ({
  page,
}) => {
  await page.goto('/start')
  // The initials prompt opens automatically when initials are unset.
  const input = page.getByRole('textbox').first()
  await expect(input).toBeVisible()
  await input.fill('TST')
  await input.press('Enter')
  // The pause button on the race HUD is the post-submit signal that the
  // prompt closed.
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible({
    timeout: 15_000,
  })
})

test('how-to-play overlay: Esc closes', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'How to play' }).click()

  await expect(page.getByText('HOW TO PLAY', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByText('HOW TO PLAY', { exact: true })).toHaveCount(0)
})
