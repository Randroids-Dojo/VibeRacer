import { test, expect } from '@playwright/test'

test('home page renders', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'VibeRacer' })).toBeVisible()
})

test('title screen opens the Feature List credits', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Feature List' }).click()

  await expect(
    page.getByRole('dialog', { name: 'VibeRacer' }),
  ).toBeVisible()
  await expect(page.getByLabel('Feature List credits')).toContainText(
    'Race directly from any shared URL.',
  )
  await expect(page.getByLabel('Feature List credits')).toContainText(
    'Feature List credits screen.',
  )

  await page.getByRole('button', { name: 'Close' }).click()
  await expect(page.getByRole('dialog', { name: 'VibeRacer' })).toHaveCount(0)
  await expect(page).toHaveURL('/')
})

test('Feature List has a direct URL', async ({ page }) => {
  await page.goto('/features')

  await expect(
    page.getByRole('dialog', { name: 'VibeRacer' }),
  ).toBeVisible()
  await expect(page.getByLabel('Feature List credits')).toContainText(
    'Feature List credits screen.',
  )
  await expect(
    page.getByRole('button', { name: 'Pause Feature List scroll' }),
  ).toBeVisible()

  const firstTop = await page.getByTestId('feature-list-roll').evaluate((node) => {
    return node.getBoundingClientRect().top
  })
  await page.waitForTimeout(900)
  const secondTop = await page.getByTestId('feature-list-roll').evaluate((node) => {
    return node.getBoundingClientRect().top
  })
  expect(secondTop).toBeLessThan(firstTop - 30)
})

test('settings menu groups options behind tabs', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Settings' }).click()

  await expect(page.getByRole('tab', { name: 'Profile' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(page.getByText('Three letters tag your lap times')).toBeVisible()
  await expect(
    page.getByRole('tabpanel').getByRole('button', { name: 'Feature List' }),
  ).toBeVisible()

  await page.getByRole('tab', { name: 'Camera' }).click()
  await expect(page.getByRole('tab', { name: 'Camera' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(page.getByText('Tune the trailing chase camera')).toBeVisible()

  await page.getByRole('tab', { name: 'HUD' }).click()
  await expect(page.getByText('Minimap', { exact: true })).toBeVisible()
  await expect(page.getByText('Speedometer', { exact: true })).toBeVisible()

  await page.getByRole('tab', { name: 'Ghost' }).click()
  await expect(page.getByText('Ghost car', { exact: true })).toBeVisible()
  await expect(page.getByText('Racing line', { exact: true })).toBeVisible()

  await page.getByRole('tab', { name: 'Effects' }).click()
  await expect(page.getByText('Skid marks', { exact: true })).toBeVisible()
  await expect(page.getByText('Trackside scenery', { exact: true })).toBeVisible()
})

test('settings opens the Feature List credits', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Settings' }).click()
  await page
    .getByRole('tabpanel')
    .getByRole('button', { name: 'Feature List' })
    .click()

  await expect(
    page.getByRole('dialog', { name: 'VibeRacer' }),
  ).toBeVisible()
  await expect(page.getByLabel('Feature List credits')).toContainText(
    'Tabbed settings.',
  )
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'VibeRacer' })).toHaveCount(0)
})

test('music editor rolls a seed and saves a personal entry', async ({ page }) => {
  await page.goto('/music/smoke-tune')
  await expect(page.getByText('Music for /smoke-tune')).toBeVisible()
  await page.getByPlaceholder('seed word').fill('neon')
  await page.getByRole('button', { name: 'Roll' }).click()
  const vibePad = page.getByLabel('Vibe pad')
  await expect(vibePad.getByText('neon').first()).toBeVisible()
  await page.getByLabel('Tune name').fill('Smoke Tune')
  await page.getByRole('button', { name: 'Save as my override' }).click()
  await expect(
    page.getByRole('dialog', { name: 'Set your override?' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Save and apply for me' }).click()
  await expect(page.getByText('Saved as your override.')).toBeVisible()
  const stored = await page.evaluate(() => localStorage.getItem('viberacer.myMusic'))
  expect(stored).toContain('Smoke Tune')
})

test('settings page lets long sections scroll into view', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/settings')
  await page.getByRole('tab', { name: 'Vehicle' }).click()

  // Settings is a full-page route now, so the body / document scrolls and
  // long tabs like Vehicle should produce a scrollable document on a
  // mobile-width viewport. Tab content sits inside the page rather than a
  // modal, so we assert the document scroll height exceeds the viewport
  // and the lower-bound sub-section becomes visible after scrolling.
  const docInfo = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    viewportHeight: window.innerHeight,
  }))
  expect(docInfo.scrollHeight).toBeGreaterThan(docInfo.viewportHeight)

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await expect(page.getByText('Brake lights', { exact: true })).toBeVisible()
})

