import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: "./src/tests",
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['html', { outputFolder: './reports/playwright-report' }],
    ['allure-playwright', { outputFolder: './reports/allure-results' }]
  ],
  outputDir: './reports/playwrightResults',
  timeout: 90_000,
  expect: { timeout: 10000 },
  use: {
    screenshot: 'on'
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
