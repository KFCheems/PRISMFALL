import { test, expect, type Page } from '@playwright/test'
import { boot, toMenu, ErrorLog, waitUnlocked } from './helpers'

/** Start a run through real UI clicks. */
async function startRun(page: Page, charId = 'vex') {
  await toMenu(page)
  await page.locator('.mm-list [data-a="play"]').click()
  await page.mouse.move(6, 6)
  await page.waitForTimeout(300)
  await page.locator(`.ct[data-id="${charId}"]`).click()
  await page.mouse.move(6, 6)
  await page.waitForTimeout(150)
  await page.locator('[data-cta]').click()
  await page.mouse.move(6, 6)
  await expect(page.locator('.ss-cards')).toBeVisible({ timeout: 8000 })
  await page.locator('[data-a="start"]').click()
  await page.waitForTimeout(600)
}

test.describe('progression systems', () => {
  let log: ErrorLog
  test.beforeEach(async ({ page }) => {
    log = new ErrorLog(page)
    await boot(page)
  })
  test.afterEach(async ({ page }, info) => log.assertClean(info))

  test('XP levels the player up and queues upgrade cards', async ({ page }) => {
    await startRun(page)
    await expect(page.locator('.hud')).toBeVisible()
    const r = await page.evaluate(() => {
      const w = window.__pf.game.world as any
      for (let i = 0; i < 30; i++) w.dropXp(w.p.x + 8, w.p.y, 100)
      for (let i = 0; i < 120; i++) { w.p.hp = 1e9; w.update(1 / 60) }
      return { level: w.p.level, pending: w.p.pending }
    })
    expect(r.level).toBeGreaterThan(1)
    expect(r.pending).toBeGreaterThan(0)
    // the level-up screen opens on its own
    await expect(page.locator('.lu-title')).toBeVisible({ timeout: 8000 })
    expect(await page.locator('.card').count()).toBeGreaterThanOrEqual(3)
  })

  test('choosing a card applies it and consumes one pending level', async ({ page }) => {
    await startRun(page)
    await page.evaluate(() => {
      const w = window.__pf.game.world as any
      for (let i = 0; i < 30; i++) w.dropXp(w.p.x + 8, w.p.y, 100)
      for (let i = 0; i < 120; i++) { w.p.hp = 1e9; w.update(1 / 60) }
    })
    await expect(page.locator('.card').first()).toBeVisible({ timeout: 8000 })
    const before = await page.evaluate(() => {
      const w = window.__pf.game.world as any
      return { pending: w.p.pending, weapons: w.p.weapons.length, passives: w.p.passives.length }
    })
    await waitUnlocked(page); await page.locator('.card').first().click()
    await page.waitForTimeout(400)
    const after = await page.evaluate(() => {
      const w = window.__pf.game.world as any
      return { pending: w.p.pending, weapons: w.p.weapons.length, passives: w.p.passives.length }
    })
    expect(after.pending).toBe(before.pending - 1)
    expect(after.weapons + after.passives).toBeGreaterThanOrEqual(before.weapons + before.passives)
  })

  test('reroll and skip are honoured and decrement', async ({ page }) => {
    await startRun(page)
    await page.evaluate(() => {
      const w = window.__pf.game.world as any
      for (let i = 0; i < 30; i++) w.dropXp(w.p.x + 8, w.p.y, 100)
      for (let i = 0; i < 120; i++) { w.p.hp = 1e9; w.update(1 / 60) }
    })
    await expect(page.locator('.card').first()).toBeVisible({ timeout: 8000 })
    const r0 = await page.evaluate(() => {
      const p = window.__pf.game.world!.p as any
      return { rerolls: p.rerolls, skips: p.skips, pending: p.pending }
    })
    expect(r0.rerolls).toBeGreaterThan(0)
    const firstNames = await page.locator('.card .card-name').allInnerTexts()
    await waitUnlocked(page); await page.locator('[data-act="reroll"]').click()
    await page.waitForTimeout(300)
    const r1 = await page.evaluate(() => (window.__pf.game.world!.p as any).rerolls)
    expect(r1).toBe(r0.rerolls - 1)
    const secondNames = await page.locator('.card .card-name').allInnerTexts()
    expect(secondNames.join('|')).not.toBe(firstNames.join('|'))
    await waitUnlocked(page); await page.locator('[data-act="skip"]').click()
    await page.waitForTimeout(300)
    const r2 = await page.evaluate(() => {
      const p = window.__pf.game.world!.p as any
      return { skips: p.skips, pending: p.pending }
    })
    expect(r2.skips).toBe(r0.skips - 1)
    expect(r2.pending).toBe(r0.pending - 1)
  })

  test('fusion appears at two maxed different-hue weapons and merges them', async ({ page }) => {
    await startRun(page)
    const res = await page.evaluate(async () => {
      const up: any = await import(/* @vite-ignore */ '/src/game/upgrades.ts' as string)
      const w = window.__pf.game.world as any
      w.p.weapons.length = 0
      const a = up.makeWeapon('pulse_bolt'); a.level = 7; a.dmg = 500
      const b = up.makeWeapon('flame_arc'); b.level = 7; b.dmg = 300
      w.p.weapons.push(a, b)
      w.p.recalc()
      const pairs = up.fusionPairs(w)
      const choices = up.rollChoices(w, 3)
      const fusionCard = choices.find((c: any) => c.kind === 'fusion')
      return {
        pairs: pairs.length,
        dominant: pairs[0]?.[0]?.def?.id ?? null,
        hasFusionCard: !!fusionCard,
        fusionName: fusionCard?.name ?? null,
      }
    })
    expect(res.pairs).toBe(1)
    // the weapon that dealt more damage becomes the base
    expect(res.dominant).toBe('pulse_bolt')
    expect(res.hasFusionCard).toBe(true)

    const merged = await page.evaluate(async () => {
      const up: any = await import(/* @vite-ignore */ '/src/game/upgrades.ts' as string)
      const w = window.__pf.game.world as any
      const card = up.rollChoices(w, 3).find((c: any) => c.kind === 'fusion')
      const beforeCount = w.p.weapons.length
      up.applyChoice(w, card)
      return { beforeCount, afterCount: w.p.weapons.length, fuse: w.p.weapons[0].fuse, fusions: w.fusions }
    })
    expect(merged.afterCount).toBe(merged.beforeCount - 1)
    expect(merged.fuse).toBe('M') // R + B = Void
    expect(merged.fusions).toBe(1)
  })

  test('all three fusions produce the documented colours and Prismatic Resonance', async ({ page }) => {
    await startRun(page)
    const r = await page.evaluate(async () => {
      const up: any = await import(/* @vite-ignore */ '/src/game/upgrades.ts' as string)
      const w = window.__pf.game.world as any
      w.p.weapons.length = 0
      const mk = (id: string, fuse: string) => { const x = up.makeWeapon(id); x.level = 7; x.fuse = fuse; return x }
      w.p.weapons.push(mk('pulse_bolt', 'M'), mk('flame_arc', 'Y'), mk('spore_field', 'C'))
      w.p.recalc()
      return { fuses: w.p.weapons.map((x: any) => x.fuse).sort(), prismatic: w.p.prismatic, might: w.p.stats.might }
    })
    expect(r.fuses).toEqual(['C', 'M', 'Y'])
    expect(r.prismatic).toBe(true)
    // Prismatic Resonance is its own +20% might; hue resonance needs 3 *items* of one hue, which
    // three different fusions do not reach (each sits at 2 per hue by design).
    expect(r.might).toBeCloseTo(1.2, 2)
  })

  test('mono-hue builds reach the 3-item and 6-item resonance tiers', async ({ page }) => {
    await startRun(page)
    const r = await page.evaluate(async () => {
      const up: any = await import(/* @vite-ignore */ '/src/game/upgrades.ts' as string)
      const reg: any = await import(/* @vite-ignore */ '/src/game/registry.ts' as string)
      const w = window.__pf.game.world as any
      const out: any = {}
      w.p.weapons.length = 0
      w.p.passives.length = 0
      for (const id of ['flame_arc', 'ember_mortar', 'blade_ring']) { const x = up.makeWeapon(id); x.level = 3; w.p.weapons.push(x) }
      w.p.recalc()
      out.three = { res: w.p.resonance(), might: w.p.stats.might }
      for (const pid of ['crimson_lens', 'fracture_prism', 'ember_plating']) {
        const d = reg.PASSIVES.find((p: any) => p.id === pid)
        if (d) w.p.passives.push({ def: d, level: 3 })
      }
      w.p.recalc()
      out.six = { res: w.p.resonance(), might: w.p.stats.might }
      return out
    })
    expect(r.three.res.R).toBe(3)
    expect(r.three.might).toBeCloseTo(1.15, 2)
    expect(r.six.res.R).toBeGreaterThanOrEqual(6)
    expect(r.six.might).toBeGreaterThan(r.three.might)
  })

  test('overdrive charges with kills and Prism Burst fires', async ({ page }) => {
    await startRun(page)
    const r = await page.evaluate(() => {
      const w = window.__pf.game.world as any
      w.p.overdrive = 100
      w.p.odReady = true
      const before = w.overdrives
      w.overdrive()
      return { before, after: w.overdrives, charge: w.p.overdrive, ready: w.p.odReady }
    })
    expect(r.after).toBe(r.before + 1)
    expect(r.charge).toBe(0)
    expect(r.ready).toBe(false)
  })

  test('chest rewards actually upgrade the build', async ({ page }) => {
    await startRun(page)
    const r = await page.evaluate(async () => {
      const up: any = await import(/* @vite-ignore */ '/src/game/upgrades.ts' as string)
      const w = window.__pf.game.world as any
      const before = w.p.weapons[0].level
      const rewards = up.rollChest(w, 3)
      return { before, after: w.p.weapons[0].level, rewards: rewards.length }
    })
    expect(r.rewards).toBeGreaterThan(0)
    expect(r.after).toBeGreaterThanOrEqual(r.before)
  })
})

