import { defineConfig, devices } from '@playwright/test'

/**
 * Config RIÊNG cho production — KHÔNG dùng chung với `playwright.config.ts`.
 *
 * Suite localhost (`e2e/`) KHÔNG chạy được trên production, xem `e2e-prod/README.md`.
 * File này chỉ nạp `e2e-prod/` — toàn bộ test ở đó là READ-ONLY, không tạo dữ liệu.
 *
 *   npx playwright test --config=playwright.prod.config.ts
 */
export default defineConfig({
  testDir: './e2e-prod',
  fullyParallel: false,
  workers: 1,
  // Production đứng sau HTTPS + mạng thật, chậm hơn Vite dev server ở localhost.
  timeout: 90_000,
  expect: { timeout: 20_000 },
  // Một lần retry để lỗi mạng thoáng qua không bị báo thành lỗi app.
  retries: 1,
  outputDir: '../.playwright/prod-results',
  reporter: [['list'], ['html', { open: 'never', outputFolder: '../.playwright/prod-report' }]],
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 430, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ignoreHTTPSErrors: false,
  },
})
