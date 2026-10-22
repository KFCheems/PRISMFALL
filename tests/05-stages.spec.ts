import { test, expect, type Page } from '@playwright/test'
import { boot, toMenu, ErrorLog } from './helpers'

/** Start a run on a specific stage (unlocking it first through the save). */
async function startStage(page: Page, stageId: string, asc = 0, endless = false) {
  await page.evaluate(
    ({ stageId, asc }) => {
      const s = window.__pf.save
      // stage progression is meta state; the run itself is what we're testing
      s.data.cleared = { shallows: 10, crimson: 10, verdant: 10, singularity: 10 }
      s.data.cleared[stageId] = Math.max(s.data.cleared[stageId] ?? 0, asc)
      // forget the remembered stage so the selector opens on the one this test targets
      const ui = (s.data as any).ui ?? ((s.data as any).ui = {})
      delete ui.stage
      s.write()
    },
    { stageId, asc },
  )
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('.logo').waitFor({ timeout: 15000 })
  await page.mouse.click(6, 6)
  await page.waitForTimeout(150)
  await toMenu(page)
  await page.locator('.mm-list [data-a="play"]').click()
  await page.mouse.move(6, 6)
  await page.waitForTimeout(300)
  await page.locator('[data-cta]').click()
  await page.mouse.move(6, 6)
  await expect(page.locator('.ss-cards')).toBeVisible({ timeout: 8000 })
  // click the target card explicitly: the selector may have remembered another stage
  await page.locator(`.sc[data-id="${stageId}"]`).click()
  await page.mouse.move(6, 6)
  await page.waitForTimeout(250)
  const selected = await page.evaluate(() => (window.__pf.ui.top as any)?.st?.id ?? null)
  if (selected !== stageId) throw new Error(`stage select did not switch to ${stageId} (got ${selected})`)
  if (asc > 0) {
    for (let i = 0; i < asc; i++) await page.locator('.cyc i[data-d="1"]').click()
    await page.waitForTimeout(100)
  }
  if (endless) {
    await page.locator('[data-o="endless"]').click()
    await page.waitForTimeout(150)
    const on = await page.locator('[data-o="endless"] .tog').evaluate((e) => e.classList.contains('on'))
    if (!on) throw new Error('endless toggle did not turn on')
  }
  await page.locator('[data-a="start"]').click()
  await page.waitForTimeout(700)
  return selected
}

/** Drive a stage to its boss and kill it, returning what happened. */
async function playToWin(page: Page, opts: { strongBuild?: boolean } = {}) {
  return page.evaluate(async (opts) => {
    const up: any = await import(/* @vite-ignore */ '/src/game/upgrades.ts' as string)
    const w = window.__pf.game.world as any
    if (opts.strongBuild) {
      w.p.weapons.length = 0
      for (const [id, lv] of [['pulse_bolt', 7], ['flame_arc', 7], ['spore_field', 7], ['prism_lance', 7], ['frost_fan', 7], ['blade_ring', 7]]) {
        const wi = up.makeWeapon(id)
        wi.level = lv
        w.p.weapons.push(wi)
      }
    }
    w.p.recalc()
    w.p.stats.maxHp = 1e6
    w.p.hp = 1e6
    const stage = w.opts.stage
    let sawBoss = false
    let bossHp = 0
    let guard = 0
    const marks: any = {}
    while (guard++ < 60000) {
      w.p.hp = 1e6
      w.p.pending = 0
      w.modal = false
      w.update(1 / 30)
      if (w.boss && !sawBoss) {
        sawBoss = true
        bossHp = Math.round(w.boss.maxHp)
        marks.bossAt = Math.round(w.time)
      }
      if (w.boss) w.boss.hp -= w.boss.maxHp * 0.05 // speed the kill up; the fight still runs
      if (w.win) break
    }
    marks.win = w.win
    marks.time = Math.round(w.time)
    marks.kills = w.kills
    marks.bossKilled = w.bossKills
    marks.sawBoss = sawBoss
    marks.bossHp = bossHp
    marks.stage = stage.id
    // run the end sequence so the results screen appears
    for (let i = 0; i < 250; i++) {
      w.p.hp = 1e6
      w.p.pending = 0
      w.update(1 / 30)
      if (w.ending === 0) break
    }
    return marks
  }, opts)
}

