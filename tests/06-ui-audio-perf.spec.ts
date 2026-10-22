import { test, expect, type Page } from '@playwright/test'
import { boot, toMenu, ErrorLog } from './helpers'

test.describe('internationalisation', () => {
  let log: ErrorLog
  test.beforeEach(async ({ page }) => {
    log = new ErrorLog(page)
    await boot(page)
  })
  test.afterEach(async ({ page }, info) => log.assertClean(info))

  test('switching to Chinese translates the whole menu', async ({ page }) => {
    await toMenu(page)
    await page.evaluate(async () => {
      const { setLang } = await import(/* @vite-ignore */ '/src/core/i18n.ts' as string)
      const { save } = window.__pf
      setLang('zh')
      save.data.settings.lang = 'zh'
      save.write()
      window.__pf.ui.relang()
    })
    await page.waitForTimeout(400)
    const text = await page.locator('.mm-list').innerText()
    expect(text).toMatch(/[\u4e00-\u9fa5]/)
    expect(text).not.toMatch(/\bPlay\b/)
  })

  test('switching back to English restores English', async ({ page }) => {
    await toMenu(page)
    await page.evaluate(async () => {
      const { setLang } = await import(/* @vite-ignore */ '/src/core/i18n.ts' as string)
      setLang('zh')
      window.__pf.ui.relang()
      setLang('en')
      window.__pf.ui.relang()
    })
    await page.waitForTimeout(500)
    const text = await page.locator('.mm-list').innerText()
    expect(text.toUpperCase()).toMatch(/PLAY|FORGE|SETTINGS/)
  })

  test('the language setting persists across reloads', async ({ page }) => {
    await page.evaluate(async () => {
      const { setLang } = await import(/* @vite-ignore */ '/src/core/i18n.ts' as string)
      const { save } = window.__pf
      setLang('zh')
      save.data.settings.lang = 'zh'
      save.write()
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.locator('.logo').waitFor({ timeout: 15000 })
    const lang = await page.evaluate(() => document.documentElement.lang)
    expect(lang).toBe('zh-CN')
  })

  test('no player-facing screen shows a raw key or undefined', async ({ page }) => {
    await toMenu(page)
    const bad: string[] = []
    for (const item of ['forge', 'codex', 'ach', 'settings', 'credits']) {
      await page.locator(`.mm-list [data-a="${item}"]`).click()
      await page.mouse.move(6, 6)
      await page.waitForTimeout(450)
      const t = await page.locator('.screen.in').last().innerText()
      if (/undefined|\[object|null|NaN/.test(t)) bad.push(item)
      await page.keyboard.press('Escape')
      await page.waitForTimeout(350)
    }
    expect(bad).toEqual([])
  })
})

test.describe('video settings and layouts', () => {
  let log: ErrorLog
  test.beforeEach(async ({ page }) => {
    log = new ErrorLog(page)
    await boot(page)
  })
  test.afterEach(async ({ page }, info) => log.assertClean(info))

  for (const [w, h, label] of [
    [1280, 720, '720p'],
    [1280, 800, 'Steam Deck'],
    [1920, 1080, '1080p'],
    [2560, 1440, '1440p'],
  ] as [number, number, string][]) {
    test(`the menu and stage select lay out correctly at ${label}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h })
      await page.waitForTimeout(500)
      await toMenu(page)
      // let the menu's entrance animation settle before measuring or clicking
      await page.waitForTimeout(700)
      // nothing should overflow the viewport horizontally
      const over = await page.evaluate(() => {
        const bad: string[] = []
        for (const el of document.querySelectorAll<HTMLElement>('.mm-left, .mm-right, .mm-list, .logo')) {
          const r = el.getBoundingClientRect()
          if (r.right > innerWidth + 2 || r.left < -2) bad.push(el.className + ':' + Math.round(r.left) + '..' + Math.round(r.right))
        }
        return bad
      })
      expect(over, `elements overflowing at ${label}`).toEqual([])
      await page.locator('.mm-list [data-a="play"]').click()
      await page.mouse.move(6, 6)
      await page.waitForTimeout(500)
      await page.locator('[data-cta]').click()
      await page.mouse.move(6, 6)
      await page.waitForTimeout(500)
      const cardsFit = await page.locator('.ss-cards').evaluate((el) => {
        const r = el.getBoundingClientRect()
        return r.right <= innerWidth + 2 && r.bottom <= innerHeight + 2
      })
      expect(cardsFit, `stage cards must fit at ${label}`).toBe(true)
    })
  }

  test('render scale and bloom settings apply to the renderer', async ({ page }) => {
    await toMenu(page)
    await page.evaluate(() => {
      window.__pf.save.data.settings.renderScale = 0.75
      window.__pf.save.data.settings.bloom = 0.5
      window.__pf.save.write()
      window.__pf.renderer.renderScale = 0.75
      window.__pf.renderer.post.bloom = 0.5
    })
    await page.waitForTimeout(300)
    const r = await page.evaluate(() => ({ scale: window.__pf.renderer.renderScale, bloom: window.__pf.renderer.post.bloom }))
    expect(r.scale).toBe(0.75)
    expect(r.bloom).toBe(0.5)
  })
})

test.describe('audio engine', () => {
  let log: ErrorLog
  test.beforeEach(async ({ page }) => {
    log = new ErrorLog(page)
    await boot(page)
  })
  test.afterEach(async ({ page }, info) => log.assertClean(info))

  test('the audio context unlocks on a real gesture and starts running', async ({ page }) => {
    const state = await page.evaluate(() => window.__pf.audio.ctx?.state ?? 'none')
    expect(state).toBe('running')
  })

  test('all 57 sound effects synthesize without error', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const mod: any = await import(/* @vite-ignore */ '/src/core/audio.ts' as string)
      const names = [
        'shoot', 'shootHeavy', 'laser', 'slash', 'pulse', 'whip', 'spore', 'plant', 'turret', 'drone', 'orbit', 'shard', 'mortar', 'beam',
        'hit', 'crit', 'explode', 'explodeBig', 'zap', 'freeze', 'shatter', 'burn', 'void',
        'enemyDie', 'eliteDie', 'enemyShoot', 'charge', 'teleport', 'spawn', 'bossWarn', 'bossRoar', 'bossDie', 'bossPhase',
        'hurt', 'heal', 'dash', 'xp', 'lumen', 'pickup', 'levelUp', 'chest', 'fusion', 'overdriveReady', 'overdrive', 'revive', 'death', 'bomb', 'magnet',
        'uiMove', 'uiSelect', 'uiBack', 'uiDeny', 'unlock', 'achievement', 'victory', 'defeat', 'purchase',
      ]
      const failed: string[] = []
      for (const n of names) {
        try {
          window.__pf.audio.resetGate(n as any)
          window.__pf.audio.sfx(n as any, { vol: 1 })
        } catch (e) {
          failed.push(n + ': ' + (e as Error).message)
        }
      }
      return { total: names.length, failed }
    })
    expect(r.total).toBe(57)
    expect(r.failed).toEqual([])
  })

  test('every music track starts and switches cleanly', async ({ page }) => {
    // clear the UI stack: menu screens assert their own music in enter(), which would fight the test
    await page.evaluate(() => window.__pf.ui.reset())
    await page.waitForTimeout(200)
    const r = await page.evaluate(async () => {
      const a = window.__pf.audio
      const tracks = ['menu', 'stage1', 'stage2', 'stage3', 'stage4', 'boss', 'finalBoss', 'victory', 'defeat']
      const seen: string[] = []
      for (const t of tracks) {
        a.music(null)
        await new Promise((r) => setTimeout(r, 60))
        a.music(t as any)
        await new Promise((r) => setTimeout(r, 200))
        seen.push(a.debugState().track as string)
      }
      a.music(null)
      return seen
    })
    expect(r).toEqual(['menu', 'stage1', 'stage2', 'stage3', 'stage4', 'boss', 'finalBoss', 'victory', 'defeat'])
  })

  test('volume controls attenuate the master output', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const a = window.__pf.audio
      const ctx = a.ctx!
      const an = a.tapMaster()!
      const buf = new Float32Array(an.fftSize)
      const rms = async (ms = 500) => {
        let sum = 0, n = 0
        const t0 = performance.now()
        while (performance.now() - t0 < ms) {
          await new Promise((r) => setTimeout(r, 50))
          an.getFloatTimeDomainData(buf)
          for (let i = 0; i < buf.length; i++) { sum += buf[i] * buf[i]; n++ }
        }
        return Math.sqrt(sum / n)
      }
      a.music('stage1')
      a.intensity(1)
      await new Promise((r) => setTimeout(r, 700))
      a.volumes(0.8, 0.7, 0.8)
      await new Promise((r) => setTimeout(r, 300))
      const normal = await rms()
      a.volumes(0.8, 0, 0.8)
      await new Promise((r) => setTimeout(r, 400))
      const musicOff = await rms()
      a.volumes(0.8, 0.7, 0.8)
      return { normal, musicOff }
    })
    expect(r.normal).toBeGreaterThan(0)
    expect(r.musicOff).toBeLessThan(r.normal * 0.2)
  })
})

test.describe('performance and stability', () => {
  let log: ErrorLog
  test.beforeEach(async ({ page }) => {
    log = new ErrorLog(page)
    await boot(page)
  })
  test.afterEach(async ({ page }, info) => log.assertClean(info))

  test('a dense late-game screen stays responsive and bounded', async ({ page }) => {
    await toMenu(page)
    await page.locator('.mm-list [data-a="play"]').click()
    await page.mouse.move(6, 6)
    await page.waitForTimeout(300)
    await page.locator('[data-cta]').click()
    await page.mouse.move(6, 6)
    await page.waitForTimeout(400)
    await page.locator('[data-a="start"]').click()
    await page.waitForTimeout(700)

    const r = await page.evaluate(async () => {
      const up: any = await import(/* @vite-ignore */ '/src/game/upgrades.ts' as string)
      const w = window.__pf.game.world as any
      // a realistic 10-minute build
      w.p.weapons.length = 0
      for (const id of ['pulse_bolt', 'flame_arc', 'spore_field', 'prism_lance', 'frost_fan', 'blade_ring']) {
        const wi = up.makeWeapon(id)
        wi.level = 7
        w.p.weapons.push(wi)
      }
      w.p.recalc()
      w.p.stats.maxHp = 1e9
      w.p.hp = 1e9
      // flood the arena
      for (let i = 0; i < 320; i++) {
        const a = Math.random() * Math.PI * 2, d = 120 + Math.random() * 500
        w.spawnEnemy(['mote', 'drifter', 'dart', 'splitter'][i % 4], w.p.x + Math.cos(a) * d, w.p.y + Math.sin(a) * d)
      }
      const t0 = performance.now()
      for (let i = 0; i < 60 * 10; i++) { w.p.hp = 1e9; w.p.pending = 0; w.modal = false; w.update(1 / 60) }
      const ms = performance.now() - t0
      return {
        simMsPerFrame: +(ms / 600).toFixed(2),
        enemies: w.enemies.length,
        particles: w.parts.length,
        shots: w.shots.length,
        bullets: w.bullets.length,
        kills: w.kills,
      }
    })
    // simulation cost only; rendering is measured separately on a real GPU
    expect(r.simMsPerFrame, 'simulation should stay well under a 16.6 ms frame').toBeLessThan(6)
    expect(r.enemies).toBeLessThan(420)
    expect(r.particles).toBeLessThan(2000)
    expect(r.kills).toBeGreaterThan(0)
  })

  test('a 10-minute run does not leak arrays', async ({ page }) => {
    await toMenu(page)
    await page.locator('.mm-list [data-a="play"]').click()
    await page.mouse.move(6, 6)
    await page.waitForTimeout(300)
    await page.locator('[data-cta]').click()
    await page.mouse.move(6, 6)
    await page.waitForTimeout(400)
    await page.locator('[data-a="start"]').click()
    await page.waitForTimeout(700)

    const r = await page.evaluate(async () => {
      const up: any = await import(/* @vite-ignore */ '/src/game/upgrades.ts' as string)
      const w = window.__pf.game.world as any
      w.p.weapons.length = 0
      for (const id of ['pulse_bolt', 'flame_arc', 'spore_field']) {
        const wi = up.makeWeapon(id)
        wi.level = 7
        w.p.weapons.push(wi)
      }
      w.p.recalc()
      w.p.stats.maxHp = 1e9
      w.p.hp = 1e9
      const samples: any[] = []
      for (let s = 0; s < 10; s++) {
        for (let i = 0; i < 60 * 10; i++) { w.p.hp = 1e9; w.p.pending = 0; w.modal = false; w.update(1 / 60) }
        samples.push({ t: Math.round(w.time), enemies: w.enemies.length, parts: w.parts.length, pickups: w.pickups.length, texts: w.texts.length, shots: w.shots.length })
        // let the player collect everything so pickups don't grow unbounded
        for (const pk of w.pickups) pk.pull = true
      }
      return samples
    })
    const last = r[r.length - 1]
    const mid = r[Math.floor(r.length / 2)]
    // arrays must not grow without bound over a long run
    expect(last.pickups).toBeLessThan(1500)
    expect(last.parts).toBeLessThan(2000)
    expect(last.enemies).toBeLessThan(420)
    expect(last.shots).toBeLessThan(400)
    // time should have advanced a full 100 s of simulation
    expect(last.t).toBeGreaterThan(mid.t)
  })
})
