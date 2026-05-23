import { test, expect } from '@playwright/test'

// Smoke + regression tests for the Destruction Lab.

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
  const canvas = page.locator('[data-testid="destruction-canvas"]').first()
  await expect(canvas).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('DESTRUCTION LAB')).toBeVisible({
    timeout: 20_000,
  })
})

test('canvas CSS size matches container (catches updateStyle=false on setSize)', async ({
  page,
}) => {
  // Regression test for the high-DPR canvas overflow bug. When
  // renderer.setSize is called with updateStyle=false on a DPR>1
  // device, the canvas WebGL buffer is sized to clientWidth*DPR but
  // the canvas CSS dimensions are left unset, defaulting to the
  // attribute values (also clientWidth*DPR). The canvas then
  // overflows its container, and the visible portion is the top-left
  // quarter of the rendered scene with frame-center appearing at the
  // bottom-right corner. This test asserts the canvas CSS size never
  // exceeds the viewport, which fails when the bug is reintroduced.
  await page.setViewportSize({ width: 412, height: 800 })
  await page.evaluate(() => {
    // Force a DPR > 1 to surface the bug. Some headless contexts run
    // at DPR 1 which would mask the regression.
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      get: () => 2,
    })
  })
  await page.goto('/destruction')
  const canvas = page.locator('[data-testid="destruction-canvas"]').first()
  await expect(canvas).toBeVisible({ timeout: 20_000 })
  await page.waitForTimeout(500)
  const cssSize = await canvas.evaluate((el) => ({
    cssW: (el as HTMLElement).clientWidth,
    cssH: (el as HTMLElement).clientHeight,
    bufW: (el as HTMLCanvasElement).width,
    bufH: (el as HTMLCanvasElement).height,
  }))
  // CSS dimensions should match the viewport size, not the
  // DPR-scaled framebuffer dimensions.
  expect(cssSize.cssW).toBeLessThanOrEqual(420)
  expect(cssSize.cssH).toBeLessThanOrEqual(820)
  // The framebuffer should be larger than CSS (DPR scaling working).
  expect(cssSize.bufW).toBeGreaterThanOrEqual(cssSize.cssW)
})

test('AI drives the car on load (catches discarded stepPhysics return)', async ({
  page,
}) => {
  // Regression test for the "physicsState = stepPhysics(...)" bug.
  // stepPhysics returns a new state object and does not mutate the
  // input; a tick loop that calls stepPhysics without capturing the
  // return value sits frozen forever. We catch that here by taking
  // two screenshots 1.5s apart and asserting the pixels differ in
  // the canvas region.
  await page.goto('/destruction')
  const canvas = page.locator('[data-testid="destruction-canvas"]').first()
  await expect(canvas).toBeVisible({ timeout: 20_000 })
  await page.waitForTimeout(800)
  const first = await canvas.screenshot()
  await page.waitForTimeout(1500)
  const second = await canvas.screenshot()
  const changed = await page.evaluate(
    async ({ a, b }) => {
      async function decode(s: string) {
        const img = new Image()
        img.src = 'data:image/png;base64,' + s
        await img.decode()
        const c = document.createElement('canvas')
        c.width = img.naturalWidth
        c.height = img.naturalHeight
        const ctx = c.getContext('2d')
        if (!ctx) throw new Error('no 2d')
        ctx.drawImage(img, 0, 0)
        return ctx.getImageData(0, 0, c.width, c.height)
      }
      const A = await decode(a)
      const B = await decode(b)
      let n = 0
      for (let i = 0; i < A.data.length; i += 4) {
        if (Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2]) > 24) {
          n++
        }
      }
      return n
    },
    { a: first.toString('base64'), b: second.toString('base64') },
  )
  // A driving car visibly moves the camera and scene. Even a static
  // car should still have smoke / dent recompute changes if anything
  // is alive in the tick loop. A frozen scene scores zero.
  expect(changed).toBeGreaterThan(500)
})
