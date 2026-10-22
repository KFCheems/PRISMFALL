import { defineConfig, devices } from '@playwright/test'

/**
 * PRISMFALL end-to-end suite.
 *
 * The game is a canvas app driven by keyboard/gamepad, so most tests press real keys and read the
 * debug handle (`window.__pf`) only for assertions — never to skip the interaction being tested.
 */
export default defineConfig({
  testDir: './tests',
  // the balance report is a diagnostic tool, not a pass/fail gate — run it with `npm run test:balance`
  testIgnore: process.env.PF_TOOLS ? [] : ['**/tools/**'],
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'tests/report', open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:5399',
    viewport: { width: 1600, height: 900 },
    launchOptions: {
      executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
    },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx vite --port 5399 --strictPort',
    url: 'http://127.0.0.1:5399',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
