import { test, expect, type Page } from '@playwright/test'
import { boot, toMenu, ErrorLog } from './helpers'

/**
 * Gamepad support, tested at the input layer.
 *
 * Playwright cannot press a physical pad, and driving the whole menu chain through a synthetic pad proved
 * unreliable (the game polls `getGamepads()` once per frame, so edges depend on frame timing). This file
 * therefore tests what actually matters: that `input` maps the standard gamepad layout to the game's
 * actions, and that those actions are wired end to end.
 */
const PAD_SNIPPET = () => {
  const w = window as any
  w.__pad = { buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0] }
  const make = () => ({
    id: 'virtual pad',
    index: 0,
    connected: true,
    mapping: 'standard' as GamepadMappingType,
    timestamp: performance.now(),
    buttons: w.__pad.buttons.map((b: any) => ({ pressed: b.pressed, touched: b.pressed, value: b.value })),
    axes: w.__pad.axes.slice(),
    vibrationActuator: { playEffect: async () => 'complete', reset: async () => 'complete' },
  })
  navigator.getGamepads = () => [make(), null, null, null] as unknown as Gamepad[]
  w.__press = (i: number, down: boolean) => {
    w.__pad.buttons[i].pressed = down
    w.__pad.buttons[i].value = down ? 1 : 0
  }
  w.__stick = (x: number, y: number) => {
    w.__pad.axes[0] = x
    w.__pad.axes[1] = y
  }
  w.__rightStick = (x: number, y: number) => {
    w.__pad.axes[2] = x
    w.__pad.axes[3] = y
  }
}

/** Press a pad button and wait for the game to observe the edge. */
async function padPress(page: Page, index: number, ms = 200) {
  await page.evaluate((i) => (window as any).__press(i, true), index)
  await page.waitForTimeout(ms)
  await page.evaluate((i) => (window as any).__press(i, false), index)
  await page.waitForTimeout(200)
}