test('pause menu surfaces race actions behind a Race option', async ({ page }) => {
  await page.goto('/start')
  await page.getByRole('textbox').fill('TST')
  await page.getByRole('button', { name: 'Save' }).click()
  const startRace = page.getByRole('button', { name: 'Start race' })
  await expect(startRace).toBeVisible({ timeout: 15_000 })
  await startRace.click()
  const pause = page.getByRole('button', { name: 'Pause' })
  await expect(pause).toBeVisible({ timeout: 15_000 })
  await pause.click()

  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Restart Lap' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Race' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit Track' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Exit to title' })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Leaderboards' }),
  ).toHaveCount(0)

  await page.getByRole('button', { name: 'Race', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Leaderboards' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Stats' })).toBeVisible()
})

test('leaderboard rows open lap details with input and setup metadata', async ({
  page,
}) => {
  await page.route('**/api/track/start', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        versionHash: 'a'.repeat(64),
        versions: [{ hash: 'a'.repeat(64), createdAt: '2026-04-29T00:00:00.000Z' }],
      }),
    })
  })
  await page.route('**/api/leaderboard?**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        entries: [
          {
            rank: 1,
            initials: 'ABC',
            lapTimeMs: 50123,
            ts: 1_777_444_800_000,
            isMe: false,
            tuning: {
              maxSpeed: 30,
              maxReverseSpeed: 8,
              accel: 22,
              brake: 36,
              reverseAccel: 12,
              rollingFriction: 4,
              steerRateLow: 2.2,
              steerRateHigh: 2.2,
              minSpeedForSteering: 0.8,
              offTrackMaxSpeed: 10,
              offTrackDrag: 16,
            },
            inputMode: 'gamepad',
            nonce: 'b'.repeat(32),
          },
        ],
        meBestRank: null,
        pagination: {
          offset: 0,
          limit: 25,
          total: 1,
          hasPrev: false,
          hasNext: false,
        },
      }),
    })
  })

  await page.goto('/start')
  await page.getByRole('textbox').fill('TST')
  await page.getByRole('button', { name: 'Save' }).click()
  const startRace = page.getByRole('button', { name: 'Start race' })
  await expect(startRace).toBeVisible({ timeout: 15_000 })
  await startRace.click()
  const pause = page.getByRole('button', { name: 'Pause' })
  await expect(pause).toBeVisible({ timeout: 15_000 })
  await pause.click()
  await page.getByRole('button', { name: 'Race', exact: true }).click()
  await page.getByRole('button', { name: 'Leaderboards' }).click()

  await expect(page.getByLabel('Gamepad')).toBeVisible()
  await page.getByRole('button', { name: /View lap details for ABC/ }).click()
  await expect(page.getByText("ABC's LAP DETAILS")).toBeVisible()
  await expect(page.getByText('Gamepad', { exact: true })).toBeVisible()
  await expect(page.getByText('Raced with gamepad')).toBeVisible()
  await expect(page.getByText('Max speed', { exact: true })).toBeVisible()
  await expect(page.getByText('30u/s', { exact: true })).toBeVisible()
})

