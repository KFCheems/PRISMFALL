import { renderer as R, Shape } from '../../core/gl'
import { l } from '../../core/i18n'
import { damp, rand, TAU } from '../../core/math'
import { COLOR } from '../../game/types'
import type { Shot, WeaponDef, WeaponInst, WeaponLevel } from '../../game/types'
import type { World } from '../../game/world'

// per-level tables (index = level-1)
const DMG = [11, 14, 18, 22, 28, 36, 46]
const CD = [1.1, 1.0, 0.95, 0.85, 0.8, 0.72, 0.62] // seconds between dives (per wisp, staggered)
const AMT = [1, 2, 2, 3, 3, 4, 5] // wisps
const AREA = [1, 1, 1, 1.1, 1.1, 1.2, 1.3]
const ROT = [2.6, 2.6, 2.8, 3.0, 3.2, 3.4, 3.8]

const ORBIT = 40 // orbit radius at area 1
const REACH = 240 // dive reach at area 1
const SIZE = 7
const W = COLOR.W

interface Swarm {
  wisps: Shot[]
  ang: number
  s: WeaponLevel
}

type Phase = 'orbit' | 'dive' | 'return'

interface Wisp {
  i: number // slot in the orbit
  phase: Phase
  t: number // time until the next dive
  tx: number // dive target point
  ty: number
  flash: number
  hit: Set<number> // enemies already struck by the current dive
}

function launch(wi: WeaponInst, w: World): Shot {
  const p = w.p
  w.burst(p.x, p.y, { n: 5, color: w.color(wi), speed: 140, life: 0.35, size: 2 })
  w.sfx('pulse', { vol: 0.3, pitch: 1.4 })
  return w.shot({ r: SIZE, life: Infinity, pierce: Infinity, noCollide: true, kb: 0, data: { i: 0, phase: 'orbit', t: rand(0.3, 0.8), tx: 0, ty: 0, flash: 0, hit: new Set() } satisfies Wisp, update: fly, draw }, wi)
}

function fly(d: Shot, w: World, dt: number) {
  const wi = d.src!, p = w.p
  if (!p.weapons.includes(wi)) return void (d.dead = true)
  const sw = wi.state as Swarm, s = sw.s, D = d.data as Wisp
  d.color = w.color(wi)
  const slotA = sw.ang + (D.i / Math.max(1, sw.wisps.length)) * TAU
  D.flash = Math.max(0, D.flash - dt * 5)
  if (D.phase === 'orbit') {
    const r = ORBIT * s.area + Math.sin(w.time * 3 + D.i * 1.7) * 5
    const hx = p.x + Math.cos(slotA) * r, hy = p.y + Math.sin(slotA) * r
    d.x = damp(d.x, hx, 10, dt)
    d.y = damp(d.y, hy, 10, dt)
    D.t -= dt
    if (D.t > 0 || p.dead) return
    const e = w.nearest(p.x, p.y, REACH * s.area)
    if (!e) return void (D.t = 0.15)
    D.phase = 'dive'
    D.tx = e.x
    D.ty = e.y
    D.flash = 1
    D.hit.clear()
    w.sfx('dash', { vol: 0.15, pitch: rand(1.3, 1.6), x: d.x }, 0.08)
    return
  }
  if (D.phase === 'dive') {
    const dx = D.tx - d.x, dy = D.ty - d.y, len = Math.hypot(dx, dy) || 1, sp = 640 * s.area
    // slight homing so the wisp tracks a moving target
    const e = w.nearest(d.x, d.y, 60)
    if (e) D.tx = damp(D.tx, e.x, 6, dt), D.ty = damp(D.ty, e.y, 6, dt)
    d.x += (dx / len) * sp * dt
    d.y += (dy / len) * sp * dt
    d.rot = Math.atan2(dy, dx)
    if (Math.random() < dt * 20) w.part({ x: d.x, y: d.y, life: 0.18, size: SIZE * 1.2, size1: 0, color: d.color, alpha: 0.7, shape: Shape.Glow })
    // impact — each foe is struck once per dive, not once per frame
    w.inRadius(d.x, d.y, SIZE * 1.4, (en) => {
      if (D.hit.has(en.id)) return
      D.hit.add(en.id)
      w.damage(en, s.dmg, wi, { kb: 70, dirx: d.x - en.x, diry: d.y - en.y })
      w.part({ x: en.x, y: en.y, life: 0.15, size: en.r * 1.4, size1: 0, color: W, alpha: 0.8, shape: Shape.Glow })
      w.burst(en.x, en.y, { n: 4, color: d.color, speed: 200, life: 0.22, size: 1.8, stretch: 0.03 })
    })
    if (len < 16 || Math.hypot(D.tx - d.x, D.ty - d.y) < 14) {
      D.phase = 'return'
      D.t = 0
    }
    return
  }
  // return to orbit slot
  const r = ORBIT * s.area
  const hx = p.x + Math.cos(slotA) * r, hy = p.y + Math.sin(slotA) * r
  d.x = damp(d.x, hx, 9, dt)
  d.y = damp(d.y, hy, 9, dt)
  if (Math.hypot(d.x - hx, d.y - hy) < 14) {
    D.phase = 'orbit'
    D.t = s.cd * rand(0.85, 1.15)
  }
}

