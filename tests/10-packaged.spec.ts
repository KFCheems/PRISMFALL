import { test, expect, chromium } from '@playwright/test'
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, statSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

/**
 * Packaged build smoke test.
 *
 * The rest of the suite exercises the Vite dev server, which proves the game logic but not the shipped
 * artifact. This test launches the real Electron binary from `release/` with a remote-debugging port and
 * attaches Playwright over CDP — the same way you would debug a user's install.
 *
 * Skipped when no build is present so a fresh checkout still runs green; `npm run dist` produces one.
 */
const ROOT = resolve(process.cwd())
const EXE = join(ROOT, 'release', 'PRISMFALL-1.0.0-portable.exe')
const HAS_BUILD = existsSync(EXE)
const PORT = 9400 + (process.pid % 400)

test.describe('packaged build', () => {
  test.skip(!HAS_BUILD, 'no packaged build in release/ — run `npm run dist` first')

  test('the portable exe is a real PE bundle', () => {
    const st = statSync(EXE)
    expect(st.size, 'portable exe should be a real bundle, not a stub').toBeGreaterThan(40 * 1024 * 1024)
    expect(readFileSync(EXE).subarray(0, 2).toString('latin1'), 'PE magic').toBe('MZ')
  })

  test('the packaged app boots, renders the title and runs the game loop', async () => {
    // ELECTRON_RUN_AS_NODE leaks in from some shells and makes Electron behave like plain Node
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE

    const child = spawn(EXE, ['--remote-debugging-port=' + PORT], { env, stdio: 'ignore' })

    let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined
    try {
      // wait for the CDP endpoint
      let up = false
      for (let i = 0; i < 80; i++) {
        await sleep(500)
        try {
          const res = await fetch(`http://127.0.0.1:${PORT}/json/version`)
          if (res.ok) {
            up = true
            break
          }
        } catch {
          /* not listening yet */
        }
      }
      expect(up, 'the packaged app should expose a devtools endpoint').toBe(true)

      browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`)
      const ctx = browser.contexts()[0]
      expect(ctx, 'packaged app should have a browser context').toBeTruthy()
      let page = ctx.pages()[0]
      if (!page) page = await ctx.waitForEvent('page', { timeout: 20000 })

      await page.waitForSelector('.logo', { timeout: 30000 })
      expect(await page.title()).toMatch(/prismfall/i)
      const dims = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }))
      expect(dims.w).toBeGreaterThan(300)

      // the game handle is exposed only once the app shell has fully initialised
      await page.waitForFunction(() => !!(window as any).__pf?.game, null, { timeout: 20000 })
      const state = await page.evaluate(() => {
        const p = window as any
        return {
          screens: !!p.__pf.ui,
          audio: !!p.__pf.audio,
          renderer: !!p.__pf.renderer,
          hasCanvas: !!document.querySelector('canvas'),
        }
      })
      expect(state.hasCanvas, 'the packaged build must create its WebGL canvas').toBe(true)
      expect(state.screens).toBe(true)
      expect(state.renderer).toBe(true)
      expect(state.audio).toBe(true)

      // advance past the title: click once to unlock audio, then any key advances the title screen
      await page.mouse.click(4, 4)
      await page.waitForTimeout(300)
      for (let i = 0; i < 6; i++) {
        await page.keyboard.press('Enter')
        await page.waitForTimeout(400)
        if (await page.locator('.mm-list').count()) break
      }
      await page.waitForSelector('.mm-list', { timeout: 15000 })
      const entries = await page.locator('.mm-list [data-a]').count()
      expect(entries, 'packaged menu should list its entries').toBeGreaterThanOrEqual(6)
    } finally {
      // kill the whole tree first: the portable launcher spawns the real Electron child
      try {
        execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
      } catch {
        /* already gone */
      }
      await browser?.close().catch(() => {})
      await sleep(500)
    }
  })
})
