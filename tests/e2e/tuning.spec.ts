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

test('/tune exposes a manual slider builder that saves a named tuning', async ({
  page,
}) => {
  await page.goto('/tune')
  await page
    .getByRole('button', { name: /build tuning manually \(sliders\)/i })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Build tuning manually' }),
  ).toBeVisible()
  // The save button is disabled until the user names the tuning.
  const saveBtn = page.getByRole('button', { name: 'Save tuning' })
  await expect(saveBtn).toBeDisabled()
  await page.getByLabel('Name').fill('Manual sliders test')
  await expect(saveBtn).toBeEnabled()
  // Nudge the max speed slider so we know the params persist in addition to
  // the metadata.
  const slider = page.getByRole('slider', { name: /Max speed slider/i })
  await slider.focus()
  await slider.press('ArrowRight')
  await saveBtn.click()
  // After saving the lab returns to the saved-tunings list with the toast
  // visible. Wait for the toast to disappear before asserting the list row
  // so the row check cannot be satisfied by the toast text alone.
  const toast = page.getByText('Saved "Manual sliders test"')
  await expect(toast).toBeVisible()
  await expect(toast).toBeHidden()
  await expect(
    page.getByText('Manual sliders test', { exact: true }),
  ).toBeVisible()
})

test('/tune saved row Edit opens the manual builder preloaded for in-place save', async ({
  page,
}) => {
  // Seed a saved tuning so the saved-list has something to edit.
  await page.addInitScript(() => {
    const tuning = {
      id: 't-edit-seed',
      name: 'Editable seed',
      params: {
        maxSpeed: 28,
        maxReverseSpeed: 8,
        accel: 18,
        brake: 30,
        reverseAccel: 10,
        rollingFriction: 2,
        steerRateLow: 2.5,
        steerRateHigh: 2.0,
        minSpeedForSteering: 0.5,
        offTrackMaxSpeed: 8,
        offTrackDrag: 12,
      },
      ratings: {},
      controlType: 'keyboard',
      trackTags: ['fast'],
      lapTimeMs: null,
      notes: '',
      createdAt: '2026-04-25T00:00:00.000Z',
      updatedAt: '2026-04-25T00:00:00.000Z',
    }
    window.localStorage.setItem(
      'viberacer.tuningLab.saved',
      JSON.stringify([tuning]),
    )
  })
  await page.goto('/tune')
  await page.getByRole('button', { name: /saved tunings \(\d+\)/i }).click()
  await page.getByRole('button', { name: 'Edit' }).click()
  await expect(
    page.getByRole('heading', { name: /Edit "Editable seed"/ }),
  ).toBeVisible()
  // The name field comes preloaded so saving in place keeps the same id.
  await expect(page.getByLabel('Name')).toHaveValue('Editable seed')
  const saveBtn = page.getByRole('button', { name: 'Save changes' })
  await expect(saveBtn).toBeEnabled()
  await saveBtn.click()
  const toast = page.getByText('Saved "Editable seed"')
  await expect(toast).toBeVisible()
  await expect(toast).toBeHidden()
  // Only one row in the saved list after the edit, since the same id was
  // upserted instead of cloned.
  await expect(
    page.getByText('Editable seed', { exact: true }),
  ).toHaveCount(1)
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

test('pre-race setup modal: per-track save is the first option and pin sticks across visits', async ({
  page,
}) => {
  // Seed a per-track save and a different lastLoaded for the /start slug.
  // The picker should highlight the per-track save as the first option,
  // ticking the "always use" toggle should stick the pin, and a follow-up
  // visit should bypass the modal entirely.
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
  // The per-track radio carries the "Last setup you raced here" label and
  // is pre-selected as the top option.
  const perTrack = page.getByRole('radio', {
    name: /Last setup you raced here/,
  })
  await expect(perTrack).toHaveAttribute('aria-checked', 'true')
  // Pin toggle defaults off on a fresh track. Tick it explicitly so we can
  // confirm the modal is suppressed on the next visit.
  const pin = page.getByRole('switch', {
    name: 'Always use this setup for this track',
  })
  await expect(pin).toHaveAttribute('aria-checked', 'false')
  await pin.click()
  await expect(pin).toHaveAttribute('aria-checked', 'true')

  await page.getByRole('button', { name: 'Start race' }).click()
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible({
    timeout: 15_000,
  })
  const pinned = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('viberacer.tuning.pinnedTracks') ?? '[]'),
  )
  expect(pinned).toContain('start')

  // Visit the track again. With the pin set, the picker should be gone and
  // the countdown should be the only overlay before racing.
  await page.goto('/start')
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible({
    timeout: 15_000,
  })
  await expect(
    page.getByRole('button', { name: 'Start race' }),
  ).toHaveCount(0)
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