test.describe('full stage runs', () => {
  let log: ErrorLog
  test.beforeEach(async ({ page }) => {
    log = new ErrorLog(page)
    await boot(page)
  })
  test.afterEach(async ({ page }, info) => log.assertClean(info))

  for (const [id, bossHp] of [
    ['shallows', 60000],
    ['crimson', 75600],
    ['verdant', 73600],
    ['singularity', 109200],
  ] as [string, number][]) {
    test(`${id} plays from wave 1 to a cleared boss`, async ({ page }) => {
      await startStage(page, id)
      await expect(page.locator('.hud')).toBeVisible({ timeout: 8000 })
      const r = await playToWin(page, { strongBuild: true })
      expect(r.stage).toBe(id)
      expect(r.sawBoss, 'the boss should spawn at the end of the timeline').toBe(true)
      expect(r.bossHp).toBe(bossHp)
      expect(r.win, 'stage should be cleared').toBe(true)
      expect(r.bossKilled).toBe(1)
      expect(r.time).toBeGreaterThanOrEqual(600)
      // the results screen is reachable
      await expect(page.locator('.results')).toBeVisible({ timeout: 10000 })
    })
  }

  test('ascension 5 raises enemy HP on the same stage', async ({ page }) => {
    await startStage(page, 'shallows', 5)
    await expect(page.locator('.hud')).toBeVisible({ timeout: 8000 })
    const r = await page.evaluate(() => {
      const w = window.__pf.game.world as any
      return { asc: w.opts.asc, stageHp: w.opts.stage.hp, hpMul: w.mods.hp, dmgMul: w.mods.dmg, lumens: w.mods.lumens }
    })
    expect(r.asc).toBe(5)
    // stage multiplier (shallows = 1) × ascension 1 (+20% HP at A1, no further HP at A2–A5)
    expect(r.hpMul).toBeCloseTo(r.stageHp * 1.2, 3)
    expect(r.dmgMul).toBeCloseTo(r.stageHp * 1.2, 3)
    expect(r.lumens).toBeGreaterThan(1)
  })

  test('endless mode keeps spawning after the boss', async ({ page }) => {
    await startStage(page, 'shallows', 0, true)
    await expect(page.locator('.hud')).toBeVisible({ timeout: 8000 })
    const r = await page.evaluate(() => {
      const w = window.__pf.game.world as any
      return { endless: w.opts.endless, stage: w.opts.stage.id }
    })
    expect(r.stage).toBe('shallows')
    expect(r.endless).toBe(true)
    const after = await page.evaluate(async () => {
      const w = window.__pf.game.world as any
      w.p.stats.maxHp = 1e9
      w.p.hp = 1e9
      w.spawner.bossDue = w.time
      // fight through the first boss, then confirm the next one is queued
      let guard = 0
      while (guard++ < 20000 && w.bossKills < 1) {
        w.p.hp = 1e9
        w.p.pending = 0
        w.modal = false
        w.update(1 / 30)
        if (w.boss) w.boss.hp -= w.boss.maxHp * 0.08
      }
      return { bossKills: w.bossKills, time: Math.round(w.time), nextBoss: Math.round(w.spawner.bossDue), stillRunning: !w.win }
    })
    expect(after.bossKills).toBeGreaterThanOrEqual(1)
    expect(after.stillRunning, 'endless never ends on a boss kill').toBe(true)
    expect(after.nextBoss).toBeGreaterThan(after.time)
  })
})

test.describe('death and results', () => {
  let log: ErrorLog
  test.beforeEach(async ({ page }) => {
    log = new ErrorLog(page)
    await boot(page)
  })
  test.afterEach(async ({ page }, info) => log.assertClean(info))

  test('dying ends the run with a defeat results screen', async ({ page }) => {
    await startStage(page, 'shallows')
    await expect(page.locator('.hud')).toBeVisible({ timeout: 8000 })
    const r = await page.evaluate(() => {
      const w = window.__pf.game.world as any
      w.p.stats.maxHp = 100
      w.p.hp = 1
      w.hurt(999)
      for (let i = 0; i < 200; i++) { w.p.pending = 0; w.update(1 / 30); if (w.ending === 0) break }
      return { dead: w.p.dead, win: w.win }
    })
    expect(r.dead).toBe(true)
    expect(r.win).toBe(false)
    await expect(page.locator('.results')).toBeVisible({ timeout: 10000 })
    const text = await page.locator('.menu-title').innerText()
    expect(text).toMatch(/LIGHT EXTINGUISHED|光芒熄灭/i)
  })

  test('a run records history and stats', async ({ page }) => {
    await startStage(page, 'shallows')
    await expect(page.locator('.hud')).toBeVisible({ timeout: 8000 })
    const before = await page.evaluate(() => ({ runs: window.__pf.save.data.stats.runs }))
    await page.evaluate(() => {
      const w = window.__pf.game.world as any
      w.p.stats.maxHp = 100
      w.p.hp = 1
      w.hurt(999)
      for (let i = 0; i < 200; i++) { w.p.pending = 0; w.update(1 / 30); if (w.ending === 0) break }
    })
    await page.waitForTimeout(800)
    const after = await page.evaluate(() => ({ runs: window.__pf.save.data.stats.runs, history: window.__pf.save.data.history.length }))
    expect(after.runs).toBe(before.runs + 1)
    expect(after.history).toBeGreaterThan(0)
  })
})
