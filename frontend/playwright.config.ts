import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  // Specs share the seeded driver/admin accounts and the global "finding_driver"
  // trip pool, so parallel runs would steal each other's trips.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 430, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
})
