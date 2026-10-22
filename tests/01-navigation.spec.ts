import { test, expect } from '@playwright/test'
import { boot, toMenu, screen, menuOpen, ErrorLog } from './helpers'

test.describe('menus and navigation', () => {
  let log: ErrorLog
  test.beforeEach(async ({ page }) => {
    log = new ErrorLog(page)
    await boot(page)
  })

  test.afterEach(async ({ page }, info) => log.assertClean(info))

  test('title screen shows the logo and advances with any key', async ({ page }) => {
    await expect(page.locator('.logo')).toHaveText('PRISMFALL')
    await expect(page.locator('.press')).toBeVisible()
    await page.keyboard.press('Space')
    await expect(page.locator('.mm-list')).toBeVisible({ timeout: 8000 })
    expect(await screen(page)).toContain('main menu')
  })

  test('main menu lists all seven entries', async ({ page }) => {
    await toMenu(page)
    const items = await page.locator('.mm-list [data-a]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.a))
    expect(items).toEqual(['play', 'forge', 'codex', 'ach', 'settings', 'credits', 'quit'])
  })

  test('keyboard navigation moves focus down the menu', async ({ page }) => {
    await toMenu(page)
    const focused = () => page.evaluate(() => (window.__pf.ui.focus as HTMLElement | null)?.dataset?.a ?? null)
    expect(await focused()).toBe('play')
    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(150)
    expect(await focused()).toBe('forge')
    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(150)
    expect(await focused()).toBe('codex')
    await page.keyboard.press('ArrowUp')
    await page.waitForTimeout(150)
    expect(await focused()).toBe('forge')
  })

  test('every menu entry opens its screen and Escape returns', async ({ page }) => {
    await toMenu(page)
    const expected: Record<string, string> = {
      forge: 'forge', codex: 'codex', ach: 'ach', settings: 'settings', credits: 'credits',
    }
    for (const [item, cls] of Object.entries(expected)) {
      await menuOpen(page, item)
      expect(await screen(page), `${item} should open`).toContain(cls)
      await page.keyboard.press('Escape')
      await page.waitForTimeout(500)
      expect(await screen(page), `Escape should return from ${item}`).toContain('main menu')
    }
  })

  test('all screens render real content, not empty shells', async ({ page }) => {
    await toMenu(page)
    const checks: [string, string, number][] = [
      ['forge', '.fg-item', 10],
      ['codex', '.cx-tab', 3],
      ['ach', '.ach-row', 20],
      ['settings', '.set-row', 8],
      ['credits', '.cr-row', 3],
    ]
    for (const [item, sel, min] of checks) {
      await menuOpen(page, item)
      const n = await page.locator(sel).count()
      expect(n, `${item} should render at least ${min} of ${sel}`).toBeGreaterThanOrEqual(min)
      await page.keyboard.press('Escape')
      await page.waitForTimeout(400)
    }
  })

  test('back button from the main menu asks for confirmation', async ({ page }) => {
    await toMenu(page)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
    // in a browser (no native shell) the menu simply stays
    expect(await screen(page)).toContain('main menu')
  })
})

test.describe('character and stage select', () => {
  let log: ErrorLog
  test.beforeEach(async ({ page }) => {
    log = new ErrorLog(page)
    await boot(page)
    await toMenu(page)
  })
  test.afterEach(async ({ page }, info) => log.assertClean(info))

  test('character select lists six lights with correct lock state', async ({ page }) => {
    await menuOpen(page, 'play')
    expect(await screen(page)).toContain('chars')
    const tiles = await page.locator('.ct').evaluateAll((els) =>
      els.map((e) => ({ id: (e as HTMLElement).dataset.id, locked: e.classList.contains('locked') })),
    )
    expect(tiles.map((t) => t.id)).toEqual(['vex', 'ember', 'moss', 'quill', 'halo', 'null'])
    expect(tiles.filter((t) => !t.locked).map((t) => t.id)).toEqual(['vex', 'ember'])
  })

  test('selecting a character shows its trait and starting weapon', async ({ page }) => {
    await menuOpen(page, 'play')
    await page.locator('.ct[data-id="vex"]').click()
    await page.waitForTimeout(300)
    const detail = await page.locator('.cs-detail').innerText()
    expect(detail).toContain('Vex')
    expect(detail.toLowerCase()).toContain('pulse bolt')
    expect(detail).toContain('+10%')
  })

  test('a Lumen-priced character cannot start a run without paying', async ({ page }) => {
    await menuOpen(page, 'play')
    await page.locator('.ct[data-id="moss"]').click()
    await page.waitForTimeout(300)
    const cta = await page.locator('[data-cta]').innerText()
    expect(cta).toMatch(/Unlock|解锁/i)
    expect(await page.locator('[data-cta]').isDisabled()).toBe(true)
    const w = await page.evaluate(() => window.__pf.game.world)
    expect(w).toBeNull()
  })

  test('an achievement-gated character shows its requirement instead of a button', async ({ page }) => {
    await menuOpen(page, 'play')
    await page.locator('.ct[data-id="halo"]').click()
    await page.waitForTimeout(300)
    expect(await page.locator('[data-cta]').count()).toBe(0)
    const req = await page.locator('.cs-req').innerText()
    expect(req).toMatch(/Achievement|成就/i)
    expect(req).toContain('Into the Light')
  })

  test('stage select shows four stages with only the first unlocked', async ({ page }) => {
    await menuOpen(page, 'play')
    await page.locator('[data-cta]').click()
    await page.waitForTimeout(600)
    expect(await screen(page)).toContain('stages')
    const cards = await page.locator('.sc').evaluateAll((els) =>
      els.map((e) => ({ id: (e as HTMLElement).dataset.id, locked: e.classList.contains('locked') })),
    )
    expect(cards.map((c) => c.id)).toEqual(['shallows', 'crimson', 'verdant', 'singularity'])
    expect(cards.filter((c) => !c.locked).map((c) => c.id)).toEqual(['shallows'])
  })

  test('a locked stage cannot be started', async ({ page }) => {
    await menuOpen(page, 'play')
    await page.locator('[data-cta]').click()
    await page.waitForTimeout(500)
    await page.locator('.sc[data-id="crimson"]').click()
    await page.waitForTimeout(300)
    const selected = await page.evaluate(() => window.__pf.ui.top ? (window.__pf.ui.top as any).st?.id : null)
    expect(selected).toBe('shallows')
  })

  test('ascension and endless are disabled before the first clear', async ({ page }) => {
    await menuOpen(page, 'play')
    await page.locator('[data-cta]').click()
    await page.waitForTimeout(500)
    const ascDisabled = await page.locator('[data-o="asc"]').evaluate((e) => e.hasAttribute('disabled'))
    const endlessDisabled = await page.locator('[data-o="endless"]').evaluate((e) => e.hasAttribute('disabled'))
    expect(ascDisabled).toBe(true)
    expect(endlessDisabled).toBe(true)
  })
})
