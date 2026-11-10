import { defineConfig, devices } from '@playwright/test';

// Parallel worktrees each set their own E2E_PORT so their servers do not collide.
const port = Number(process.env.E2E_PORT ?? 4173);

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
    // The production build registers a service worker (src/pwa/sw.js) that would precache the
    // whole site in every test. Only tests/e2e/offline.spec.ts allows it.
    serviceWorkers: 'block',
  },
  webServer: {
    command: `npm run build && npx vite preview --port ${port} --strictPort`,
    port,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 860 } },
    },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
});
