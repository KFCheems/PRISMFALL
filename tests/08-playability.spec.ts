import { test, expect, type Page } from '@playwright/test'
import { boot, toMenu, ErrorLog } from './helpers'

/**
 * Playability gate.
 *
 * A fixed "hold each arrow key for a second" pattern is not dodging — it walks straight into packs.
 * This gate instead steers the way a person does: continuously sum repulsion from nearby enemies
 * (closer = stronger), bias toward the centre of the screen when nothing is close, and dash whenever
 * a body is about to touch. If that cannot survive the opening minute, the game is genuinely too hard.
 */

async function startStage(page: Page, stageId: string) {
  await toMenu(page)
  await page.locator('.mm-list [data-a="play"]').click()
  await page.mouse.move(4, 4)
  await page.waitForTimeout(300)
  await page.locator('[data-cta]').click()
  await page.mouse.move(4, 4)
  await expect(page.locator('.ss-cards')).toBeVisible({ timeout: 8000 })
  await page.locator(`.sc[data-id="${stageId}"]`).click()
  await page.mouse.move(4, 4)
  await page.waitForTimeout(200)
  await page.locator('[data-a="start"]').click()
  await page.waitForTimeout(700)
}

/** Run the world for `seconds` with a simple, honest dodging policy. Returns survival stats. */
async function playSkillfully(page: Page, seconds: number) {
  return page.evaluate(async (seconds) => {
    const up: any = await import(/* @vite-ignore */ '/src/game/upgrades.ts' as string)
    const w = window.__pf.game.world as any
    const p = w.p
    let minHp = p.hp
    let taken = 0
    let dashT = 0
    for (let i = 0; i < 60 * seconds; i++) {
      // take every upgrade, preferring to deepen an existing weapon — the way a strong player builds
      while (p.pending > 0) {
        const ch = up.rollChoices(w, p.stats.choices)
        if (!ch[0]) { p.pending = 0; break }
        const pick =
          ch.find((c: any) => c.kind === 'weapon' && p.weapons.some((x: any) => x.def.id === c.id)) ??
          ch.find((c: any) => c.kind === 'fusion') ??
          ch.find((c: any) => c.kind === 'weapon') ??
          ch.find((c: any) => c.kind === 'passive') ??
          ch[0]
        up.applyChoice(w, pick)
        p.pending--
      }
      w.modal = false

      // sum repulsion from every nearby enemy, weighted by proximity
      let mx = 0, my = 0, closest = 1e9
      w.inRadius(p.x, p.y, 360, (e: any) => {
        const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1
        closest = Math.min(closest, d)
        const wt = (1 - Math.min(1, d / 360)) ** 2
        mx += (dx / d) * wt
        my += (dy / d) * wt
      })
      // drift back toward the middle of the arena so it never corners itself
      const cx = -p.x * 0.00035, cy = -p.y * 0.00035
      mx += cx
      my += cy
      const ml = Math.hypot(mx, my)
      if (ml > 0.01) {
        p.vx = (mx / ml) * p.stats.moveSpeed
        p.vy = (my / ml) * p.stats.moveSpeed
      }
      // dash out of a grab
      dashT -= 1 / 60
      if (closest < 60 && p.dashCd <= 0) {
        p.iframes = Math.max(p.iframes, 0.3)
        p.dashCd = p.stats.dashCd
      }
      const before = p.hp
      p.x += p.vx / 60
      p.y += p.vy / 60
      w.update(1 / 60)
      if (p.hp < before) taken += before - p.hp
      minHp = Math.min(minHp, p.hp)
      if (p.dead) break
    }
    return {
      time: +w.time.toFixed(1),
      dead: p.dead,
      hp: Math.round(p.hp),
      maxHp: Math.round(p.stats.maxHp),
      level: p.level,
      kills: w.kills,
      minHp: Math.round(minHp),
      dmgTaken: Math.round(taken),
      weapons: p.weapons.map((x: any) => x.def.id + '@' + x.level + (x.fuse ?? '')),
    }
  }, seconds)
}

test.describe('playability gate', () => {
  let log: ErrorLog
  test.beforeEach(async ({ page }) => {
    log = new ErrorLog(page)
    await boot(page)
  })
  test.afterEach(async ({ page }, info) => log.assertClean(info))

  for (const stage of ['shallows', 'crimson', 'verdant', 'singularity']) {
    test(`${stage}: skilled play survives the first minute`, async ({ page }) => {
      if (stage !== 'shallows') {
        await page.evaluate(() => {
          const d = window.__pf.save.data
          d.cleared = { shallows: 10, crimson: 10, verdant: 10 }
          ;(d as any).ui ??= {}
          delete (d as any).ui.stage
          window.__pf.save.write()
        })
        await page.reload({ waitUntil: 'domcontentloaded' })
        await page.locator('.logo').waitFor({ timeout: 15000 })
        await page.mouse.click(4, 4)
        await page.waitForTimeout(150)
      }
      await startStage(page, stage)
      await expect(page.locator('.hud')).toBeVisible({ timeout: 8000 })
      const r = await playSkillfully(page, 60)
      expect(
        r.dead,
        `${stage}: died at ${r.time}s (hp ${r.hp}/${r.maxHp}, lv ${r.level}, ${r.kills} kills, took ${r.dmgTaken}, build ${r.weapons.join(' ')})`,
      ).toBe(false)
      expect(r.time).toBeGreaterThanOrEqual(55)
      expect(r.level, `${stage}: should have levelled up by 60s`).toBeGreaterThan(1)
    })
  }
})
