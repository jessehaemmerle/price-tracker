import { defineConfig, devices } from '@playwright/test'

/**
 * Browser-Smoke-Tests gegen kleine, eingecheckte Testdaten (tests/fixtures/data),
 * damit die Tests unabhängig von den Live-Quellen laufen.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    locale: 'de-AT',
    timezoneId: 'Europe/Vienna',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobil', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npx vite --port 4173 --strictPort',
    env: { DATA_DIR: 'tests/fixtures/data' },
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
})
