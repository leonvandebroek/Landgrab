import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    headless: false,
    // Grants specified permissions to the browser context.
    permissions: ['geolocation'],
  },
  projects: [
    {
      name: 'localization',
      testDir: './e2e',
      testMatch: /^(?!.*\.gameplay\.).*\.spec\.ts$/,
      use: { browserName: 'chromium' },
    },
    {
      name: 'setup',
      testDir: './e2e',
      testMatch: /setup\.ts$/,
      use: { browserName: 'chromium' },
    },
    {
      name: 'gameplay',
      testDir: './e2e',
      testMatch: '*.gameplay.spec.ts',
      dependencies: ['setup'],
      workers: 1,
      use: {
        browserName: 'chromium',
            headless: false,
            ...devices['iPhone 15 Pro'],
        video: 'on-first-retry',
        screenshot: 'only-on-failure',
        trace: 'on-first-retry',
      },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
