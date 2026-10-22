/**
 * Balance harness: plays each stage with a simple but honest bot (kite away from the nearest threat,
 * sweep back for XP pickups, dash on cooldown) and reports how long a competent player survives, plus
 * the enemy/kill/level curve. Run with: npx playwright test tests/tools/balance.spec.ts
 */
import { test } from '@playwright/test'
import { boot, toMenu } from '../helpers'

const STAGES = ['shallows', 'crimson', 'verdant', 'singularity']

test('balance report', async ({ page }) => {
  test.setTimeout(600_000)
  await boot(page)
  const rows: any[] = []
  for (const stageId of STAGES) {
    await page.evaluate(
      ({ stageId }) => {
        const s = window.__pf.save
        s.data.cleared = { shallows: 10, crimson: 10, verdant: 10, singularity: 10 }
        const ui = (s.data as any).ui ?? ((s.data as any).ui = {})
        delete ui.stage
        s.write()
      },
      { stageId },
    )
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.locator('.logo').waitFor({ timeout: 15000 })
    await page.mouse.click(4, 4)
    await page.waitForTimeout(200)
    await toMenu(page)
    await page.locator('.mm-list [data-a="play"]').click()
    await page.mouse.move(4, 4)
    await page.waitForTimeout(300)
    await page.locator('[data-cta]').click()
    await page.mouse.move(4, 4)
    await page.waitForTimeout(400)
    await page.locator(`.sc[data-id="${stageId}"]`).click()
    await page.mouse.move(4, 4)
    await page.waitForTimeout(250)
    await page.locator('[data-a="start"]').click()
    await page.waitForTimeout(700)

    const r = await page.evaluate(async () => {
      const up: any = await import(/* @vite-ignore */ '/src/game/upgrades.ts' as string)
      const w = window.__pf.game.world as any
      const curve: any[] = []
      const startHp = w.p.hp
      let minHp = startHp
      let deathAt: number | null = null
      let cards = 0
      // bot: kite the nearest threat, lunge toward loose XP when it is safe, and take every upgrade
      for (let i = 0; i < 60 * 660; i++) {
        const p = w.p
        // spend any pending level-ups the way a player would: pick the first card each time
        while (p.pending > 0) {
          const choices = up.rollChoices(w, p.stats.choices)
          const pick = choices.find((c: any) => c.kind === 'fusion') ?? choices[0]
          if (!pick) { p.pending = 0; break }
          up.applyChoice(w, pick)
          p.pending--
          cards++
        }
        w.modal = false
        const probe = w.viewR * 0.6
        // Danger-aware steering: sum repulsion from every nearby enemy (weighted by proximity and speed),
        // then bias toward open space. This is roughly how a competent player reads a bullet-heaven screen.
        let mx = 0, my = 0
        w.inRadius(p.x, p.y, 340, (e: any) => {
          const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1
          const wgt = (1 - Math.min(1, d / 340)) ** 2 * (1 + (e.speed ?? 0) / 200)
          mx += (dx / d) * wgt
          my += (dy / d) * wgt
        })
        // drift toward loose XP when nothing is close
        if (!w.nearest(p.x, p.y, 170) && w.pickups.length) {
          let sx = 0, sy = 0, n = 0
          for (const pk of w.pickups) { sx += pk.x; sy += pk.y; n++ }
          const dx = sx / n - p.x, dy = sy / n - p.y, l = Math.hypot(dx, dy) || 1
          mx += (dx / l) * 0.7
          my += (dy / l) * 0.7
        }
        const ml = Math.hypot(mx, my)
        if (ml > 0.01) {
          p.vx = (mx / ml) * p.stats.moveSpeed
          p.vy = (my / ml) * p.stats.moveSpeed
          p.x += p.vx / 60
          p.y += p.vy / 60
        }
        w.update(1 / 60)
        minHp = Math.min(minHp, p.hp)
        if (i % (60 * 30) === 0) curve.push({ t: Math.round(w.time), hp: Math.round(p.hp), e: w.enemies.length, lv: p.level, k: w.kills })
        if (p.dead) { deathAt = Math.round(w.time); break }
      }
      return { stage: w.opts.stage.id, deathAt, minHp: Math.round(minHp), level: w.p.level, kills: w.kills, cards, weapons: w.p.weapons.map((x: any) => x.def.id + '@' + x.level + (x.fuse ?? '')), curve }
    })
    rows.push(r)
    console.log(`BALANCE ${JSON.stringify(r)}`)
  }
  console.log('SUMMARY ' + JSON.stringify(rows.map((r) => ({ stage: r.stage, deathAt: r.deathAt, level: r.level, kills: r.kills }))))
})
