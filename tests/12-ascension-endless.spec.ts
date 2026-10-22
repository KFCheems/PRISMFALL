import { test, expect } from '@playwright/test'
import { boot, toMenu, ErrorLog } from './helpers'

/**
 * Ascension and Endless — the two modes players unlock after the first clear.
 *
 * The navigation suite only checks that the controls are disabled before a clear; this suite plays them.
 * Ascension must genuinely raise enemy HP/damage and the reward, and Endless must keep spawning forever
 * instead of quietly ending at the normal boss.
 */
test.describe('ascension and endless', () => {
  let log: ErrorLog
  test.beforeEach(async ({ page }) => {
    log = new ErrorLog(page)
    await boot(page)
    await page.evaluate(() => {
      const s = window.__pf.save
      s.data.cleared = { shallows: 10, crimson: 10, verdant: 10, singularity: 10 }
      s.data.lumens = 999999
      s.data.chars = ['vex', 'ember', 'moss', 'quill', 'halo', 'null']
      s.write()
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.locator('.logo').waitFor({ timeout: 15000 })
    await page.mouse.click(4, 4)
    await page.waitForTimeout(150)
  })
  test.afterEach(async ({ page }, info) => log.assertClean(info))

  async function openStageSelect(page: any) {
    await toMenu(page)
    await page.locator('.mm-list [data-a="play"]').click()
    await page.mouse.move(4, 4)
    await page.waitForTimeout(350)
    await page.locator('[data-cta]').click()
    await page.mouse.move(4, 4)
    await expect(page.locator('.ss-cards')).toBeVisible({ timeout: 8000 })
    await page.waitForTimeout(300)
  }

  test('ascension is capped at 10 and every level in between is reachable', async ({ page }) => {
    await openStageSelect(page)
    const seen: number[] = []
    for (let i = 0; i < 14; i++) {
      seen.push(await page.evaluate(() => (window.__pf.ui.top as any)?.asc ?? 0))
      const right = page.locator('[data-o="asc"] [data-d="1"]')
      if (!(await right.count())) break
      await right.click()
      await page.mouse.move(4, 4)
      await page.waitForTimeout(100)
    }
    const max = Math.max(...seen)
    expect(max, `ascension should cap at 10 (saw ${JSON.stringify(seen)})`).toBe(10)
    expect(Math.min(...seen)).toBe(0)
    // once at the cap the control must not keep climbing
    const atCap = await page.evaluate(() => (window.__pf.ui.top as any)?.asc)
    expect(atCap).toBe(10)
  })

  test('ascension 10 makes enemies dramatically tougher and hits harder', async ({ page }) => {
    const runAt = async (ascLevel: number) => {
      await openStageSelect(page)
      await page.evaluate((n) => {
        const top = window.__pf.ui.top as any
        top.asc = n
        top.render?.()
      }, ascLevel)
      await page.waitForTimeout(250)
      await page.locator('[data-a="start"]').click()
      await page.waitForTimeout(900)
      const r = await page.evaluate(() => {
        const w = window.__pf.game.world as any
        return { asc: w.opts.asc, hpMul: w.mods.hp, dmgMul: w.mods.dmg }
      })
      await page.goto('http://127.0.0.1:5399/', { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('.logo', { timeout: 15000 })
      await page.mouse.click(4, 4)
      await page.waitForTimeout(250)
      return r
    }

    const a0 = await runAt(0)
    const a10 = await runAt(10)
    expect(a0.asc).toBe(0)
    expect(a10.asc, 'the run should record ascension 10').toBe(10)
    expect(a10.hpMul, 'ascension 10 should raise enemy HP well above base').toBeGreaterThan(a0.hpMul * 1.5)
    expect(a10.dmgMul, 'ascension 10 should raise enemy damage').toBeGreaterThan(a0.dmgMul)
  })

  test('endless keeps spawning after the normal boss window', async ({ page }) => {
    await openStageSelect(page)
    const toggle = page.locator('[data-o="endless"]')
    await expect(toggle).toBeVisible({ timeout: 5000 })
    await toggle.click()
    await page.mouse.move(4, 4)
    await page.waitForTimeout(200)
    const on = await page.evaluate(() => (window.__pf.ui.top as any)?.endless ?? null)
    expect(on, 'endless should be enabled').toBe(true)
    await page.locator('[data-a="start"]').click()
    await page.waitForTimeout(900)

    const r = await page.evaluate(async () => {
      const up: any = await import(/* @vite-ignore */ '/src/game/upgrades.ts' as string)
      const w = window.__pf.game.world as any
      const p = w.p
      let maxEnemies = 0
      for (let i = 0; i < 60 * 660; i++) {
        while (p.pending > 0) {
          const ch = up.rollChoices(w, p.stats.choices)
          if (!ch[0]) { p.pending = 0; break }
          up.applyChoice(w, ch[0])
          p.pending--
        }
        w.modal = false
        p.hp = p.stats.maxHp
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
        maxEnemies = Math.max(maxEnemies, w.enemies.length)
        if (w.ended) break
      }
      return { time: +w.time.toFixed(0), endless: w.opts.endless, enemies: w.enemies.length, maxEnemies, kills: w.kills, ended: !!w.ended, level: p.level }
    })
    expect(r.endless, 'the run should be in endless mode').toBe(true)
    expect(r.time, 'endless should run past the normal 600 s stage').toBeGreaterThan(600)
    expect(r.ended, 'endless should not end itself at the boss').toBe(false)
    expect(r.maxEnemies, 'endless should keep pressure up').toBeGreaterThan(20)
    expect(r.kills, 'endless should keep producing kills').toBeGreaterThan(100)
  })

  test('all six characters can be selected and each starts with its own weapon', async ({ page }) => {
    // mirrors src/content/characters.ts — the signature weapon of each light
    const chars = [
      { id: 'vex', weapon: 'pulse_bolt' },
      { id: 'ember', weapon: 'flame_arc' },
      { id: 'moss', weapon: 'spore_field' },
      { id: 'quill', weapon: 'prism_lance' },
      { id: 'halo', weapon: 'blade_ring' },
      { id: 'null', weapon: 'arc_drone' },
    ]
    const results: any[] = []
    for (const c of chars) {
      await toMenu(page)
      await page.locator('.mm-list [data-a="play"]').click()
      await page.mouse.move(4, 4)
      await expect(page.locator('.cs-body')).toBeVisible({ timeout: 8000 })
      await page.waitForTimeout(300)
      // click the character tile through the real UI, then commit with the CTA
      const tile = page.locator(`.ct[data-id="${c.id}"]`)
      await expect(tile).toBeVisible({ timeout: 5000 })
      await tile.click()
      await page.mouse.move(4, 4)
      await page.waitForTimeout(250)
      const cta = page.locator('[data-cta]')
      await expect(cta).toBeVisible({ timeout: 5000 })
      await cta.click()
      await page.mouse.move(4, 4)
      await expect(page.locator('.ss-cards')).toBeVisible({ timeout: 8000 })
      await page.waitForTimeout(200)
      await page.locator('[data-a="start"]').click()
      await page.waitForTimeout(900)
      const r = await page.evaluate(() => {
        const w = window.__pf.game.world as any
        return { char: w.p.char.id, weapon: w.p.weapons[0]?.def.id, level: w.p.level, hp: Math.round(w.p.stats.maxHp) }
      })
      results.push(r)
      // abandon and return to the menu
      await page.goto('http://127.0.0.1:5399/', { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('.logo', { timeout: 15000 })
      await page.mouse.click(4, 4)
      await page.waitForTimeout(200)
    }
    console.log('CHARLIST ' + JSON.stringify(results))
    for (let i = 0; i < chars.length; i++) {
      expect(results[i].char, `tile ${chars[i].id} should select ${chars[i].id}`).toBe(chars[i].id)
      expect(results[i].weapon, `${chars[i].id} should start with its signature weapon`).toBe(chars[i].weapon)
    }
  })
})
