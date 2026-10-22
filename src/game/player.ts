import { input } from '../core/input'
import { save } from '../core/save'
import { renderer as R, Shape } from '../core/gl'
import { clamp, damp, rand, TAU, scale } from '../core/math'
import { BASE_STATS, COLOR } from './types'
import type { CharacterDef, Hue, PassiveInst, Stats, WeaponInst } from './types'
import { SHOP } from './registry'
import type { World } from './world'

export const xpForLevel = (lv: number) => Math.round(5 + lv * 7 + Math.max(0, lv - 15) * 4 + Math.max(0, lv - 35) * 8)

const DASH_SPEED = 1100
const DASH_TIME = 0.15

export class Player {
  x = 0
  y = 0
  vx = 0
  vy = 0
  r = 12
  hp = 100
  stats: Stats = BASE_STATS()
  level = 1
  xp = 0
  xpNext = xpForLevel(1)
  pending = 0
  weapons: WeaponInst[] = []
  passives: PassiveInst[] = []
  dashCd = 0
  dashT = 0
  dx = 1
  dy = 0
  iframes = 0
  face = { x: 1, y: 0 }
  aim = { x: 1, y: 0 }
  overdrive = 0
  odReady = false
  rerolls = 0
  banishes = 0
  skips = 0
  revivals = 0
  banished = new Set<string>()
  dead = false
  moving = false
  greenPulse = 0
  private trail = 0

  constructor(readonly char: CharacterDef) {}

  /** item count per primary hue — fused weapons count for both of their hues */
  resonance(): Record<Hue, number> {
    const n: Record<Hue, number> = { R: 0, G: 0, B: 0 }
    for (const wi of this.weapons) {
      n[wi.def.hue]++
      if (wi.fuse) for (const h of ({ Y: ['R', 'G'], C: ['G', 'B'], M: ['R', 'B'] } as const)[wi.fuse]) if (h !== wi.def.hue) n[h]++
    }
    for (const pi of this.passives) n[pi.def.hue]++
    return n
  }

  get prismatic() {
    const f = new Set(this.weapons.map((w) => w.fuse).filter(Boolean))
    return f.size === 3
  }

  recalc() {
    const s = BASE_STATS()
    this.char.mods(s, this.level)
    for (const d of SHOP) {
      const lv = save.data.shop[d.id] ?? 0
      if (lv) d.apply(s, lv)
    }
    for (const p of this.passives) p.def.apply(s, p.level)
    const res = this.resonance()
    if (res.R >= 3) s.might *= 1.15
    if (res.G >= 3) {
      s.regen += 1
      s.area *= 1.1
    }
    if (res.B >= 3) {
      s.cooldown *= 0.9
      s.projSpeed *= 1.15
    }
    if (res.B >= 6) s.amount += 1
    if (this.prismatic) s.might *= 1.2
    const grow = s.maxHp - this.stats.maxHp
    if (grow > 0) this.hp += grow
    this.stats = s
    this.hp = Math.min(this.hp, s.maxHp)
  }

