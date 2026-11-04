import { defineConfig, devices } from '@playwright/test';

const testDbUrl = process.env.DATABASE_URL_TEST || 'postgresql://postgres:postgres@localhost:5433/kasbuka_test';

export default defineConfig({
  testDir: './e2e',
  timeout: 45 * 1000,
  expect: {
    timeout: 8000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'off',
  },
  projects: [
    {
      name: 'desktop-chrome',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chrome',
      use: {
        viewport: { width: 390, height: 844 }, // iPhone / Android 390px per Gate G5
      },
    },
  ],
  webServer: {
    command: 'npm run start',
    url: 'http://localhost:3000',
    reuseExistingServer: false,
    timeout: 60 * 1000,
    env: {
      DATABASE_URL: testDbUrl,
      DIRECT_URL: testDbUrl,
      STORAGE_PROVIDER: 'local',
      E2E_TEST: 'true',
      DONATIONS_ENABLED: 'true',
    },
  },
});

