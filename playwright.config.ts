import { defineConfig, devices } from '@playwright/test';

const PORT = 8788;
const BASE = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  workers: process.env.CI ? 2 : 4,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE,
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Touch phone (Chromium / Android)
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
    // iPhone (WebKit / Safari engine)
    { name: 'mobile-safari', use: { ...devices['iPhone 15'] } },
    // Desktop with mouse and keyboard
    { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 860 } } },
  ],
  webServer: [
    {
      command: 'node tests/mock-google.mjs',
      url: 'http://localhost:9999/health',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run e2e:serve',
      url: `${BASE}/api/health`,
      timeout: 180_000,
      reuseExistingServer: !process.env.CI,
    },
    // Same app in the public-release setup: guest mode (no sign-in) with AI features off
    {
      command: 'npm run e2e:serve:guest',
      url: 'http://localhost:8789/api/health',
      timeout: 180_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
