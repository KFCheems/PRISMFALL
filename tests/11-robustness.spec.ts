import { test, expect } from '@playwright/test'
import { boot, toMenu, ErrorLog, waitUnlocked } from './helpers'

/**
 * Hostile-environment round.
 *
 * Everything here is something a real player will do by accident: force-quit mid-run, leave the tab,
 * resize the window, open the game twice, feed it a corrupted save, or leave it running for an hour.
 * A shipping build has to survive all of it without losing progress or wedging the UI.
 */
test.describe('robustness', () => {
  let log: ErrorLog
  test.beforeEach(async ({ page }) => {
    log = new ErrorLog(page)
    await boot(page)
  })
  test.afterEach(async ({ page }, info) => log.assertClean(info))

  test('a corrupted save falls back to a fresh profile instead of bricking the boot', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem(window.__pf.save.key, '{ this is not json')
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.locator('.logo')).toBeVisible({ timeout: 15000 })
    await page.mouse.click(4, 4)
    await page.keyboard.press('Enter')
    await expect(page.locator('.mm-list')).toBeVisible({ timeout: 10000 })
    const ok = await page.evaluate(() => !!window.__pf.save.data)
    expect(ok, 'a corrupt save should still yield a usable profile').toBe(true)
  })

  test('a save from the legacy key is migrated, not ignored', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.clear()
      localStorage.setItem('prismfall-save-v1', JSON.stringify({ lumens: 4321, cleared: { shallows: 3 } }))
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.locator('.logo')).toBeVisible({ timeout: 15000 })
    const d = await page.evaluate(() => window.__pf.save.data)
    expect(d.lumens, 'legacy lumens should carry over').toBe(4321)
    expect(d.cleared.shallows).toBe(3)
  })

  test('a save with missing fields is repaired rather than crashing the UI', async ({ page }) => {
    await page.evaluate(() => {
      // find the live key from the running app, then overwrite it with a deliberately incomplete object
      const s = window.__pf.save as any
      localStorage.setItem(s.key, JSON.stringify({ lumens: 10 }))
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.locator('.logo')).toBeVisible({ timeout: 15000 })
    await page.mouse.click(4, 4)
    await page.keyboard.press('Enter')
    await expect(page.locator('.mm-list')).toBeVisible({ timeout: 10000 })
    const d: any = await page.evaluate(() => window.__pf.save.data as any)
    expect(Array.isArray(d.achievements) || typeof d.achievements === 'object').toBe(true)
    expect(typeof d.shop).toBe('object')
    expect(typeof d.forgeSpent).toBe('number')
    expect(typeof d.stats).toBe('object')
  })

  test('quitting mid-run keeps the meta progress earned but drops the run', async ({ page }) => {
    await toMenu(page)
    await page.locator('.mm-list [data-a="play"]').click()
    await page.mouse.move(4, 4)
    await page.waitForTimeout(350)
    await page.locator('[data-cta]').click()
    await page.mouse.move(4, 4)
    await expect(page.locator('.ss-cards')).toBeVisible({ timeout: 8000 })
    await page.waitForTimeout(250)
    await page.locator('[data-a="start"]').click()
    await page.waitForTimeout(900)
    await expect(page.locator('.hud')).toBeVisible({ timeout: 8000 })

    // earn some meta currency, then hard-reload as if the process died
    await page.evaluate(() => {
      window.__pf.game.world!.lumens = 777
      window.__pf.save.data.lumens = 777
      window.__pf.save.write()
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.locator('.logo')).toBeVisible({ timeout: 15000 })
    const after = await page.evaluate(() => ({
      lumens: window.__pf.save.data.lumens,
      hasWorld: !!window.__pf.game.world,
    }))
    expect(after.lumens, 'earned lumens survive a hard quit').toBe(777)
    expect(after.hasWorld, 'a reload should not restore a dead run').toBe(false)
  })

  test('the game keeps running while the tab is hidden and recovers on return', async ({ page }) => {
    await toMenu(page)
    await page.locator('.mm-list [data-a="play"]').click()
    await page.mouse.move(4, 4)
    await page.waitForTimeout(350)
    await page.locator('[data-cta]').click()
    await page.mouse.move(4, 4)
    await expect(page.locator('.ss-cards')).toBeVisible({ timeout: 8000 })
    await page.waitForTimeout(250)
    await page.locator('[data-a="start"]').click()
    await page.waitForTimeout(900)
    await expect(page.locator('.hud')).toBeVisible({ timeout: 8000 })

    const before = await page.evaluate(() => window.__pf.game.world!.time)
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { value: true, configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await page.waitForTimeout(1200)
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { value: false, configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await page.waitForTimeout(600)
    const after = await page.evaluate(() => ({
      time: window.__pf.game.world!.time,
      paused: !!document.querySelector('.pause'),
      alive: !window.__pf.game.world!.p.dead,
    }))
    expect(after.time, 'the run should not teleport forward after a hidden tab').toBeLessThan(before + 30)
    expect(after.alive, 'the player should not be killed while the tab was hidden').toBe(true)
  })

  test('resizing the window mid-run keeps the canvas and HUD coherent', async ({ page }) => {
    await toMenu(page)
    await page.locator('.mm-list [data-a="play"]').click()
    await page.mouse.move(4, 4)
    await page.waitForTimeout(350)
    await page.locator('[data-cta]').click()
    await page.mouse.move(4, 4)
    await expect(page.locator('.ss-cards')).toBeVisible({ timeout: 8000 })
    await page.waitForTimeout(250)
    await page.locator('[data-a="start"]').click()
    await page.waitForTimeout(900)
    await expect(page.locator('.hud')).toBeVisible({ timeout: 8000 })

    for (const vp of [
      { width: 1024, height: 640 },
      { width: 1600, height: 900 },
      { width: 1280, height: 720 },
    ]) {
      await page.setViewportSize(vp)
      await page.waitForTimeout(450)
      const r = await page.evaluate(() => {
        const c = document.querySelector('canvas') as HTMLCanvasElement
        return { w: innerWidth, h: innerHeight, cw: c?.width ?? 0, ch: c?.height ?? 0, scrollW: document.documentElement.scrollWidth }
      })
      expect(r.cw, `canvas should still be sized at ${vp.width}x${vp.height}`).toBeGreaterThan(0)
      expect(r.scrollW, 'no horizontal overflow after a resize').toBeLessThanOrEqual(r.w + 2)
    }
  })

  test('opening the pause menu repeatedly does not leak screens or lose focus', async ({ page }) => {
    await toMenu(page)
    await page.locator('.mm-list [data-a="play"]').click()
    await page.mouse.move(4, 4)
    await page.waitForTimeout(350)
    await page.locator('[data-cta]').click()
    await page.mouse.move(4, 4)
    await expect(page.locator('.ss-cards')).toBeVisible({ timeout: 8000 })
    await page.waitForTimeout(250)
    await page.locator('[data-a="start"]').click()
    await page.waitForTimeout(900)
    await expect(page.locator('.hud')).toBeVisible({ timeout: 8000 })

    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Escape')
      await page.waitForTimeout(400)
      await expect(page.locator('.pause')).toHaveCount(1, { timeout: 4000 })
      await page.keyboard.press('Escape')
      await page.waitForTimeout(200)
    }
    await expect(page.locator('.pause')).toHaveCount(0)
    const stacks = await page.evaluate(() => (window.__pf.ui as any).stack?.length ?? 0)
    expect(stacks, 'pause should not accumulate screen objects').toBeLessThanOrEqual(1)
  })

  test('a run survives 15 minutes of simulation without unbounded growth', async ({ page }) => {
    test.setTimeout(240_000)
    await toMenu(page)
    await page.locator('.mm-list [data-a="play"]').click()
    await page.mouse.move(4, 4)
    await page.waitForTimeout(350)
    await page.locator('[data-cta]').click()
    await page.mouse.move(4, 4)
    await expect(page.locator('.ss-cards')).toBeVisible({ timeout: 8000 })
    await page.waitForTimeout(250)
    await page.locator('[data-a="start"]').click()
    await page.waitForTimeout(900)
    await expect(page.locator('.hud')).toBeVisible({ timeout: 8000 })

    const r = await page.evaluate(async () => {
      const up: any = await import(/* @vite-ignore */ '/src/game/upgrades.ts' as string)
      const w = window.__pf.game.world as any
      const p = w.p
      const samples: any[] = []
      for (let i = 0; i < 60 * 900; i++) {
        while (p.pending > 0) {
          const ch = up.rollChoices(w, p.stats.choices)
          if (!ch[0]) { p.pending = 0; break }
          up.applyChoice(w, ch[0])
          p.pending--
        }
        w.modal = false
        let mx = 0, my = 0
        w.inRadius(p.x, p.y, 360, (e: any) => {
          const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1
          const wt = (1 - Math.min(1, d / 360)) ** 2
          mx += (dx / d) * wt
          my += (dy / d) * wt
        })
        const ml = Math.hypot(mx, my)
        if (ml > 0.01) { p.vx = (mx / ml) * p.stats.moveSpeed; p.vy = (my / ml) * p.stats.moveSpeed }
        p.x += p.vx / 60
        p.y += p.vy / 60
        w.update(1 / 60)
        if (p.dead) break
        if (i % (60 * 180) === 0) {
          samples.push({
            t: Math.round(w.time),
            enemies: w.enemies.length,
            shots: w.shots.length,
            parts: w.parts?.length ?? 0,
            pickups: w.pickups.length,
            hazards: w.hazards?.length ?? 0,
            weapons: p.weapons.length,
            level: p.level,
          })
        }
      }
      return { samples, level: p.level, kills: w.kills, dead: p.dead, time: +w.time.toFixed(0) }
    })

    expect(r.samples.length).toBeGreaterThanOrEqual(4)
    // every pool must stay bounded; the exact ceiling is less important than the absence of a leak
    for (const s of r.samples) {
      expect(s.enemies, `enemies at ${s.t}s`).toBeLessThanOrEqual(420)
      expect(s.shots, `shots at ${s.t}s`).toBeLessThanOrEqual(900)
      expect(s.pickups, `pickups at ${s.t}s`).toBeLessThanOrEqual(460)
      expect(s.hazards, `hazards at ${s.t}s`).toBeLessThanOrEqual(220)
    }
    // and the run should still be progressing, not stalled at level 1
    expect(r.level, 'a 15-minute run should be well levelled').toBeGreaterThan(10)
  })

  test('two tabs of the game do not corrupt each other\u2019s save', async ({ page, context }) => {
    await page.evaluate(() => {
      window.__pf.save.data.lumens = 100
      window.__pf.save.write()
    })
    const second = await context.newPage()
    const log2 = new ErrorLog(second)
    await second.goto('http://127.0.0.1:5399/', { waitUntil: 'domcontentloaded' })
    await second.waitForSelector('.logo', { timeout: 15000 })
    const v = await second.evaluate(() => window.__pf.save.data.lumens)
    expect(v, 'the second tab should read the same profile').toBe(100)
    // writing in tab two must be visible to tab one after a reload, not silently lost
    await second.evaluate(() => {
      window.__pf.save.data.lumens = 250
      window.__pf.save.write()
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.locator('.logo')).toBeVisible({ timeout: 15000 })
    const back = await page.evaluate(() => window.__pf.save.data.lumens)
    expect(back, 'the later write should win').toBe(250)
    log2.assertClean({} as any)
    await second.close()
  })
})
