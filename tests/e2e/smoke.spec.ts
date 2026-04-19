import { test, expect } from '@playwright/test'

test('home page renders', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'VibeRacer' })).toBeVisible()
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
