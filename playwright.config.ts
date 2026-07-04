import { defineConfig, devices } from '@playwright/test';
import fs from 'fs';

// Use the pre-installed Chromium in this environment (stable symlink). When the
// path is absent (e.g. CI), fall back to Playwright's managed browser.
const PW_CHROMIUM = '/opt/pw-browsers/chromium';
const launchOptions = fs.existsSync(PW_CHROMIUM)
  ? { executablePath: PW_CHROMIUM }
  : {};

// Env shared by the app under test — dev-auth bypass + mock mode means no
// Keycloak, Google, Redis or SMTP are required.
const APP_ENV = {
  NODE_ENV: 'development',
  DEV_AUTH_BYPASS: 'true',
};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  globalSetup: './e2e/global-setup.ts',

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    launchOptions,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], browserName: 'chromium', launchOptions },
    },
    {
      // iPad layout/touch emulation (CLAUDE.md testing strategy). Forced onto
      // Chromium since only Chromium is available; runs the smoke suite.
      name: 'ipad',
      testMatch: /smoke\.spec\.ts/,
      use: { ...devices['iPad Pro 11'], browserName: 'chromium', launchOptions },
    },
  ],

  webServer: [
    {
      command: 'pnpm --filter bff dev',
      cwd: '.',
      url: 'http://localhost:3001/health',
      timeout: 240_000,
      reuseExistingServer: !process.env.CI,
      env: {
        ...APP_ENV,
        PORT: '3001',
        DATABASE_URL: 'file:./e2e.db',
        SESSION_SECRET: 'e2e-session-secret-at-least-32-characters-long',
        FRONTEND_ORIGIN: 'http://localhost:3000',
      },
    },
    {
      command: 'pnpm --filter web dev',
      cwd: '.',
      url: 'http://localhost:3000',
      timeout: 240_000,
      reuseExistingServer: !process.env.CI,
      env: {
        ...APP_ENV,
        PORT: '3000',
        BFF_URL: 'http://localhost:3001',
      },
    },
  ],
});