function draw(d: Shot, w: World) {
  const D = d.data as Wisp, s = (d.src!.state as Swarm).s, z = SIZE * s.area
  const rot = w.time * 4 + D.i * 1.7, bob = Math.sin(w.time * 6 + D.i * 2) * 1.5
  const c = d.color
  R.draw(Shape.Glow, d.x, d.y + bob, z * 3.5, z * 3.5, 0, c, 0.28 + 0.4 * D.flash)
  // flickering flame body with a trailing comet tail toward the player
  const a = Math.atan2(w.p.y - d.y, w.p.x - d.x)
  R.draw(Shape.Capsule, d.x - Math.cos(a) * z * 1.4, d.y + bob - Math.sin(a) * z * 1.4, z * 1.1, z * 0.5, a, c, 0.4, 1)
  R.draw(Shape.Star, d.x, d.y + bob, z, z * 1.2, rot, c, 0.85, 0.09 + 0.6 * D.flash, 1.2)
  R.draw(Shape.Hex, d.x, d.y + bob, z * 0.6, z * 0.6, -rot, c, 0.6, 0.5, 1)
  R.draw(Shape.Circle, d.x, d.y + bob, z * 0.35, z * 0.35, 0, W, 0.9, 0.4 + 0.6 * D.flash)
}

export default {
  id: 'wisp_swarm',
  hue: 'G',
  name: l('Wisp Swarm', '游魂蜂群'),
  desc: l('Wisps of living flame circle you, then streak out to harry the nearest foe before drifting home.', '活火化为游魂环绕身侧，忽而俯冲出袭最近的敌人，再飘然归位。'),
  icon: '<path d="M32 6c6 10 14 14 14 26a14 14 0 0 1-28 0c0-8 6-10 8-16 2 6 6 6 6 0z" fill="currentColor"/><circle cx="32" cy="34" r="5" fill="none" stroke="currentColor" stroke-width="3"/><path d="M12 22c-2 4-2 8 0 12M52 22c2 4 2 8 0 12" stroke="currentColor" stroke-width="4" stroke-linecap="round" opacity="0.7"/>',
  levels: [
    l('+1 wisp', '游魂 +1'),
    l('+3 damage, dives faster', '伤害 +3，俯冲加快'),
    l('+1 wisp, +10% area', '游魂 +1，范围 +10%'),
    l('+5 damage, dives faster', '伤害 +5，俯冲加快'),
    l('+1 wisp, +10% area', '游魂 +1，范围 +10%'),
    l('+1 wisp, +6 damage, +10% area, dives much faster', '游魂 +1，伤害 +6，范围 +10%，俯冲大幅加快'),
  ],
  stats: (lv) => ({ dmg: DMG[lv - 1], cd: CD[lv - 1], area: AREA[lv - 1], speed: ROT[lv - 1], amount: AMT[lv - 1], duration: 1, pierce: 1 }),
  tick(wi, w, dt, s) {
    const sw = wi.state as Swarm
    sw.s = s
    sw.ang = (sw.ang ?? 0) + s.speed * dt
    const list = (sw.wisps ??= [])
    if (list.length === s.amount) return
    while (list.length < s.amount) list.push(launch(wi, w))
    while (list.length > s.amount) list.pop()!.dead = true
    list.forEach((d, i) => ((d.data as Wisp).i = i))
  },
  unlock: 'kills_10k',
} satisfies WeaponDef
