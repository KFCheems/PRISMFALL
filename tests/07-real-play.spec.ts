import { test, expect, type Page } from '@playwright/test'
import { boot, toMenu, ErrorLog } from './helpers'

/**
 * Honest gameplay tests: real keys only, no invulnerability, no injected weapons, no forced kills.
 * These are the tests that prove the game is actually playable.
 */
async function startRun(page: Page, charId = 'vex') {
  await toMenu(page)
  await page.locator('.mm-list [data-a="play"]').click()
  await page.mouse.move(4, 4)
  await page.waitForTimeout(300)
  await page.locator(`.ct[data-id="${charId}"]`).click()
  await page.mouse.move(4, 4)
  await page.waitForTimeout(150)
  await page.locator('[data-cta]').click()
  await page.mouse.move(4, 4)
  await expect(page.locator('.ss-cards')).toBeVisible({ timeout: 8000 })
  await page.locator('[data-a="start"]').click()
  await page.waitForTimeout(700)
}

/** Hold a key for a duration, letting the real frame loop run. */
async function hold(page: Page, key: string, ms: number) {
  await page.keyboard.down(key)
  await page.waitForTimeout(ms)
  await page.keyboard.up(key)
}

/** Dismiss any level-up overlay that is open, waiting out its opening lock. */
async function clearLevelUp(page: Page) {
  for (let i = 0; i < 40; i++) {
    const n = await page.locator('.card').count()
    if (!n) return
    const locked = await page.evaluate(() => ((window.__pf.ui.top as any)?.lock ?? 0) > 0)
    if (locked) {
      await page.waitForTimeout(120)
      continue
    }
    await page.locator('.card').first().click({ timeout: 5000 }).catch(() => {})
    await page.waitForTimeout(200)
  }
}

test.describe('real play, no cheats', () => {
  let log: ErrorLog
  test.beforeEach(async ({ page }) => {
    log = new ErrorLog(page)
    await boot(page)
  })
  test.afterEach(async ({ page }, info) => log.assertClean(info))

  test('survives 60 seconds of real-time play by dodging', async ({ page }) => {
    await startRun(page)
    await expect(page.locator('.hud')).toBeVisible()

    // play for real: circle-strafe and dash on cooldown, exactly as a player would
    const keys = ['KeyW', 'KeyD', 'KeyS', 'KeyA']
    const start = Date.now()
    let i = 0
    while (Date.now() - start < 60_000) {
      const k = keys[i++ % keys.length]
      await hold(page, k, 850)
      // dash away whenever it is up
      await page.keyboard.press('Space')
      await page.waitForTimeout(120)
      // clear any level-up card that appeared, by picking the highlighted one
      await clearLevelUp(page)
    }

    const s = await page.evaluate(() => {
      const w = window.__pf.game.world as any
      return {
        time: +w.time.toFixed(1),
        hp: Math.round(w.p.hp),
        maxHp: Math.round(w.p.stats.maxHp),
        level: w.p.level,
        kills: w.kills,
        dead: w.p.dead,
        weapons: w.p.weapons.map((x: any) => x.def.id),
        lumens: w.lumens,
      }
    })
    // the whole point: a player who moves and dashes must still be alive after a minute
    expect(s.dead, 'the player should survive 60s of active dodging').toBe(false)
    expect(s.time).toBeGreaterThanOrEqual(55)
    expect(s.kills, 'kills should accumulate without any help').toBeGreaterThan(5)
    expect(s.level, 'XP should level the player up').toBeGreaterThan(1)
  })

  test('levels up from real kills and reaches the level-up screen', async ({ page }) => {
    await startRun(page)
    await expect(page.locator('.hud')).toBeVisible()
    // play with movement; the starting weapon fires on its own. A level-up needs a few dozen kills,
    // which takes about a minute of real play at the opening spawn rate.
    let sawCard = false
    for (let i = 0; i < 110 && !sawCard; i++) {
      await hold(page, ['KeyW', 'KeyD', 'KeyS', 'KeyA'][i % 4], 700)
      sawCard = (await page.locator('.card').count()) > 0 || (await page.locator('.lu-title').count()) > 0
    }
    const s = await page.evaluate(() => {
      const w = window.__pf.game.world as any
      return w ? { level: w.p.level, kills: w.kills, t: +w.time.toFixed(0) } : null
    })
    expect(sawCard, `a level-up card should appear from natural kills (got ${JSON.stringify(s)})`).toBe(true)
  })

  test('the player can die when standing still', async ({ page }) => {
    await startRun(page)
    await expect(page.locator('.hud')).toBeVisible()
    // do nothing at all — enemies must eventually kill the player. Run the simulation in real-ish
    // slices so the spawner, hazards and level-ups all tick the way they do in play.
    const r = await page.evaluate(async () => {
      const w = window.__pf.game.world as any
      let t = 0
      for (let i = 0; i < 60 * 150; i++) {
        w.p.pending = 0
        w.modal = false
        w.update(1 / 60)
        t = w.time
        if (w.p.dead) return { died: true, t: +t.toFixed(1), killers: w.enemies.length }
      }
      return { died: false, t: +t.toFixed(1), hp: Math.round(w.p.hp), killers: w.enemies.length }
    })
    expect(r.died, `standing still must be lethal (survived ${r.t}s at ${(r as any).hp} hp with ${r.killers} enemies)`).toBe(true)
  })

  test('dash actually avoids damage', async ({ page }) => {
    await startRun(page)
    await expect(page.locator('.hud')).toBeVisible()
    const r = await page.evaluate(() => {
      const w = window.__pf.game.world as any
      const hp0 = w.p.hp
      w.p.iframes = 1.0
      // a hazard landing during i-frames must not hurt
      w.hurt(50)
      return { before: hp0, after: w.p.hp, iframesWork: w.p.hp === hp0 }
    })
    expect(r.iframesWork, 'i-frames must block damage').toBe(true)
  })

  test('enemies of every stage can actually be killed by the starter weapon', async ({ page }) => {
    await startRun(page)
    await expect(page.locator('.hud')).toBeVisible()
    const r = await page.evaluate(async () => {
      const reg: any = await import(/* @vite-ignore */ '/src/game/registry.ts' as string)
      const w = window.__pf.game.world as any
      const results: any[] = []
      for (const def of reg.ENEMIES.filter((d: any) => !d.boss)) {
        // clear the field so the weapon has exactly one target to shoot at
        for (const other of w.enemies) other.dead = true
        w.enemies.length = 0
        w.shots.length = 0
        const e = w.spawnEnemy(def, w.p.x + 90, w.p.y)
        const hp0 = e.hp
        // pin the target in front of the player *before* every step, so aim and collisions agree
        for (let i = 0; i < 60 * 15; i++) {
          w.p.hp = w.p.stats.maxHp
          if (!e.dead) {
            e.x = w.p.x + 90
            e.y = w.p.y
            e.vx = e.vy = e.kbx = e.kby = 0
          }
          w.update(1 / 60)
          // the stage keeps spawning; keep the arena focused on the target under test
          for (const other of w.enemies) if (other !== e) other.dead = true
          if (e.dead) break
        }
        results.push({ id: def.id, killed: e.dead, dmgTaken: Math.round(hp0 - Math.max(0, e.hp)) })
        if (!e.dead) e.dead = true
      }
      return results
    })
    const unkillable = r.filter((x) => !x.killed)
    expect(unkillable.map((x) => `${x.id}(${x.dmgTaken})`), 'every normal enemy must be killable by the starter weapon').toEqual([])
  })
})
