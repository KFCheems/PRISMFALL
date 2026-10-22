import { renderer as R, Shape } from '../../core/gl'
import { l } from '../../core/i18n'
import { damp, rand, TAU } from '../../core/math'
import type { Shot, WeaponDef, WeaponLevel } from '../../game/types'
import type { World } from '../../game/world'

// per-level tables (index = level-1)
const DMG = [7, 7, 11, 11, 16, 22, 30]
const CD = [0.6, 0.6, 0.6, 0.5, 0.5, 0.45, 0.4] // seconds between damage pulses
const AREA = [1, 1.2, 1.2, 1.2, 1.35, 1.35, 1.6]
const SLOW = [0.15, 0.15, 0.15, 0.25, 0.25, 0.25, 0.35]

const RADIUS = 70 // field radius at area 1
const LINGER = 0.7 // seconds the slow outlasts a pulse (× duration)

interface FieldState {
  field: Shot | null // persistent visual, follows the player
  r: number // eased radius (grows smoothly on spawn / level-up)
  pulse: number // 1 → 0 after each damage pulse
}

/** each extra projectile widens the field by 10% */
const radius = (s: WeaponLevel) => RADIUS * s.area * (1 + 0.1 * (s.amount - 1))

function follow(s: Shot, w: World) {
  const wi = s.src!
  if (!w.p.weapons.includes(wi)) {
    s.dead = true
    return
  }
  s.x = w.p.x
  s.y = w.p.y
  s.color = w.color(wi)
}

function drawField(s: Shot, w: World) {
  if (w.p.dead) return
  const wi = s.src!, st: FieldState = wi.state, c = s.color, t = w.time, k = st.pulse
  const x = s.x, y = s.y, r = st.r * (1 + k * 0.05)
  // soft body, rim, and the pulse wave rolling out to the rim
  R.draw(Shape.Glow, x, y, r * 1.25, r * 1.25, 0, c, 0.1 + k * 0.12)
  R.draw(Shape.Circle, x, y, r, r, 0, c, 0.03 + k * 0.04)
  R.draw(Shape.Ring, x, y, r, r, 0, c, 0.28 + k * 0.5, 0.9, 1.5)
  if (k > 0) R.draw(Shape.Ring, x, y, r * (1 - k * 0.6), r * (1 - k * 0.6), 0, c, k * 0.55, 1, 2.5)
  // slow-turning necklace of spores along the rim
  const rim = Math.min(48, Math.round(r * 0.2))
  for (let i = 0; i < rim; i++) {
    const a = (i / rim) * TAU + t * 0.45, rr = r + Math.sin(t * 3 + i * 1.7) * 2.5
    R.draw(Shape.Circle, x + Math.cos(a) * rr, y + Math.sin(a) * rr, 1.7, 1.7, 0, c, 0.75, 0.7)
  }
  // drifting spores: born at the heart, swirl outward and fade at the rim.
  // fused flourish — Solar sparks, Glacial crystals, Void spores fall inward
  const n = Math.min(64, 16 + Math.round(r * 0.25))
  const dir = wi.fuse === 'M' ? -1 : 1, shape = wi.fuse === 'C' ? Shape.Diamond : wi.fuse === 'Y' ? Shape.Star : Shape.Circle
  for (let i = 0; i < n; i++) {
    const h1 = (i * 0.618034) % 1, h2 = (i * 0.754878 + 0.31) % 1, h3 = (i * 0.56984 + 0.73) % 1
    const u = (((h1 + t * (0.1 + 0.08 * h2) * dir) % 1) + 1) % 1
    const a = h3 * TAU + t * (0.25 + 0.2 * h2) + u * 1.2, d = r * (0.12 + 0.86 * u), sz = 1.4 + 2.2 * h2
    R.draw(shape, x + Math.cos(a) * d, y + Math.sin(a) * d, sz, sz, a, c, Math.sin(u * Math.PI) * (0.55 + k * 0.4), 0.9)
  }
}

export default {
  id: 'spore_field',
  hue: 'G',
  name: l('Spore Field', '孢子领域'),
  desc: l('A breathing cloud of spores that gnaws at and slows everything inside. Extra projectiles widen it.', '缓缓呼吸的孢子云，侵蚀并拖慢所有闯入者。额外弹体会扩大范围。'),
  icon: '<circle cx="32" cy="32" r="25" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-dasharray="0.1 9.7"/><circle cx="32" cy="32" r="8" fill="currentColor"/><g fill="currentColor"><circle cx="20" cy="22" r="4"/><circle cx="44" cy="23" r="3"/><circle cx="43" cy="43" r="4"/><circle cx="21" cy="42" r="3"/></g>',
  levels: [
    l('+20% area', '范围 +20%'),
    l('+4 damage', '伤害 +4'),
    l('Pulses faster, slow 15% → 25%', '脉动加快，减速 15% → 25%'),
    l('+5 damage, +15% area', '伤害 +5，范围 +15%'),
    l('+6 damage, pulses faster', '伤害 +6，脉动加快'),
    l('+8 damage, +25% area, pulses faster, slow 25% → 35%', '伤害 +8，范围 +25%，脉动加快，减速 25% → 35%'),
  ],
  stats: (lv) => ({ dmg: DMG[lv - 1], cd: CD[lv - 1], area: AREA[lv - 1], speed: 0, amount: 1, duration: 1, pierce: Infinity, slow: SLOW[lv - 1] }),
  tick(wi, w, dt, s) {
    const st: FieldState = wi.state
    if (!st.field || st.field.dead) {
      st.field = w.shot({ noCollide: true, pierce: Infinity, life: Infinity, update: follow, draw: drawField }, wi)
      st.r = st.pulse = 0
    }
    st.r = damp(st.r, radius(s), 5, dt)
    st.pulse = Math.max(0, st.pulse - dt * 2.5)
  },
  fire(wi, w, s) {
    const p = w.p, st: FieldState = wi.state, c = w.color(wi), linger = LINGER * s.duration
    w.inRadius(p.x, p.y, st.r, (e) => {
      w.damage(e, s.dmg, wi, { kb: 50, dirx: e.x - p.x, diry: e.y - p.y })
      e.slow = Math.max(e.slow, linger)
      e.slowAmt = Math.max(e.slowAmt, e.boss ? s.slow * 0.5 : s.slow)
      w.part({ x: e.x, y: e.y, life: 0.3, size: e.r * 0.5, size1: e.r * 1.5, color: c, alpha: 0.35, shape: Shape.Glow })
    })
    // a few loose spores puff up with every breath
    for (let i = 0; i < 3; i++) {
      const a = rand(0, TAU), d = rand(0.2, 0.9) * st.r
      w.part({ x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d, vx: rand(-12, 12), vy: rand(-40, -15), life: rand(0.5, 0.9), size: rand(1.5, 2.8), color: c, glow: 0.9, drag: 1 })
    }
    st.pulse = 1
    w.sfx('spore', { vol: 0.2, pitch: rand(0.9, 1.1) }, 0.25)
  },
} satisfies WeaponDef
