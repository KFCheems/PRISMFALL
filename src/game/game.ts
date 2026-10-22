import { renderer as R, Shape } from '../core/gl'
import { audio } from '../core/audio'
import { input } from '../core/input'
import { save } from '../core/save'
import { loc } from '../core/i18n'
import { rand, TAU, type RGB } from '../core/math'
import { World, type RunOpts } from './world'
import { checkAchievements, finishRun } from './meta'
import { STAGES } from './registry'
import { COLOR } from './types'
import { ui } from '../ui/ui'
import { Hud } from '../ui/hud'
import { LevelUpScreen } from '../ui/screens/levelup'
import { ChestScreen } from '../ui/screens/chest'
import { PauseScreen } from '../ui/screens/pause'
import { ResultsScreen } from '../ui/screens/results'

interface Mote {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  rot: number
  spin: number
  shape: number
  c: RGB
}

/** Top-level game controller: owns the active run and the menu backdrop. */
class Game {
  world: World | null = null
  last: RunOpts | null = null
  hud: Hud | null = null
  private motes: Mote[] = []
  private menuT = 0
  private fps = 60

  start(opts: RunOpts) {
    this.end()
    this.last = opts
    const w: World = new World(opts, {
      levelUp: () => ui.push(new LevelUpScreen(w)),
      chest: (rewards) => ui.push(new ChestScreen(w, rewards)),
      end: (r) => {
        const unlocks = finishRun(r)
        audio.music(r.win ? 'victory' : 'defeat')
        ui.push(new ResultsScreen(r, unlocks))
      },
      banner: (t, s, c) => ui.banner(t, s, c),
      boss: (e) => this.hud?.setBoss(e),
    })
    w.onAchCheck = (x) => checkAchievements({ w: x })
    this.world = w
    this.hud = new Hud(w)
    ui.reset()
    ui.banner(loc(opts.stage.name), loc(opts.stage.desc), opts.stage.palette.grid)
    audio.music(opts.stage.music)
    audio.muffle(false)
  }

  /** tear down the current run (if any) */
  end() {
    this.hud?.destroy()
    this.hud = null
    this.world = null
  }

  restart() {
    if (this.last) this.start(this.last)
  }

  pause() {
    // `ui.blocking` only becomes true once the pause screen is marked modal, so two Escape presses in the
    // same opening window used to push two PauseScreens. Check for an existing one explicitly.
    if (!this.world) return
    if (ui.stack.some((s) => s instanceof PauseScreen)) return
    ui.push(new PauseScreen(this.world))
  }

  frame(dt: number) {
    this.fps += (1 / Math.max(dt, 1e-3) - this.fps) * 0.05
    ui.update(dt)
    const w = this.world
    audio.muffle(!!w && ui.blocking)
    if (w) {
      if (!ui.blocking && input.pressed('pause')) this.pause()
      if (!ui.blocking && !w.modal) {
        const steps = dt > 1 / 40 ? 2 : 1
        for (let i = 0; i < steps; i++) w.update(dt / steps)
      }
      R.begin(ui.blocking ? 0 : dt)
      w.render()
      R.end()
      const c = R.overlay()
      w.overlay(c)
      this.hud?.update(dt)
    } else {
      R.begin(dt)
      this.menuScene(dt)
      R.end()
      R.overlay()
    }
    if (save.data.settings.showFps) {
      const c = R.ctx
      c.fillStyle = '#7f8'
      c.font = '12px monospace'
      c.textAlign = 'left'
      c.fillText(`${Math.round(this.fps)} fps  ${w ? `e${w.enemies.length} s${w.shots.length} b${w.bullets.length} p${w.parts.length}` : ''}`, 8, R.cssH - 8)
    }
  }

  /** drifting neon shapes behind the menus */
  private menuScene(dt: number) {
    this.menuT += dt
    const st = STAGES[0]
    if (st) {
      R.bg.c0 = st.palette.c0
      R.bg.c1 = st.palette.c1
      R.bg.c2 = st.palette.c2
      R.bg.grid = st.palette.grid
      R.bg.style = st.bgStyle
      R.bg.gridA = st.gridA * 0.7
    }
    R.cam.x = Math.sin(this.menuT * 0.05) * 300 + this.menuT * 12
    R.cam.y = Math.cos(this.menuT * 0.04) * 200
    R.cam.ox = R.cam.oy = 0
    R.bg.focusX = R.cam.x
    R.bg.focusY = R.cam.y
    R.post.flash = [1, 1, 1, 0]
    R.post.tint = [0, 0, 0, 0]
    R.post.ca = 0
    R.bg.pulse = audio.beat()
    const B = R.bounds
    while (this.motes.length < 46) {
      const shapes = [Shape.Tri, Shape.Hex, Shape.Diamond, Shape.Box, Shape.Circle, Shape.Star]
      this.motes.push({
        x: rand(B.l - 200, B.r + 200), y: rand(B.t - 200, B.b + 200), vx: rand(-30, 30), vy: rand(-30, 30), r: rand(6, 26), rot: rand(0, TAU), spin: rand(-1, 1),
        shape: shapes[Math.floor(Math.random() * shapes.length)], c: [COLOR.R, COLOR.G, COLOR.B, COLOR.Y, COLOR.C, COLOR.M][Math.floor(Math.random() * 6)],
      })
    }
    for (const m of this.motes) {
      m.x += m.vx * dt
      m.y += m.vy * dt
      m.rot += m.spin * dt
      if (m.x < B.l - 300 || m.x > B.r + 300 || m.y < B.t - 300 || m.y > B.b + 300) {
        m.x = rand(B.l, B.r)
        m.y = Math.random() < 0.5 ? B.t - 100 : B.b + 100
      }
      R.draw(m.shape, m.x, m.y, m.r, m.r, m.rot, [m.c[0] * 0.15, m.c[1] * 0.15, m.c[2] * 0.15], 0.9, 0, 0, 0)
      R.draw(m.shape, m.x, m.y, m.r, m.r, m.rot, m.c, 0.75, 0.9, 2)
    }
  }
}

export const game = new Game()
