import { defineConfig, devices } from '@playwright/test';

// Browser-level interaction and cross-browser smoke tests (spec §14.3,
// §13.5: "Core flows pass in current Chromium, Firefox, and WebKit-class
// browsers"). Every spec in tests/e2e runs against all three projects
// below by default — there's no separate "smoke" file; running the whole
// suite three times over IS the cross-browser smoke test.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  // Several specs drive real-time physics via wall-clock waits (holding a
  // key for a computed duration, waiting for a ~12s simulated run to
  // reach completion). Under heavy worker parallelism, CPU contention
  // between concurrent Chromium instances measurably slows the fixed-step
  // accumulator's real-time catch-up, which manifested as spurious
  // timeouts at the default worker count — confirmed by re-running
  // serially and seeing them pass. Capping workers is cheaper and more
  // honest than padding every timing-sensitive test's budget.
  workers: 2,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
