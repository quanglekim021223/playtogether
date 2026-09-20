import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  testMatch: '*.spec.js',
  timeout: 60_000,
  workers: 1,
  use: { baseURL: 'http://localhost:3000', browserName: 'chromium', channel: 'chrome', viewport: { width: 1280, height: 800 } },
  webServer: { command: 'npm start', url: 'http://localhost:3000/health', reuseExistingServer: true },
});
