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
  // Output must live outside this directory (the Vite project root) — Vite's
  // file watcher sees report/trace HTML appear under here and broadcasts a
  // full-page HMR reload to every connected client, including the pages a
  // running test is driving. A reload mid-test silently resets the SPA to
  // its pristine state while leaving the URL alone, producing flaky
  // failures that look like app or timing bugs but aren't.
  outputDir: '../.playwright/test-results',
  reporter: [['list'], ['html', { open: 'never', outputFolder: '../.playwright/report' }]],
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 430, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
})
