import { defineConfig, devices } from '@playwright/test'

const PORT = 4180

/**
 * End-to-end tests run the real app against a mocked Supabase + CoinGecko
 * (see src/test/e2e/mock-api.ts). They never hit a live backend or live prices.
 * The fake Supabase URL below overrides any .env values for this server.
 */
export default defineConfig({
  testDir: './src/test/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    acceptDownloads: true,
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] }, grep: /@mobile/ },
  ],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      VITE_SUPABASE_URL: 'http://fake-supabase.test',
      VITE_SUPABASE_ANON_KEY: 'e2e-anon-key',
      VITE_MARKET_DATA_MODE: 'direct',
      VITE_COINGECKO_API_KEY: '',
    },
  },
})
