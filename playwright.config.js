import { defineConfig } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT || 3000);
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: './tests',
  testMatch: '*.spec.js',
  timeout: 60_000,
  workers: 1,
  use: { baseURL, browserName: 'chromium', channel: 'chrome', viewport: { width: 1280, height: 800 } },
  webServer: { command: `PORT=${port} npm start`, url: `${baseURL}/health`, reuseExistingServer: true },
});
