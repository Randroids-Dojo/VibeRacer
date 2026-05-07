import { defineConfig, devices } from '@playwright/test'

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000
const baseURL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run build && npm run start',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      KV_REST_API_URL:
        process.env.KV_REST_API_URL ?? '',
      KV_REST_API_TOKEN: process.env.KV_REST_API_TOKEN ?? '',
      RACE_SIGNING_SECRET:
        process.env.RACE_SIGNING_SECRET ?? 'smoke-test-secret',
    },
  },
})
