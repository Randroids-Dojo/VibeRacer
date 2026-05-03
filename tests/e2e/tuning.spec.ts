import { test, expect } from '@playwright/test'

test('home page exposes a Tuning Lab launcher', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Tuning Lab' })).toBeVisible()
})

test('/tune renders the Tuning Lab heading', async ({ page }) => {
  await page.goto('/tune')
  await expect(page.getByRole('heading', { name: 'Tuning Lab' })).toBeVisible()
})

test('/tune lets the user start a session and shows the countdown', async ({
  page,
}) => {
  await page.goto('/tune')
  await page.getByRole('button', { name: /start a tuning session/i }).click()
  await page.getByRole('button', { name: /start drive/i }).click()
  // Countdown overlay paints READY first.
  await expect(page.getByText('READY', { exact: true })).toBeVisible()
})

test('/tune home exposes the Recent changes view', async ({ page }) => {
  await page.goto('/tune')
  // The button shows the live history count even when empty so the player
  // sees the surface exists.
  await page
    .getByRole('button', { name: /recent changes \(\d+\)/i })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Recent changes' }),
  ).toBeVisible()
  // Empty-state hint is rendered when there are no entries yet.
  await expect(
    page.getByText(/Recent tuning changes show up here/i),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page.getByRole('heading', { name: 'Tuning Lab' })).toBeVisible()
})

test('pre-race setup modal: legacy per-track save is pre-selected and pin pre-checked', async ({
  page,
}) => {
  // Seed a per-track save and a different lastLoaded for the /start slug.
  // The track is undecided, so the modal should pre-select "Saved setup
  // for this track" and pre-check the pin toggle.
  const tuned = {
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
  }
  const lastLoaded = { ...tuned, maxSpeed: 26 }
  await page.addInitScript(
    ({ tuned, lastLoaded }) => {
      localStorage.setItem('viberacer.tuning.track:start', JSON.stringify(tuned))
      localStorage.setItem(
        'viberacer.tuning.lastLoaded',
        JSON.stringify(lastLoaded),
      )
      localStorage.setItem('viberacer.initials', 'TST')
    },
    { tuned, lastLoaded },
  )
  await page.goto('/start')

  await expect(page.getByRole('button', { name: 'Start race' })).toBeVisible({
    timeout: 15_000,
  })
  // The per-track radio is selected.
  const perTrack = page.getByRole('radio', {
    name: 'Saved setup for this track',
  })
  await expect(perTrack).toHaveAttribute('aria-checked', 'true')
  // The pin toggle is pre-checked because this track has not been decided.
  const pin = page.getByRole('switch', {
    name: 'Always use this setup for this track',
  })
  await expect(pin).toHaveAttribute('aria-checked', 'true')

  // Confirm with Start race; the pin sticks and the track is marked decided.
  await page.getByRole('button', { name: 'Start race' }).click()
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible({
    timeout: 15_000,
  })
  const pinned = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('viberacer.tuning.pinnedTracks') ?? '[]'),
  )
  expect(pinned).toContain('start')
  const decided = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('viberacer.tuning.decidedTracks') ?? '[]'),
  )
  expect(decided).toContain('start')
})

test('intro-only session leaves no auto-saved tuning behind', async ({
  page,
}) => {
  // The auto-save effect skips the first run when params still equal
  // initialParams. A user who lands in Intro and bails before driving must
  // not produce a phantom "Lab session ..." row in their saved tunings.
  await page.goto('/tune')
  await page.getByRole('button', { name: /start a tuning session/i }).click()
  await expect(
    page.getByRole('heading', { name: 'New tuning session' }),
  ).toBeVisible()
  // Wait past the auto-save debounce window. If the guard is wrong, an empty
  // row would land in localStorage by now.
  await page.waitForTimeout(800)
  const stored = await page.evaluate(() =>
    window.localStorage.getItem('viberacer.tuningLab.saved'),
  )
  // Either the key is unset, or the array does not yet contain a Lab session
  // row. Both are acceptable empty states.
  if (stored !== null) {
    const parsed = JSON.parse(stored) as Array<{ name: string }>
    const labRows = parsed.filter((r) => r.name.startsWith('Lab session '))
    expect(labRows).toEqual([])
  }
})

test('Recent changes view lists imported entries and applies them', async ({
  page,
}) => {
  // Seed the audit log via localStorage so we can exercise the apply flow
  // without a full drive session in the browser.
  await page.addInitScript(() => {
    const params = {
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
    }
    localStorage.setItem(
      'viberacer.tuningHistory',
      JSON.stringify([
        {
          id: 't-seed-1',
          params,
          source: 'savedApplied',
          label: 'Seeded entry',
          changedKeys: {
            maxSpeed: { from: 26, to: 30 },
            accel: { from: 18, to: 22 },
          },
          slug: '__lab__',
          changedAt: Date.now() - 60_000,
        },
      ]),
    )
  })
  await page.goto('/tune')
  await page
    .getByRole('button', { name: /recent changes \(1\)/i })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Recent changes' }),
  ).toBeVisible()
  await expect(page.getByText('Seeded entry')).toBeVisible()
  // Apply the seeded entry. The lab persists to lastLoaded.
  await page.getByRole('button', { name: 'Apply', exact: true }).first().click()
  await expect(page.getByText(/Tuning reverted to next race/i)).toBeVisible()
})
