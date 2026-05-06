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
      // Stage 2 Workstream B: turn the continuous-angle editor flag on in
      // Playwright runs so the rotate handle and overlay rendering paths
      // exercise alongside the existing grid-snap smokes. The flag is
      // build-time (`NEXT_PUBLIC_*` is inlined into the client bundle),
      // so this env entry only takes effect on the `npm run build`
      // command above; production builds default to off until Stage 3.
      // Hardcoded to '1' (instead of `process.env.X ?? '1'`) so an
      // outer env that sets the flag to a falsey string ('0' / 'false')
      // cannot silently turn the suite into the old build, where the
      // rotate-handle smoke would fail without code regression. The
      // smokes that depend on the flag must always run against an
      // editor build that has it on.
      NEXT_PUBLIC_CONTINUOUS_ANGLE_EDITOR: '1',
    },
  },
})
