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
  await page.getByRole('button', { name: 'Settings' }).click()

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
  await page.getByRole('button', { name: 'Settings' }).click()
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
  await expect(page.getByText('Seeded from neon.')).toBeVisible()
  await page.getByLabel('Personal music name').fill('Smoke Tune')
  await page.getByRole('button', { name: 'Save personal' }).click()
  await expect(page.getByText('Personal music saved and applied.')).toBeVisible()
  const stored = await page.evaluate(() => localStorage.getItem('viberacer.myMusic'))
  expect(stored).toContain('Smoke Tune')
})

test('settings tabs keep long sections inside the modal viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('tab', { name: 'Vehicle' }).click()

  const panelInfo = await page.getByRole('tabpanel').evaluate((panel) => {
    const menu = panel.parentElement
    const menuRect = menu?.getBoundingClientRect()
    return {
      scrollHeight: panel.scrollHeight,
      clientHeight: panel.clientHeight,
      menuTop: menuRect?.top ?? Number.NEGATIVE_INFINITY,
      menuBottom: menuRect?.bottom ?? Number.POSITIVE_INFINITY,
      menuLeft: menuRect?.left ?? Number.NEGATIVE_INFINITY,
      menuRight: menuRect?.right ?? Number.POSITIVE_INFINITY,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    }
  })
  expect(panelInfo.menuTop).toBeGreaterThanOrEqual(15)
  expect(panelInfo.menuBottom).toBeLessThanOrEqual(panelInfo.viewportHeight - 15)
  expect(panelInfo.menuLeft).toBeGreaterThanOrEqual(15)
  expect(panelInfo.menuRight).toBeLessThanOrEqual(panelInfo.viewportWidth - 15)
  expect(panelInfo.scrollHeight).toBeGreaterThan(panelInfo.clientHeight)

  await page.getByRole('tabpanel').evaluate((panel) => {
    panel.scrollTop = panel.scrollHeight
  })
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
  await expect(page.getByText('36 / 64 pieces')).toBeVisible()
  await expect(page.getByText('36 selected pieces')).toBeVisible()
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