test('race HUD keeps mirror and bottom readouts in separate lanes on mobile', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/start')
  await page.getByRole('textbox').fill('TST')
  await page.getByRole('button', { name: 'Save' }).click()
  const startRace = page.getByRole('button', { name: 'Start race' })
  await expect(startRace).toBeVisible({ timeout: 15_000 })
  await startRace.click()

  await expect(page.getByTestId('rearview-mirror')).toBeVisible({
    timeout: 10000,
  })
  await expect(page.getByTestId('hud-speedometer')).toBeVisible({
    timeout: 10000,
  })
  await expect(page.getByTestId('hud-session-strip')).toBeVisible()

  const layout = await page.evaluate(() => {
    function rectFor(testId: string) {
      const node = document.querySelector(`[data-testid="${testId}"]`)
      const rect = node?.getBoundingClientRect()
      return rect
        ? {
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
          }
        : null
    }
    function overlaps(
      a: { left: number; right: number; top: number; bottom: number },
      b: { left: number; right: number; top: number; bottom: number },
    ) {
      return (
        a.left < b.right &&
        a.right > b.left &&
        a.top < b.bottom &&
        a.bottom > b.top
      )
    }
    const mirror = rectFor('rearview-mirror')
    const speedometer = rectFor('hud-speedometer')
    const session = rectFor('hud-session-strip')
    return {
      mirror,
      speedometer,
      session,
      speedometerSessionOverlap:
        speedometer && session ? overlaps(speedometer, session) : true,
      mirrorSessionOverlap: mirror && session ? overlaps(mirror, session) : true,
    }
  })

  expect(layout.mirror).not.toBeNull()
  expect(layout.speedometer).not.toBeNull()
  expect(layout.session).not.toBeNull()
  expect(layout.speedometerSessionOverlap).toBe(false)
  expect(layout.mirrorSessionOverlap).toBe(false)
})

test('track editor uses floating undo and redo controls on mobile', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/start/edit')

  await expect(
    page.getByRole('toolbar', { name: 'Edit history' }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Undo edit' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Redo edit' })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Undo', exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Redo', exact: true }),
  ).toHaveCount(0)

  const horizontalOverflow = await page.evaluate(() => {
    const { documentElement } = document
    return documentElement.scrollWidth - documentElement.clientWidth
  })
  expect(horizontalOverflow).toBeLessThanOrEqual(1)
})

