import { test, expect } from '@playwright/test'
import { boot, toMenu } from './helpers'

/**
 * The render loop must survive its own mistakes.
 *
 * A real playthrough froze at stage time 05:15: the window stayed responsive, the last frame stayed on
 * screen, and the process sat at 0% CPU forever. The cause was the shape of the rAF loop —
 * `requestAnimationFrame(frame)` was the last statement, so any uncaught exception inside `game.frame()`
 * silently killed the loop with a picture still painted. These tests inject faults into a real run and
 * assert the game keeps ticking, and that a persistent fault becomes a recoverable card instead of a freeze.
 */
test.describe('frame-loop resilience', () => {
  /** Start a real run through the UI and wait for the HUD. */
  async function startRun(page: any) {
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
  }

  test('a single throwing frame does not stop the loop', async ({ page }) => {
    await boot(page)
    await startRun(page)

    // make one update throw, exactly like an unexpected null in a weapon tick
    await page.evaluate(() => {
      const w = window.__pf.game.world as any
      const real = w.update.bind(w)
      let thrown = false
      w.update = (dt: number) => {
        if (!thrown) {
          thrown = true
          throw new TypeError("Cannot read properties of null (reading 'life')")
        }
        return real(dt)
      }
    })

    const t0 = await page.evaluate(() => window.__pf.game.world!.time)
    await page.waitForTimeout(1500)
    const t1 = await page.evaluate(() => window.__pf.game.world!.time)
    expect(t1, 'game time must keep advancing after one bad frame').toBeGreaterThan(t0 + 0.5)
    // and the game is still playable, not stuck behind the fatal card
    expect(await page.locator('[role="alertdialog"]').count()).toBe(0)
  })

  test('a burst of throwing frames does not stop the loop', async ({ page }) => {
    await boot(page)
    await startRun(page)
    await page.evaluate(() => {
      const w = window.__pf.game.world as any
      const real = w.update.bind(w)
      let n = 0
      w.update = (dt: number) => {
        if (n++ < 10) throw new Error('transient fault ' + n)
        return real(dt)
      }
    })
    const t0 = await page.evaluate(() => window.__pf.game.world!.time)
    await page.waitForTimeout(2000)
    const t1 = await page.evaluate(() => window.__pf.game.world!.time)
    expect(t1, 'the loop must recover from a short burst of faults').toBeGreaterThan(t0 + 0.5)
    expect(await page.locator('[role="alertdialog"]').count()).toBe(0)
  })

  test('a persistent fault surfaces a recoverable card instead of freezing', async ({ page }) => {
    await boot(page)
    await startRun(page)
    await page.evaluate(() => {
      const w = window.__pf.game.world as any
      w.update = () => {
        throw new TypeError("Cannot read properties of null (reading 'life')")
      }
    })

    // the loop keeps calling it, so the fault counter reaches the threshold and the card appears
    const card = page.locator('[role="alertdialog"]')
    await expect(card).toBeVisible({ timeout: 15000 })
    await expect(card).toContainText(/RUN HALTED/i)
    await expect(card).toContainText(/Cannot read properties of null/i)

    // and it is genuinely recoverable: the button returns to the menu and the loop is alive again
    await card.getByRole('button', { name: /back to menu/i }).click()
    await expect(page.locator('.mm-list')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('[role="alertdialog"]')).toHaveCount(0)

    // the loop is running again, so the menu is interactive
    await page.locator('.mm-list [data-a="play"]').click()
    await expect(page.locator('.cs-body')).toBeVisible({ timeout: 8000 })
  })

  test('the loop keeps its cadence during a long run', async ({ page }) => {
    await boot(page)
    await startRun(page)
    // sample game time against wall time; a stalled loop shows as a flat line
    const samples = await page.evaluate(async () => {
      const w = window.__pf.game.world as any
      const out: { wall: number; t: number }[] = []
      const start = performance.now()
      for (let i = 0; i < 12; i++) {
        await new Promise((r) => setTimeout(r, 250))
        out.push({ wall: +((performance.now() - start) / 1000).toFixed(2), t: +w.time.toFixed(2) })
      }
      return out
    })
    const first = samples[0]
    const last = samples[samples.length - 1]
    const wall = last.wall - first.wall
    const game = last.t - first.t
    expect(game, 'game time must track wall time').toBeGreaterThan(wall * 0.5)
    // no sample may be stuck: every step must show progress
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i].t, `sample ${i} stalled at ${samples[i].t}s`).toBeGreaterThan(samples[i - 1].t)
    }
  })
})
