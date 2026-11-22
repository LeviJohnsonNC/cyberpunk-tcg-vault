import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/dice',
  testMatch: '**/*.e2e.ts',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:4174', viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure' },
  projects: [
    { name: 'table-chromium', use: { launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, args: ['--enable-unsafe-swiftshader'],
    } } },
    { name: 'phone-webkit', testMatch: '**/phone-table.e2e.ts', grepInvert: /@chromium-swipe/,
      use: { ...devices['iPhone 13'], browserName: 'webkit' } },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4174 --strictPort',
    env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' },
    url: 'http://127.0.0.1:4174', reuseExistingServer: false,
  },
});
