import { test, expect, type Page } from '@playwright/test'

async function pixelDelta(
  page: Page,
  a: Buffer,
  b: Buffer,
): Promise<number> {
  return page.evaluate(
    async ({ first, second }) => {
      async function decodePng(base64: string): Promise<ImageData> {
        const img = new Image()
        img.src = `data:image/png;base64,${base64}`
        await img.decode()
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Canvas 2D context unavailable')
        ctx.drawImage(img, 0, 0)
        return ctx.getImageData(0, 0, canvas.width, canvas.height)
      }

      const firstImage = await decodePng(first)
      const secondImage = await decodePng(second)
      if (
        firstImage.width !== secondImage.width ||
        firstImage.height !== secondImage.height
      ) {
        throw new Error(
          `Screenshot sizes differ: ${firstImage.width}x${firstImage.height} ` +
            `versus ${secondImage.width}x${secondImage.height}`,
        )
      }
      let changed = 0
      for (let y = 0; y < firstImage.height; y++) {
        for (let x = 0; x < firstImage.width; x++) {
          const firstOffset = (y * firstImage.width + x) * 4
          const secondOffset = (y * secondImage.width + x) * 4
          const dr = Math.abs(
            firstImage.data[firstOffset] - secondImage.data[secondOffset],
          )
          const dg = Math.abs(
            firstImage.data[firstOffset + 1] - secondImage.data[secondOffset + 1],
          )
          const db = Math.abs(
            firstImage.data[firstOffset + 2] - secondImage.data[secondOffset + 2],
          )
          const da = Math.abs(
            firstImage.data[firstOffset + 3] - secondImage.data[secondOffset + 3],
          )
          if (dr + dg + db + da > 24) changed++
        }
      }
      return changed
    },
    { first: a.toString('base64'), second: b.toString('base64') },
  )
}

test('model viewer tile visibly animates over time', async ({ page }) => {
  await page.goto('/model-viewer')
  const tile = page.getByTestId('model-tile-Assembled').first()
  await expect(tile).toBeVisible({ timeout: 20_000 })
  await page.waitForTimeout(300)

  const first = await tile.screenshot()
  await page.waitForTimeout(900)
  const second = await tile.screenshot()

  await expect(pixelDelta(page, first, second)).resolves.toBeGreaterThan(300)
})