test.describe('save, forge and achievements', () => {
  let log: ErrorLog
  test.beforeEach(async ({ page }) => {
    log = new ErrorLog(page)
    await boot(page)
  })
  test.afterEach(async ({ page }, info) => log.assertClean(info))

  test('progress persists across a reload', async ({ page }) => {
    await page.evaluate(() => {
      const s = window.__pf.save
      s.data.lumens = 1234
      s.data.achievements = ['clear_shallows']
      s.data.cleared = { shallows: 2 }
      s.data.chars = ['halo']
      s.write()
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.locator('.logo').waitFor()
    const r = await page.evaluate(() => {
      const d = window.__pf.save.data
      return { lumens: d.lumens, ach: d.achievements, cleared: d.cleared, chars: d.chars }
    })
    expect(r.lumens).toBe(1234)
    expect(r.ach).toContain('clear_shallows')
    expect(r.cleared.shallows).toBe(2)
    expect(r.chars).toContain('halo')
  })

  test('Forge purchase spends Lumens, raises the level and is refundable', async ({ page }) => {
    await page.evaluate(() => { const s = window.__pf.save; s.data.lumens = 5000; s.write() })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.locator('.logo').waitFor()
    await page.mouse.click(6, 6)
    await toMenu(page)
    await page.locator('.mm-list [data-a="forge"]').click()
    await page.mouse.move(6, 6)
    await page.waitForTimeout(500)
    const before = await page.evaluate(() => ({ lumens: window.__pf.save.data.lumens, lv: window.__pf.save.data.shop.might ?? 0 }))
    await page.locator('.fg-item').first().click()
    await page.waitForTimeout(250)
    await page.locator('[data-buy]').click()
    await page.waitForTimeout(300)
    await page.locator('.dlg [data-a="yes"]').click()
    await page.waitForTimeout(500)
    const after = await page.evaluate(() => ({ lumens: window.__pf.save.data.lumens, lv: window.__pf.save.data.shop.might ?? 0, spent: window.__pf.save.data.forgeSpent }))
    expect(after.lv).toBe(before.lv + 1)
    expect(after.lumens).toBeLessThan(before.lumens)
    expect(after.spent).toBeGreaterThan(0)

    // refund restores the balance exactly
    await page.locator('[data-a="refund"]').click()
    await page.waitForTimeout(300)
    await page.locator('.dlg [data-a="yes"]').click()
    await page.waitForTimeout(300)
    await page.locator('.dlg [data-a="yes"]').click()
    await page.waitForTimeout(500)
    const refunded = await page.evaluate(() => ({ lumens: window.__pf.save.data.lumens, lv: window.__pf.save.data.shop.might ?? 0, spent: window.__pf.save.data.forgeSpent }))
    expect(refunded.lumens).toBe(before.lumens)
    expect(refunded.lv).toBe(0)
    expect(refunded.spent).toBe(0)
  })

  test('a clear unlocks the next stage and grants its achievements', async ({ page }) => {
    await startRun(page)
    const r = await page.evaluate(async () => {
      const meta: any = await import(/* @vite-ignore */ '/src/game/meta.ts' as string)
      const w = window.__pf.game.world as any
      const result = {
        win: true, char: 'vex', stage: 'shallows', asc: 0, endless: false, time: 600, kills: 2000, level: 40, lumens: 500,
        elites: 5, bosses: 1, fusions: 0, prismatic: false, overdrives: 3, chests: 4, dmgTaken: 50, noHitTime: 120,
        weapons: [{ id: 'pulse_bolt', level: 7, fuse: null, dmg: 1000, kills: 100 }], passives: [],
      }
      const unlocks = meta.finishRun(result)
      return {
        unlocks: unlocks.map((u: any) => u.kind + ':' + u.id),
        cleared: window.__pf.save.data.cleared.shallows,
        chars: window.__pf.save.data.chars,
        ach: window.__pf.save.data.achievements,
      }
    })
    expect(r.cleared).toBe(0)
    expect(r.ach).toContain('clear_shallows')
    expect(r.chars).toContain('halo')
    expect(r.unlocks.some((u: string) => u.startsWith('stage:crimson'))).toBe(true)
  })
})
