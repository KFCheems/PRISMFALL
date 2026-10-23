import { test, expect, type Page } from '@playwright/test'
import { boot, toMenu, advance, ErrorLog } from './helpers'

/** Start a run through real UI clicks (character select -> stage select -> begin). */
async function startRun(page: Page, charId = 'vex', stageId = 'shallows') {
  await toMenu(page)
  await page.locator('.mm-list [data-a="play"]').click()
  await page.mouse.move(6, 6)
  await page.waitForTimeout(350)

  // character select: pick the tile, then confirm with its CTA
  await page.locator(`.ct[data-id="${charId}"]`).click()
  await page.mouse.move(6, 6)
  await page.waitForTimeout(200)
  const cta = page.locator('[data-cta]')
  if ((await cta.count()) === 0) throw new Error(`character ${charId} has no select button (locked?)`)
  await cta.click()
  await page.mouse.move(6, 6)

  // stage select
  await expect(page.locator('.ss-cards')).toBeVisible({ timeout: 8000 })
  if (stageId !== 'shallows') await page.locator(`.sc[data-id="${stageId}"]`).click()
  await page.locator('[data-a="start"]').click()
  await page.waitForTimeout(700)
}

/** True once the world exists and the HUD is mounted. */
async function inRun(page: Page) {
  await expect(page.locator('.hud')).toBeVisible({ timeout: 8000 })
}

test.describe('starting a run', () => {
  let log: ErrorLog
  test.beforeEach(async ({ page }) => {
    log = new ErrorLog(page)
    await boot(page)
  })
  test.afterEach(async ({ page }, info) => log.assertClean(info))

  test('a real click path starts a run with the chosen character', async ({ page }) => {
    await startRun(page)
    await inRun(page)
    const w = await page.evaluate(() => {
      const w = window.__pf.game.world as any
      return { stage: w.opts.stage.id, char: w.opts.char.id, weapons: w.p.weapons.map((x: any) => x.def.id), hp: w.p.hp, max: w.p.stats.maxHp }
    })
    expect(w.stage).toBe('shallows')
    expect(w.char).toBe('vex')
    expect(w.weapons).toEqual(['pulse_bolt'])
    expect(w.hp).toBe(w.max)
  })

  test('keyboard movement actually moves the player', async ({ page }) => {
    await startRun(page)
    await inRun(page)
    const before = await page.evaluate(() => ({ x: window.__pf.game.world!.p.x, y: window.__pf.game.world!.p.y }))
    await page.keyboard.down('KeyD')
    await page.waitForTimeout(700)
    await page.keyboard.up('KeyD')
    await page.waitForTimeout(200)
    const after = await page.evaluate(() => ({ x: window.__pf.game.world!.p.x, y: window.__pf.game.world!.p.y }))
    expect(after.x).toBeGreaterThan(before.x + 20)
  })

  test('dash gives i-frames and has a cooldown', async ({ page }) => {
    await startRun(page)
    await inRun(page)
    // Dash state decays within a fraction of a second, so sampling once after a fixed delay is racy under
    // load. Record the peak values the game actually reached instead.
    await page.evaluate(() => {
      const p = window.__pf.game.world!.p as any
      const w = window as any
      w.__peak = { dashT: 0, iframes: 0, cd: 0 }
      w.__peakTimer = setInterval(() => {
        w.__peak.dashT = Math.max(w.__peak.dashT, p.dashT)
        w.__peak.iframes = Math.max(w.__peak.iframes, p.iframes)
        w.__peak.cd = Math.max(w.__peak.cd, p.dashCd)
      }, 8)
    })
    await page.keyboard.down('KeyD')
    await page.waitForTimeout(150)
    await page.keyboard.press('Space')
    await page.waitForTimeout(400)
    await page.keyboard.up('KeyD')
    const dash = await page.evaluate(() => {
      const w = window as any
      clearInterval(w.__peakTimer)
      return w.__peak as { dashT: number; iframes: number; cd: number }
    })
    expect(dash.dashT, 'dash should have started').toBeGreaterThan(0)
    expect(dash.iframes, 'dash should grant i-frames').toBeGreaterThan(0)
    expect(dash.cd, 'dash should go on cooldown').toBeGreaterThan(0)
  })

  test('enemies spawn and the player weapon kills them', async ({ page }) => {
    await startRun(page)
    await inRun(page)
    // enemies trickle in from off-screen; wait for the spawner to deliver one rather than assuming a delay
    await page.waitForFunction(() => (window.__pf.game.world as any)?.enemies.length > 0, null, { timeout: 20000 }).catch(() => {})
    const r = await page.evaluate(() => {
      const w = window.__pf.game.world as any
      return { enemies: w.enemies.length }
    })
    expect(r.enemies).toBeGreaterThan(0)
    // let auto-aim + the weapon do their job for a while
    await advance(page, 40)
    const after = await page.evaluate(() => {
      const w = window.__pf.game.world as any
      return { kills: w.kills, dmg: w.p.weapons[0].dmg, shots: w.shots.length }
    })
    expect(after.dmg, 'the starting weapon should have dealt damage').toBeGreaterThan(0)
    expect(after.kills, 'at least one enemy should die').toBeGreaterThan(0)
  })

  test('pause opens, freezes the world, and resumes', async ({ page }) => {
    await startRun(page)
    await inRun(page)
    await page.keyboard.press('Escape')
    await expect(page.locator('.pause')).toBeVisible({ timeout: 5000 })
    const t1 = await page.evaluate(() => window.__pf.game.world!.time)
    await page.waitForTimeout(600)
    const t2 = await page.evaluate(() => window.__pf.game.world!.time)
    expect(t2 - t1).toBeLessThan(0.05)
    await page.locator('.pause [data-a="resume"]').click()
    await page.waitForTimeout(500)
    const t3 = await page.evaluate(() => window.__pf.game.world!.time)
    expect(t3).toBeGreaterThan(t2)
  })
})