test.describe('gamepad', () => {
  let log: ErrorLog
  test.beforeEach(async ({ page }) => {
    log = new ErrorLog(page)
    await boot(page)
    await page.evaluate(PAD_SNIPPET)
    await page.waitForTimeout(500)
  })
  test.afterEach(async ({ page }, info) => log.assertClean(info))

  test('the pad is detected and the UI switches to gamepad prompts', async ({ page }) => {
    await padPress(page, 13) // dpad down
    const isPad = await page.evaluate(() => document.body.classList.contains('pad'))
    expect(isPad, 'body.pad should be set once the gamepad is used').toBe(true)
  })

  test('the standard layout maps to the documented actions', async ({ page }) => {
    // 0 A -> confirm/dash, 1 B -> back, 3 Y -> overdrive, 4 LB / 5 RB -> tabs/dash, 9 Start -> pause
    const map = await page.evaluate(async () => {
      const inp = (window as any).__pf.input
      const out: Record<string, string[]> = {}
      const actions = ['confirm', 'back', 'pause', 'dash', 'overdrive', 'reroll', 'banish', 'skip', 'tabL', 'tabR']
      const w = window as any
      for (let b = 0; b < 16; b++) {
        w.__pad.buttons.forEach((x: any, i: number) => { x.pressed = i === b; x.value = i === b ? 1 : 0 })
        inp.update(1 / 60)
        // emulate a fresh press: previous frame had nothing down
        w.__pad.buttons.forEach((x: any, i: number) => { if (i !== b) x.pressed = false })
        const hit = actions.filter((a) => {
          w.__pad.buttons.forEach((x: any, i: number) => { x.pressed = i === b; x.value = i === b ? 1 : 0 })
          inp.padPrev = Array.from({ length: 17 }, () => false)
          const r = inp.pressed(a)
          w.__pad.buttons.forEach((x: any) => { x.pressed = false; x.value = 0 })
          return r
        })
        if (hit.length) out['b' + b] = hit
      }
      return out
    })
    expect(map['b0'], 'A').toContain('confirm')
    expect(map['b0'], 'A').toContain('dash')
    expect(map['b1'], 'B').toContain('back')
    expect(map['b3'], 'Y').toContain('overdrive')
    expect(map['b0'], 'A on the pad does not fall through to overdrive').not.toContain('overdrive')
    expect(map['b9'], 'Start').toContain('pause')
  })

  test('A advances past the title screen and opens the menu', async ({ page }) => {
    await padPress(page, 0)
    await expect(page.locator('.mm-list')).toBeVisible({ timeout: 10000 })
  })

  test('the d-pad moves the menu focus', async ({ page }) => {
    // enter the menu with the keyboard so the A press below is a clean single edge on the menu itself
    await toMenu(page)
    const focused = () => page.evaluate(() => (window.__pf.ui.focus as HTMLElement | null)?.dataset?.a ?? null)
    await expect.poll(focused, { timeout: 5000 }).toBe('play')
    await padPress(page, 13)
    await expect.poll(focused, { timeout: 5000 }).toBe('forge')
    await padPress(page, 12)
    await expect.poll(focused, { timeout: 5000 }).toBe('play')
  })

  test('a focused stage card starts the run on confirm, so a pad player can play', async ({ page }) => {
    await page.evaluate(() => {
      const d = window.__pf.save.data
      d.cleared = { shallows: 10 }
      window.__pf.save.write()
    })
    await toMenu(page)
    // reach the stage screen through the real UI, then confirm with the pad
    await page.locator('.mm-list [data-a="play"]').click()
    await page.mouse.move(4, 4)
    await page.waitForTimeout(400)
    await page.locator('[data-cta]').click()
    await page.mouse.move(4, 4)
    await expect(page.locator('.ss-cards')).toBeVisible({ timeout: 8000 })
    await page.waitForTimeout(300)
    await padPress(page, 0) // A on the focused stage card
    await expect(page.locator('.hud')).toBeVisible({ timeout: 12000 })
  })

  test('a focused character tile selects on confirm', async ({ page }) => {
    await toMenu(page)
    await page.locator('.mm-list [data-a="play"]').click()
    await page.mouse.move(4, 4)
    await expect(page.locator('.cs-body')).toBeVisible({ timeout: 8000 })
    await page.waitForTimeout(300)
    await padPress(page, 0) // A on the focused tile
    await expect(page.locator('.ss-cards')).toBeVisible({ timeout: 10000 })
  })

  test('the left stick moves the player in a live run', async ({ page }) => {
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

    const before = await page.evaluate(() => window.__pf.game.world!.p.x)
    await page.evaluate(() => (window as any).__stick(1, 0))
    await page.waitForTimeout(900)
    await page.evaluate(() => (window as any).__stick(0, 0))
    await page.waitForTimeout(150)
    const after = await page.evaluate(() => window.__pf.game.world!.p.x)
    expect(after, 'left stick should drive the player right').toBeGreaterThan(before + 25)
  })

  test('the right stick aims in a live run', async ({ page }) => {
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
    await page.evaluate(() => (window as any).__rightStick(0, 1))
    await page.waitForTimeout(700)
    const aim = await page.evaluate(() => window.__pf.game.world!.p.aim)
    expect(aim.y, 'right stick should aim down').toBeGreaterThan(0.5)
  })

  test('RB dashes and Y fires the Prism Burst', async ({ page }) => {
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

    // hold RB and sample during the press: the dash edge only exists for the frame it is polled
    await page.evaluate(() => (window as any).__press(5, true))
    await page.waitForTimeout(80)
    const dash = await page.evaluate(() => {
      const p = window.__pf.game.world!.p
      return { iframes: p.iframes, dashT: p.dashT, cd: p.dashCd }
    })
    await page.evaluate(() => (window as any).__press(5, false))
    expect(dash.iframes, 'RB grants dash i-frames').toBeGreaterThan(0)
    expect(dash.dashT, 'RB starts a dash').toBeGreaterThan(0)

    await page.evaluate(() => {
      const p = window.__pf.game.world!.p
      p.overdrive = 100
      p.odReady = true
    })
    const before = await page.evaluate(() => window.__pf.game.world!.overdrives)
    await page.evaluate(() => (window as any).__press(3, true))
    await page.waitForTimeout(80)
    await page.evaluate(() => (window as any).__press(3, false))
    const after = await page.evaluate(() => window.__pf.game.world!.overdrives)
    expect(after, 'Y fires the Prism Burst').toBe(before + 1)
  })
})