test('track editor decoration palette follows the selected biome', async ({
  page,
}) => {
  await page.goto('/start/edit')

  await expect(page.getByRole('button', { name: 'Tree' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cactus' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Advanced' }).click()
  await page.getByLabel('Track biome').selectOption('desert')
  await expect(page.getByRole('button', { name: 'Cactus' })).toBeVisible()

  await page.getByRole('button', { name: 'Cactus' }).click()
  await page.locator('g[data-row="-2"][data-col="-2"]').click()
  await expect(page.getByText('1 decorations')).toBeVisible()
})

test('track editor applies the Reference GP template as a valid loop', async ({ page }) => {
  await page.goto('/start/edit')

  await page.getByRole('button', { name: 'Templates' }).click()
  await expect(page.getByText('Starter oval')).toBeVisible()
  await expect(page.getByText('Reference GP')).toBeVisible()
  await page.getByRole('button', { name: /Reference GP/ }).click()

  await expect(page.getByText('valid closed loop')).toBeVisible()
  await expect(page.getByText('63 / 64 pieces')).toBeVisible()
  await expect(page.getByText('63 selected pieces')).toBeVisible()
})

test('track editor highlights an open connector and target cell', async ({
  page,
}) => {
  await page.goto('/start/edit')

  await page.getByRole('button', { name: 'Straight' }).click()
  await page.locator('g[data-row="-2"][data-col="-2"]').click()

  await expect(page.getByText('needs matching connector at')).toBeVisible()
  await expect(page.getByTestId('bad-connector-marker')).toBeVisible()
  await expect(page.getByTestId('connector-target-marker')).toBeVisible()
})

test('track editor keeps long-turn pieces when placing into their footprint', async ({
  page,
}) => {
  await page.goto('/start/edit')

  await page.getByRole('button', { name: 'Clear', exact: true }).click()
  await page.getByRole('button', { name: 'Mega sweep (right)' }).click()
  await page.locator('g[data-row="0"][data-col="0"]').click()
  await expect(page.getByText('1 / 64 pieces')).toBeVisible()

  await page.getByRole('button', { name: 'Straight' }).click()
  await page.locator('g[data-row="1"][data-col="-1"]').click()
  await expect(page.getByText('2 / 64 pieces')).toBeVisible()
})

test('track editor rotates the clicked anchor when pieces overlap footprints', async ({
  page,
}) => {
  await page.goto('/start/edit')

  await page.getByRole('button', { name: 'Clear', exact: true }).click()
  await page.getByRole('button', { name: 'Mega sweep (right)' }).click()
  await page.locator('g[data-row="0"][data-col="0"]').click()
  await page.getByRole('button', { name: 'Straight' }).click()
  await page.locator('g[data-row="1"][data-col="0"]').click()
  await page.locator('g[data-row="1"][data-col="0"]').click()

  await expect(
    page.locator('g[data-row="1"][data-col="0"][data-piece-rotation="90"]'),
  ).toBeVisible()
  await expect(
    page.locator('g[data-row="0"][data-col="0"][data-piece-rotation="0"]'),
  ).toBeVisible()
})

test('track editor keeps mega sweep inner cells available', async ({ page }) => {
  await page.goto('/start/edit')

  await page.getByRole('button', { name: 'Clear', exact: true }).click()
  await page.getByRole('button', { name: 'Mega sweep (right)' }).click()
  await page.locator('g[data-row="0"][data-col="0"]').click()
  await page.getByRole('button', { name: 'Straight' }).click()
  await page.locator('g[data-row="1"][data-col="1"]').click()

  await expect(page.getByText('2 / 64 pieces')).toBeVisible()
  await expect(page.getByText('duplicate piece at 1,1')).toHaveCount(0)
})

test('track editor places a flex straight via the dedicated palette tool', async ({
  page,
}) => {
  await page.goto('/start/edit')

  await page.getByRole('button', { name: 'Clear', exact: true }).click()
  await page.getByRole('button', { name: 'Flex angle' }).click()
  // The flex bar should appear with length, lateral, and angle readouts.
  await expect(page.getByText(/degrees off cardinal/)).toBeVisible()
  await page.locator('g[data-row="0"][data-col="0"]').click()
  await expect(page.getByText('1 / 64 pieces')).toBeVisible()
})

test('track editor rotate handle pivots a selected piece around an endpoint', async ({
  page,
}) => {
  // The editor surfaces SVG ring handles at the selected piece's
  // endpoints. Dragging a handle rotates the piece by the angular
  // delta of the cursor relative to the pivot endpoint, producing a
  // non-projectable transform. The piece then renders via
  // NonProjectablePieceOverlay (data-non-projectable-piece-type
  // attribute).
  await page.goto('/start/edit')

  // The straight tool is the default after page load, so place a single
  // straight at (0, 0) without switching tools.
  await page.getByRole('button', { name: 'Clear', exact: true }).click()
  await page.locator('g[data-row="0"][data-col="0"]').click()

  await page.getByRole('button', { name: 'Select', exact: true }).click()
  await page.locator('g[data-row="0"][data-col="0"]').click()

  const handles = page.getByTestId('rotate-handles').locator('circle')
  await expect(handles).toHaveCount(2)

  const handle0 = page.locator('circle[data-rotate-handle-pivot-index="0"]')
  const box = await handle0.boundingBox()
  if (!box) throw new Error('rotate handle has no bounding box')
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  // Drag to a position offset from the pivot. Since the pivot endpoint
  // sits at the handle, the cursor angle starts at 0 (atan2(0, 0)) and
  // becomes atan2(30, 50) ~= 0.54 rad, rotating the piece by that
  // amount CW into a non-projectable transform.
  await page.mouse.move(cx + 50, cy + 30, { steps: 5 })
  await page.mouse.up()

  await expect(
    page.locator('g[data-non-projectable-piece-type="straight"]'),
  ).toBeVisible()
})

test('track editor free-places a piece via drag with the select tool', async ({
  page,
}) => {
  // Dragging a placed piece while the Select tool is active moves the
  // piece to the new position. The dragged piece's transform sits off
  // the integer grid mid-drag and (at this small drag distance with
  // no neighbor to snap to) commits as a non-projectable piece.
  await page.goto('/start/edit')

  await page.getByRole('button', { name: 'Clear', exact: true }).click()
  // Place a single straight at (0, 0).
  await page.locator('g[data-row="0"][data-col="0"]').click()

  // Switch to the Select tool.
  await page.getByRole('button', { name: 'Select', exact: true }).click()

  const sourceCell = page.locator('g[data-row="0"][data-col="0"]')
  const sourceBox = await sourceCell.boundingBox()
  if (!sourceBox) throw new Error('source cell has no bounding box')
  const sx = sourceBox.x + sourceBox.width / 2
  const sy = sourceBox.y + sourceBox.height / 2

  await page.mouse.move(sx, sy)
  await page.mouse.down()
  // Drag well past the click-vs-drag threshold (CELL_SIZE / 4 in world
  // units, multiple SVG cells in screen units), to a position far from
  // any existing piece so no snap engages.
  await page.mouse.move(sx + 200, sy + 100, { steps: 8 })
  await page.mouse.up()

  // The drag should have produced a non-projectable piece visible
  // through the overlay (no other pieces nearby to snap to). The
  // overlay's data-non-projectable-piece-type attribute is the easy
  // hit-target.
  await expect(
    page.locator('g[data-non-projectable-piece-type="straight"]'),
  ).toBeVisible()
})

test('track editor surfaces an overlap warning when two pieces overlap geometrically', async ({
  page,
}) => {
  // Sliding the top straight (row 0, col 1) halfway toward its west
  // neighbor (col = 0.5) keeps its legacy `piece.col` rounding to the
  // same anchor cell (so the validator's duplicate-cell check does
  // not fire) but moves its OBB into the neighbor right90's OBB. The
  // status row should report "1 overlapping piece pair".
  await page.goto('/start/edit')

  await page.getByRole('button', { name: 'Templates' }).click()
  await page.getByRole('button', { name: /Starter oval/ }).click()
  await expect(page.getByText('valid closed loop')).toBeVisible()
  await expect(page.getByTestId('obb-overlap-warning')).toHaveCount(0)

  await page.getByRole('button', { name: 'Select', exact: true }).click()
  await page.locator('g[data-row="0"][data-col="1"]').click()
  await page.getByRole('button', { name: 'Transform', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Edit piece transform' })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('col').fill('0.5')
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(dialog).toHaveCount(0)

  await expect(page.getByTestId('obb-overlap-warning')).toBeVisible()
  await expect(page.getByTestId('obb-overlap-warning')).toContainText(
    'overlapping piece',
  )
})

test('track editor surfaces a Close Loop button when two dangling endpoints are within snap range', async ({
  page,
}) => {
  // Rotating one straight by 1.9 degrees around its west endpoint
  // (via the numeric Transform panel; col / row / theta below are
  // the pre-computed values for that pivot) leaves the loop with
  // exactly two dangling endpoints separated by CELL_SIZE * sin
  // 1.9deg ~= 0.66 world units, past the validator's 0.5-unit
  // position epsilon but well inside LOOP_RECONCILIATION_RADIUS = 6.
  // The "Close loop" button surfaces on the toolbar in that state,
  // and clicking it inverts the perturbation (rotate-around-
  // connected-endpoint) so the loop is valid again with no cascading
  // break to a downstream connection.
  await page.goto('/start/edit')

  await page.getByRole('button', { name: 'Templates' }).click()
  await page.getByRole('button', { name: /Starter oval/ }).click()
  await expect(page.getByText('valid closed loop')).toBeVisible()

  await page.getByRole('button', { name: 'Select', exact: true }).click()
  await page.locator('g[data-row="0"][data-col="1"]').click()
  await page.getByRole('button', { name: 'Transform', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Edit piece transform' })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('col').fill('0.99973')
  await dialog.getByLabel('row').fill('0.0166')
  await dialog.getByLabel('theta (deg)').fill('91.9')
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(dialog).toHaveCount(0)

  await expect(page.getByText('valid closed loop')).toHaveCount(0)
  const closeLoopButton = page.getByRole('button', {
    name: 'Close loop',
    exact: true,
  })
  await expect(closeLoopButton).toBeVisible()
  await closeLoopButton.click()
  await expect(page.getByText('valid closed loop')).toBeVisible()
  await expect(closeLoopButton).toHaveCount(0)
})

test('track editor numeric Transform panel rotates a piece by typed degrees', async ({
  page,
}) => {
  // The selection toolbar exposes a Transform button that opens a
  // floating panel with col / row / theta inputs. Apply rewrites the
  // piece's transform directly. A non-cardinal theta forces a
  // non-projectable render so the dialog's effect is observable
  // through the overlay's data attribute.
  await page.goto('/start/edit')

  await page.getByRole('button', { name: 'Clear', exact: true }).click()
  await page.locator('g[data-row="0"][data-col="0"]').click()

  await page.getByRole('button', { name: 'Select', exact: true }).click()
  await page.locator('g[data-row="0"][data-col="0"]').click()

  await page.getByRole('button', { name: 'Transform', exact: true }).click()

  const dialog = page.getByRole('dialog', { name: 'Edit piece transform' })
  await expect(dialog).toBeVisible()

  const thetaInput = dialog.getByLabel('theta (deg)')
  await thetaInput.fill('25')

  await dialog.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(dialog).toHaveCount(0)

  await expect(
    page.locator('g[data-non-projectable-piece-type="straight"]'),
  ).toBeVisible()
})

test('track editor diagnoses wrong diagonal pieces in long-turn targets', async ({
  page,
}) => {
  await page.goto('/start/edit')

  await page.getByRole('button', { name: 'Clear', exact: true }).click()
  await page.getByRole('button', { name: 'Mega sweep (right)' }).click()
  await page.locator('g[data-row="0"][data-col="0"]').click()
  await page.getByRole('button', { name: 'Straight' }).click()
  await page.locator('g[data-row="1"][data-col="0"]').click()
  await page.getByRole('button', { name: 'Diagonal' }).click()
  await page.locator('g[data-row="0"][data-col="1"]').click()

  await expect(page.getByText('open connector at 0,0 facing 2')).toBeVisible()
  await expect(page.getByText('needs matching connector at 0,1')).toBeVisible()
})

test('middleware sets racerId cookie on first visit', async ({ page, context }) => {
  await context.clearCookies()
  await page.goto('/')
  const cookies = await context.cookies()
  const racer = cookies.find((c) => c.name === 'viberacer.racerId')
  expect(racer).toBeTruthy()
  expect(racer!.value).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  )
})

test('POST /api/race/start rejects bad inputs with 400', async ({ request }) => {
  const res = await request.post('/api/race/start?slug=BAD&v=abc', {
    data: {},
  })
  expect(res.status()).toBe(400)
})

test('POST /api/race/submit silently drops malformed body with 202', async ({
  request,
}) => {
  const res = await request.post(
    `/api/race/submit?slug=track&v=${'a'.repeat(64)}`,
    { data: {} },
  )
  expect(res.status()).toBe(202)
  expect(await res.json()).toEqual({ ok: false })
})

test('GET /api/track/[slug] returns null track for unknown slug', async ({
  request,
}) => {
  const res = await request.get('/api/track/unknown-fresh-slug-xyz')
  // When Upstash env vars are not set locally this returns 500. That is still
  // useful as a smoke signal that the route is wired up.
  expect([200, 500]).toContain(res.status())
})

test('POST /api/feedback returns 500 when GITHUB_PAT missing, 400 when body empty otherwise', async ({
  request,
}) => {
  const res = await request.post('/api/feedback', { data: {} })
  expect([400, 500]).toContain(res.status())
})

test('GET /api/leaderboard rejects bad params with 400', async ({ request }) => {
  const res = await request.get('/api/leaderboard?slug=BAD&v=abc')
  expect(res.status()).toBe(400)
})

test('POST /api/admin/leaderboard is gated without admin auth', async ({
  request,
}) => {
  const res = await request.post('/api/admin/leaderboard', { data: {} })
  expect([401, 503]).toContain(res.status())
})

test('GET /api/leaderboard returns a shaped response for valid params', async ({
  request,
}) => {
  const res = await request.get(
    `/api/leaderboard?slug=sandbox&v=${'a'.repeat(64)}`,
  )
  // 200 with empty entries when KV env vars exist; 200 with empty when the
  // read fails silently (either is a useful smoke that the route is wired).
  expect(res.status()).toBe(200)
  const body = (await res.json()) as { entries: unknown[]; meBestRank: unknown }
  expect(Array.isArray(body.entries)).toBe(true)
  expect(body.meBestRank === null || typeof body.meBestRank === 'number').toBe(
    true,
  )
})