test.describe('characters', () => {
  let log: ErrorLog
  test.beforeEach(async ({ page }) => {
    log = new ErrorLog(page)
    await boot(page)
  })
  test.afterEach(async ({ page }, info) => log.assertClean(info))

  test('every unlocked character starts with its signature weapon and stats', async ({ page }) => {
    // unlock all six through the save (this is meta state, not the behaviour under test)
    await page.evaluate(() => {
      const s = window.__pf.save
      s.data.chars = ['moss', 'quill', 'halo', 'null']
      s.data.lumens = 0
      s.write()
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.locator('.logo').waitFor()
    await page.mouse.click(6, 6)
    await page.waitForTimeout(100)

    const expected: Record<string, string> = {
      vex: 'pulse_bolt', ember: 'flame_arc', moss: 'spore_field', quill: 'prism_lance', halo: 'blade_ring', null: 'arc_drone',
    }
    for (const [id, weapon] of Object.entries(expected)) {
      await startRun(page, id)
      await inRun(page)
      const got = await page.evaluate(() => {
        const w = window.__pf.game.world as any
        return { char: w.opts.char.id, weapon: w.p.weapons[0].def.id, maxHp: Math.round(w.p.stats.maxHp) }
      })
      expect(got.char, `character ${id}`).toBe(id)
      expect(got.weapon, `starting weapon for ${id}`).toBe(weapon)
      expect(got.maxHp).toBeGreaterThan(50)
      // tear the run down and return to the title screen for the next iteration
      await page.evaluate(() => {
        window.__pf.game.end()
        window.__pf.ui.reset()
        window.__pf.save.write()
      })
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.locator('.logo').waitFor({ timeout: 15000 })
      await page.mouse.click(6, 6)
      await page.mouse.move(6, 6)
      await page.waitForTimeout(250)
    }
  })

  test('character stat modifiers are applied', async ({ page }) => {
    await page.evaluate(() => { const s = window.__pf.save; s.data.chars = ['moss']; s.write() })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.locator('.logo').waitFor()
    await page.mouse.click(6, 6)
    await startRun(page, 'moss')
    await inRun(page)
    const m = await page.evaluate(() => {
      const p = window.__pf.game.world!.p as any
      return { maxHp: p.stats.maxHp, regen: p.stats.regen, area: p.stats.area, move: p.stats.moveSpeed }
    })
    // Moss: +30% max HP, +0.6 regen, +10% area, -8% move speed
    expect(m.maxHp).toBeCloseTo(130, 0)
    expect(m.regen).toBeCloseTo(0.6, 1)
    expect(m.area).toBeCloseTo(1.1, 2)
    expect(m.move).toBeCloseTo(184, 0)
  })
})
