import { renderer as R, Shape } from '../../core/gl'
import { l } from '../../core/i18n'
import { clamp, rand, TAU } from '../../core/math'
import { COLOR } from '../../game/types'
import type { Shot, WeaponDef, WeaponInst, WeaponLevel } from '../../game/types'
import type { World } from '../../game/world'

// per-level tables (index = level-1)
const DMG = [18, 18, 24, 24, 30, 30, 40]
const CD = [0.85, 0.85, 0.85, 0.7, 0.7, 0.7, 0.6]
const AREA = [1, 1, 1, 1.12, 1.12, 1.25, 1.4]
const AMT = [1, 1, 1, 2, 2, 2, 3] // slashes per swing (fanned)
const PIERCE = [Infinity, Infinity, Infinity, Infinity, Infinity, Infinity, Infinity]

const RANGE = 95 // slash reach at area 1
const HALFW = 44 // crescent thickness at area 1
const SWEEP = 0.42 // seconds for the blade to travel one side to the other
const W = COLOR.W

interface Swing {
  side: number // -1 / +1 — alternates so the arc scythes from opposite flanks
}

/** drawn as a bright crescent whose leading edge tracks the sweep progress */
function drawArc(s: Shot, w: World) {
  const s0 = s.data as { range: number; hw: number; side: number }
  const k = 1 - s.life / s.maxLife // 0 → 1 across the slash
  const lead = s.rot // current sweep angle (updated in sweep)
  const trail = 0.9 // angular width of the burned-in wake
  const seg = 14
  for (let i = 0; i < seg; i++) {
    const a = lead - (i / seg) * trail * s0.side
    const fade = 1 - i / seg
    const outer = s0.range * (0.7 + 0.3 * fade)
    const inner = outer * 0.42
    const x = s.x + Math.cos(a) * (outer + inner) * 0.5, y = s.y + Math.sin(a) * (outer + inner) * 0.5
    R.draw(Shape.Capsule, x, y, (outer - inner) * 0.5, s0.hw * (0.25 + 0.75 * fade) * (0.5 + 0.5 * k), a, s.color, fade * (0.9 - 0.3 * k), 1.2)
  }
  // white-hot cutting edge
  const ex = s.x + Math.cos(lead) * s0.range * 0.78, ey = s.y + Math.sin(lead) * s0.range * 0.78
  R.draw(Shape.Capsule, ex, ey, s0.range * 0.2, s0.hw * 0.35, lead + Math.PI / 2, W, 0.9, 1.4)
  R.draw(Shape.Glow, ex, ey, s0.range * 0.5, s0.range * 0.5, 0, s.color, 0.5)
}

/** the crescent sweeps: damages everything it crosses, once per enemy */
function sweep(s: Shot, w: World, dt: number) {
  const wi = s.src!
  if (!w.p.weapons.includes(wi)) return void (s.dead = true)
  const s0 = s.data as { range: number; hw: number; side: number; dmg: number; base: number }
  const prog = clamp((s.maxLife - s.life) / SWEEP, 0, 1)
  s.rot = s0.base + (prog - 0.5) * 2.2 * s0.side // scythe through the aim line
  const lead = s.rot
  const c = Math.cos(lead), sn = Math.sin(lead), x = s.x, y = s.y
  const ex = x + c * s0.range * 0.8, ey = y + sn * s0.range * 0.8
  w.inLine(x, y, ex, ey, s0.hw, (e) => {
    if (!w.canHit(s, e)) return
    w.damage(e, s0.dmg, wi, { kb: 150, dirx: c, diry: sn })
    w.burst(e.x, e.y, { n: 4, color: s.color, speed: 240, life: 0.25, size: 2, stretch: 0.03 })
    w.part({ x: e.x, y: e.y, life: 0.16, size: e.r * 1.4, size1: 0, color: W, alpha: 0.75, shape: Shape.Glow })
    w.sfx('slash', { vol: 0.4, pitch: rand(1, 1.25), x: e.x }, 0.04)
  })
}

export default {
  id: 'flame_arc',
  hue: 'R',
  name: l('Flame Arc', '烈焰弧斩'),
  desc: l('A blazing crescent scythes out in your aim, alternating sides with every swing.', '灼热的弧刃沿瞄准方向横扫，每一击都换边挥出。'),
  icon: '<path d="M54 10C30 14 10 30 10 48c14-4 22-12 28-22 4 12 14 18 22 18C56 30 58 18 54 10z" fill="currentColor"/><path d="M18 54c10-2 18-8 24-16" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" opacity="0.6"/>',
  levels: [
    l('+6 damage', '伤害 +6'),
    l('+12% arc size', '弧斩尺寸 +12%'),
    l('+1 slash per swing', '每次挥砍 +1 道弧'),
    l('+6 damage, -0.15s cooldown', '伤害 +6，冷却 -0.15 秒'),
    l('+13% arc size', '弧斩尺寸 +13%'),
    l('+10 damage, +1 slash, -0.1s cooldown', '伤害 +10，弧斩 +1，冷却 -0.1 秒'),
  ],
  stats: (lv) => ({ dmg: DMG[lv - 1], cd: CD[lv - 1], area: AREA[lv - 1], speed: 0, amount: AMT[lv - 1], duration: SWEEP, pierce: PIERCE[lv - 1] }),
  fire(wi, w, s) {
    const p = w.p, st = wi.state as Swing, base = Math.atan2(p.aim.y, p.aim.x)
    st.side = -(st.side ?? 1) // flip every swing
    const col = w.color(wi)
    const fan = Math.min(0.5, 0.9 / s.amount)
    for (let i = 0; i < s.amount; i++) {
      const off = (i - (s.amount - 1) / 2) * fan
      w.shot({
        x: p.x, y: p.y, rot: base + off, r: RANGE * s.area * 0.8, life: SWEEP, pierce: Infinity, noCollide: true,
        color: col, data: { range: RANGE * s.area, hw: HALFW * s.area * 0.5, side: st.side, dmg: s.dmg, base: base + off }, update: sweep, draw: drawArc,
      }, wi)
    }
    w.part({ x: p.x, y: p.y, life: 0.12, size: 24 * s.area, size1: 4, color: col, alpha: 0.6, shape: Shape.Glow })
    for (let i = 0; i < 5; i++) {
      const a = base + rand(-0.6, 0.6), v = rand(200, 420)
      w.part({ x: p.x + p.aim.x * 14, y: p.y + p.aim.y * 14, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.15, 0.28), size: 2, size1: 0, color: i ? col : W, glow: 1, drag: 6, stretch: 0.03 })
    }
    w.sfx('slash', { vol: 0.5, pitch: rand(0.9, 1.05) }, 0.05)
    if (wi.fuse) w.flash(COLOR[wi.fuse], 0.04)
  },
} satisfies WeaponDef