  update(w: World, dt: number) {
    const s = this.stats
    const mv = input.move()
    this.moving = !!(mv.x || mv.y)
    if (this.moving) {
      const l = Math.hypot(mv.x, mv.y)
      this.face = { x: mv.x / l, y: mv.y / l }
    }
    if (this.dashT > 0) {
      this.dashT -= dt
      this.vx = this.dx * DASH_SPEED
      this.vy = this.dy * DASH_SPEED
      w.part({ x: this.x, y: this.y, life: 0.25, size: this.r * 1.1, size1: this.r * 0.4, color: this.char.color, alpha: 0.5, shape: this.char.shape, rot: Math.atan2(this.dy, this.dx), glow: 0.6 })
    } else {
      this.vx = damp(this.vx, mv.x * s.moveSpeed, 16, dt)
      this.vy = damp(this.vy, mv.y * s.moveSpeed, 16, dt)
      if (input.pressed('dash') && this.dashCd <= 0) {
        this.dashT = DASH_TIME
        this.dx = this.face.x
        this.dy = this.face.y
        this.iframes = Math.max(this.iframes, DASH_TIME + 0.15)
        this.dashCd = s.dashCd
        w.sfx('dash')
        w.burst(this.x, this.y, { n: 10, color: this.char.color, speed: 220, life: 0.35, size: 3 })
      }
    }
    this.x += this.vx * dt
    this.y += this.vy * dt
    if (w.arena) {
      const a = w.arena, dx = this.x - a.x, dy = this.y - a.y, d = Math.hypot(dx, dy), max = a.r - this.r
      if (d > max) {
        this.x = a.x + (dx / d) * max
        this.y = a.y + (dy / d) * max
      }
    }
    this.dashCd -= dt
    this.iframes -= dt
    if (s.regen > 0 && this.hp < s.maxHp) this.hp = Math.min(s.maxHp, this.hp + s.regen * dt)

    // aim: right stick > manual mouse > nearest enemy > facing
    const st = input.stickAim()
    if (st) this.aim = st
    else if (save.data.settings.aim === 'manual' && input.lastDevice === 'kb') {
      const [mx, my] = R.toWorld(input.mouse.x, input.mouse.y)
      const l = Math.hypot(mx - this.x, my - this.y) || 1
      this.aim = { x: (mx - this.x) / l, y: (my - this.y) / l }
    } else {
      const e = w.nearest(this.x, this.y, 650)
      if (e) {
        const l = Math.hypot(e.x - this.x, e.y - this.y) || 1
        this.aim = { x: (e.x - this.x) / l, y: (e.y - this.y) / l }
      } else this.aim = this.face
    }

    // overdrive
    if (this.overdrive >= 100 && !this.odReady) {
      this.odReady = true
      w.sfx('overdriveReady')
    }
    if (this.odReady && input.pressed('overdrive')) w.overdrive()

    // green resonance 6: healing pulse
    if (this.resonance().G >= 6) {
      this.greenPulse += dt
      if (this.greenPulse > 12) {
        this.greenPulse = 0
        w.heal(s.maxHp * 0.08)
        w.inRadius(this.x, this.y, 260 * s.area, (e) => void w.damage(e, 30 * s.might, null, { kb: 200, dirx: e.x - this.x, diry: e.y - this.y }))
        w.ringFx(this.x, this.y, 260 * s.area, COLOR.G)
        w.sfx('heal')
      }
    }

    this.trail += dt * (this.moving ? 30 : 6)
    while (this.trail > 1) {
      this.trail--
      w.part({ x: this.x + rand(-4, 4), y: this.y + rand(-4, 4), vx: -this.vx * 0.2 + rand(-20, 20), vy: -this.vy * 0.2 + rand(-20, 20), life: rand(0.25, 0.5), size: rand(1.5, 3), color: this.char.color, glow: 0.8 })
    }
  }

  draw(w: World) {
    const t = w.time
    if (this.iframes > 0 && this.dashT <= 0 && Math.floor(t * 20) % 2 === 0) return
    const c = this.char.color
    const pulse = 1 + Math.sin(t * 6) * 0.05
    const rot = Math.atan2(this.face.y, this.face.x)
    R.draw(Shape.Glow, this.x, this.y, 70, 70, 0, c, 0.22)
    R.draw(this.char.shape, this.x, this.y, this.r * pulse, this.r * pulse, rot, scale(c, 0.25), 1, 0, 0, 0)
    R.draw(this.char.shape, this.x, this.y, this.r * pulse, this.r * pulse, rot, c, 1, 1.2, 2.5)
    R.draw(this.char.shape, this.x, this.y, this.r * 0.45, this.r * 0.45, rot, [1, 1, 1], 1, 0.8)
    // aim reticle
    const ax = this.x + this.aim.x * 30, ay = this.y + this.aim.y * 30
    R.draw(Shape.Tri, ax, ay, 4.5, 4.5, Math.atan2(this.aim.y, this.aim.x), c, 0.85, 0.8)
    // dash readiness ring
    const k = clamp(1 - this.dashCd / this.stats.dashCd, 0, 1)
    if (k < 1) R.draw(Shape.Arc, this.x, this.y, this.r + 9, 1.4, -Math.PI / 2, c, 0.55, 0.3, Math.PI * k)
    // overdrive aura
    if (this.odReady) {
      for (let i = 0; i < 3; i++) {
        const a = t * 2 + (i * TAU) / 3
        R.draw(Shape.Diamond, this.x + Math.cos(a) * 24, this.y + Math.sin(a) * 24, 3, 5, a, [COLOR.R, COLOR.G, COLOR.B][i], 1, 1.2)
      }
    }
    // hp bar under player when hurt
    if (this.hp < this.stats.maxHp) {
      const f = clamp(this.hp / this.stats.maxHp, 0, 1), bw = 22
      R.draw(Shape.Box, this.x, this.y + this.r + 10, bw, 2.2, 0, [0.08, 0.02, 0.04], 0.85, 0, 0, 0)
      R.draw(Shape.Box, this.x - bw + bw * f, this.y + this.r + 10, bw * f, 2.2, 0, f > 0.3 ? COLOR.G : COLOR.R, 1, 0.6)
    }
  }
}
