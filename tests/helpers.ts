import { expect, type Page, type TestInfo } from '@playwright/test'

/** Every page error the app threw, collected per test. */
export class ErrorLog {
  private errors: string[] = []
  constructor(page: Page) {
    page.on('pageerror', (e) => this.errors.push('pageerror: ' + e.message))
    page.on('console', (m) => {
      const t = m.text()
      if (m.type() !== 'error') return
      // benign browser noise: missing favicon, and the network stack briefly refusing a dev-server
      // request while Playwright reloads the page mid-flight
      if (/favicon|404 \(Not Found\)|ERR_NO_BUFFER_SPACE|ERR_ABORTED|ERR_CONNECTION_RESET/.test(t)) return
      this.errors.push('console: ' + t)
    })
  }
  get all() {
    return this.errors
  }
  clear() {
    this.errors = []
  }
  assertClean(testInfo?: TestInfo) {
    if (this.errors.length && testInfo) testInfo.attach('errors', { body: this.errors.join('\n'), contentType: 'text/plain' })
    expect(this.errors, 'no uncaught errors in the page').toEqual([])
  }
}

/**
 * Boot to the title screen with a clean save.
 * The click that unlocks WebAudio goes in the top-left corner (empty space) so it never lands on a
 * control, and the title screen is left untouched for the caller to advance.
 */
export async function boot(page: Page, opts: { fresh?: boolean } = {}) {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  if (opts.fresh !== false) {
    await page.evaluate(() => localStorage.clear())
    await page.reload({ waitUntil: 'domcontentloaded' })
  }
  await expect(page.locator('.logo')).toBeVisible({ timeout: 15000 })
  // the pointer press is what unlocks WebAudio; park it in the corner so it hits no control
  await page.mouse.click(4, 4)
  await page.mouse.move(4, 4)
  // wait until the title screen has finished its intro and is the settled top screen
  await expect
    .poll(async () => page.evaluate(() => window.__pf.ui.top?.el?.className ?? ''), { timeout: 8000 })
    .toContain('title')
  await page.waitForTimeout(120)
}

/** Title -> main menu with the keyboard, like a player pressing a key. */
export async function toMenu(page: Page) {
  const cls = await page.evaluate(() => window.__pf.ui.top?.el?.className ?? '')
  if (cls.includes('title')) {
    await page.keyboard.press('Enter')
    // the title fades out for ~0.55 s before the menu replaces it
    await expect
      .poll(async () => page.evaluate(() => window.__pf.ui.top?.el?.className ?? ''), { timeout: 8000 })
      .toContain('main menu')
  }
  await expect(page.locator('.mm-list')).toBeVisible({ timeout: 8000 })
  await page.waitForTimeout(250)
}

/** Current screen class from the UI stack (the app's own navigation state). */
export async function screen(page: Page): Promise<string> {
  return page.evaluate(() => window.__pf.ui.top?.el?.className ?? '(none)')
}

/** Press a menu item by its data-a id (clicking is a real user action). */
export async function menuOpen(page: Page, id: string) {
  await page.locator(`.mm-list [data-a="${id}"]`).click()
  await page.mouse.move(6, 6)
  await page.waitForTimeout(450)
}

/** Run game frames synchronously inside the page (for long simulations without real-time waits). */
export async function advance(page: Page, seconds: number, tick = 1 / 30) {
  await page.evaluate(
    ({ seconds, tick }) => {
      const w = window.__pf.game.world
      if (!w) return
      const steps = Math.ceil(seconds / tick)
      for (let i = 0; i < steps; i++) w.update(tick)
    },
    { seconds, tick },
  )
}

/** The world object, typed loosely for assertions. */
export const world = (page: Page) => page.evaluate(() => window.__pf.game.world as any)

/** Wait until the top screen has finished its opening lock and accepts input. */
export async function waitUnlocked(page: Page) {
  await page
    .waitForFunction(() => ((window.__pf.ui.top as any)?.lock ?? 0) <= 0, null, { timeout: 8000 })
    .catch(() => {})
}

/** Pick the first level-up card, waiting out the opening lock. Returns false if no cards are up. */
export async function pickCard(page: Page): Promise<boolean> {
  if (!(await page.locator('.card').count())) return false
  await waitUnlocked(page)
  await page.locator('.card').first().click({ timeout: 5000 }).catch(() => {})
  await page.waitForTimeout(180)
  return true
}

/** A non-null world for tests that have already asserted a run is live. */
export function w(page: Page) {
  return window.__pf.game.world!
}

/** Evaluate a callback with the live world, failing clearly when no run is active. */
export async function evalWorld<T>(page: Page, fn: (world: any) => T): Promise<T> {
  return page.evaluate((src) => {
    const w = window.__pf.game.world
    if (!w) throw new Error('no active run')
    return (new Function('w', 'return (' + src + ')(w)'))(w) as T
  }, fn.toString())
}

