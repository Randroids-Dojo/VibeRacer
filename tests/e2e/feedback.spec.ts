import { test, expect } from '@playwright/test'

test('feedback FAB opens, closes, and submits from the pause menu', async ({
  page,
}) => {
  const feedbackCalls: unknown[] = []
  await page.route('**/api/feedback', async (route) => {
    feedbackCalls.push(route.request().postDataJSON())
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, issueUrl: 'https://example.test/1' }),
    })
  })

  await page.goto('/start')
  await page.getByRole('textbox').fill('TST')
  await page.getByRole('button', { name: 'Save' }).click()
  await page.getByRole('button', { name: 'Pause' }).click()

  await expect(page.getByRole('button', { name: 'Send feedback' })).toBeVisible()
  await page.getByRole('button', { name: 'Send feedback' }).click()
  await expect(page.getByPlaceholder("What's on your mind?")).toBeFocused()

  await page.getByRole('button', { name: 'Close feedback' }).click()
  await expect(page.getByPlaceholder("What's on your mind?")).toBeHidden()

  await page.getByRole('button', { name: 'Send feedback' }).click()
  await page
    .getByPlaceholder("What's on your mind?")
    .fill('The feedback panel works in the pause menu.')
  await page.getByRole('button', { name: 'Send Feedback' }).click()

  await expect(page.getByText('Thanks for the feedback!')).toBeVisible()
  expect(feedbackCalls).toHaveLength(1)
  expect(feedbackCalls[0]).toMatchObject({
    title: 'Player Feedback',
    body: 'The feedback panel works in the pause menu.',
    context: {
      urlPath: '/start',
    },
  })
})
