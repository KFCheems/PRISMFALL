import { renderer as R, Shape } from '../../core/gl'
import { l } from '../../core/i18n'
import { clamp, dist2, ease, rand, scale, TAU } from '../../core/math'
import { COLOR } from '../../game/types'
import type { Enemy, Shot, WeaponDef, WeaponLevel } from '../../game/types'
import type { World } from '../../game/world'

// per-level tables (index = level-1)
const DMG = [6, 6, 8, 8, 8, 10, 13]
const CD = [1.6, 1.6, 1.6, 1.6, 1.4, 1.4, 1.25]
const AMT = [2, 3, 3, 3, 4, 4, 5] // seeds per sowing
const THORNS = [6, 6, 6, 8, 8, 8, 10] // thorns per burst
const PIERCE = [1, 1, 1, 2, 2, 2, 3]
const AREA = [1, 1, 1, 1, 1, 1.2, 1.2]

const TOSS = 0.22 // seconds in the air
const ARM = 0.4 // seconds after sowing before a seed can trigger
const TRIGGER = 30 // proximity trigger radius (× area)
const POP = 34 // radius of the burst itself (× area)
const REACH = 140 // thorn travel distance (× area)

// allocation-free early-out probe: first enemy touching a circle
let qx = 0, qy = 0, qr = 0
let prey: Enemy | null = null
const probe = (e: Enemy) => {
  const rr = qr + e.r
  if (dist2(qx, qy, e.x, e.y) >= rr * rr) return
  prey = e
  return true
}
function touching(w: World, x: number, y: number, r: number) {
  qx = x
  qy = y
  qr = r
  prey = null
  w.grid.query(x, y, r, probe)
  return prey as Enemy | null
}

function grow(s: Shot, w: World, dt: number) {
  if (!w.p.weapons.includes(s.src!)) {
    s.dead = true
    return
  }
  const d = s.data
  d.t += dt
  if (d.t < TOSS) {
    const k = ease.outCubic(d.t / TOSS)
    s.x = d.ox + (d.tx - d.ox) * k
    s.y = d.oy + (d.ty - d.oy) * k
    return
  }
  if (!d.landed) {
    d.landed = true
    s.x = d.tx
    s.y = d.ty
    w.burst(s.x, s.y, { n: 4, color: s.color, speed: 50, life: 0.3, size: 1.6 })
  }
  if (d.t < ARM) return
  const e = touching(w, s.x, s.y, s.r)
  if (!e) return
  s.dead = true
  sprout(s, w, e)
}

/** the seed bursts: a point-blank pop plus a ring of thorns, the first one aimed at whoever stepped close */
function sprout(s: Shot, w: World, target: Enemy | null = null) {
  const wi = s.src!, st: WeaponLevel = s.data.s, a = st.area, c = s.color, x = s.x, y = s.y
  w.inRadius(x, y, POP * a, (e) => void w.damage(e, st.dmg, wi, { kb: 120, dirx: e.x - x, diry: e.y - y }))
  const n = st.thorns, sp = st.speed, life = (REACH * a) / sp
  const off = target ? Math.atan2(target.y - y, target.x - x) : rand(0, TAU)
  for (let i = 0; i < n; i++) {
    const ang = off + (i / n) * TAU
    w.shot({
      x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, rot: ang, r: 5 * a, w: 10 * a, h: 2.6 * a, shape: Shape.Diamond,
      dmg: st.dmg, pierce: st.pierce, life, kb: 40, glow: 1.1, trail: wi.fuse ? 24 : 0, update: fly,
    }, wi)
  }
  w.part({ x, y, life: 0.2, size: 30 * a, size1: 6, color: c, alpha: 0.9, shape: Shape.Glow })
  w.part({ x, y, life: 0.25, size: 4, size1: POP * a * 1.3, color: c, alpha: 0.8, shape: Shape.Ring, glow: 1 })
  w.burst(x, y, { n: 6, color: COLOR.W, speed: 240, life: 0.25, size: 1.8, stretch: 0.02 })
  w.sfx('shard', { vol: 0.4, pitch: rand(0.9, 1.15), x }, 0.04)
}

function fly(s: Shot, _w: World, dt: number) {
  s.x += s.vx * dt
  s.y += s.vy * dt
  s.rot = Math.atan2(s.vy, s.vx)
  s.alpha = Math.min(1, (s.life / s.maxLife) * 3)
}

function drawSeed(s: Shot) {
  const d = s.data, c = s.color, a = d.s.area, t = d.t
  if (t < TOSS) {
    const k = t / TOSS, lift = Math.sin(k * Math.PI) * 18 * a
    R.draw(Shape.Circle, s.x, s.y, 3 * a, 3 * a, 0, c, 0.2)
    R.draw(Shape.Diamond, s.x, s.y - lift, 4 * a, 6 * a, d.rot + k * 9, c, 1, 1.2)
    return
  }
  const armed = t >= ARM
  const blink = !armed ? (Math.sin(t * 50) > 0 ? 1 : 0.35) : s.life < 0.8 ? 0.55 + 0.45 * Math.sin(t * 28) : 1
  R.draw(Shape.Glow, s.x, s.y, 20 * a, 20 * a, 0, c, 0.22 * blink)
  if (armed) R.draw(Shape.Ring, s.x, s.y, s.r, s.r, 0, c, 0.1 + 0.05 * Math.sin(t * 4 + d.rot), 0, 1)
  R.draw(Shape.Diamond, s.x, s.y, 4.5 * a, 6.5 * a, d.rot, d.husk, 0.95, 0, 0, 0)
  R.draw(Shape.Diamond, s.x, s.y, 4.5 * a, 6.5 * a, d.rot, c, blink, 1, 1.6)
  // thorns poke out of the husk as it ripens
  const g = clamp((t - ARM) / 0.6, 0, 1)
  for (let i = 0; g > 0 && i < 3; i++) {
    const ang = d.rot + (i / 3) * TAU, cs = Math.cos(ang), sn = Math.sin(ang), r0 = 4 * a, r1 = (4 + 6 * g) * a
    R.line(s.x + cs * r0, s.y + sn * r0, s.x + cs * r1, s.y + sn * r1, 1.5 * a, c, blink, 0.6)
  }
}

export default {
  id: 'thorn_seeds',
  hue: 'G',
  name: l('Thorn Seeds', '荆棘种子'),
  desc: l('Sows seeds in your wake that burst into thorns when foes draw near.', '沿途播下种子，敌人一靠近便炸裂出四射的荆棘。'),
  icon: '<path d="M32 17c7 5 7 25 0 30-7-5-7-25 0-30z" fill="currentColor"/><path d="M32 4v7M32 53v7M5 32h9M50 32h9M13 13l6 6M45 45l6 6M51 13l-6 6M13 51l6-6" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>',
  levels: [
    l('+1 seed per sowing', '每次播种 +1 颗'),
    l('+2 damage', '伤害 +2'),
    l('+2 thorns per seed, +1 pierce', '每颗种子荆棘 +2，贯穿 +1'),
    l('+1 seed per sowing, sows faster', '每次播种 +1 颗，播种加快'),
    l('+2 damage, +20% area', '伤害 +2，范围 +20%'),
    l('+3 damage, +1 seed, +2 thorns, +1 pierce, sows faster', '伤害 +3，种子 +1，荆棘 +2，贯穿 +1，播种加快'),
  ],
  stats: (lv) => ({
    dmg: DMG[lv - 1], cd: CD[lv - 1], area: AREA[lv - 1], speed: 460, amount: AMT[lv - 1], duration: 5, pierce: PIERCE[lv - 1], thorns: THORNS[lv - 1],
  }),
  fire(wi, w, s) {
    const p = w.p, n = s.amount
    const back = Math.atan2(-p.face.y, -p.face.x), spread = Math.min(0.75, TAU / n), husk = scale(w.color(wi), 0.16)
    for (let i = 0; i < n; i++) {
      const a = back + (i - (n - 1) / 2) * spread + rand(-0.15, 0.15), d = rand(30, 62) * s.area
      w.shot({
        r: TRIGGER * s.area, life: s.duration, pierce: Infinity, noCollide: true,
        data: { ox: p.x, oy: p.y, tx: p.x + Math.cos(a) * d, ty: p.y + Math.sin(a) * d, t: 0, rot: rand(0, TAU), landed: false, husk, s },
        update: grow, draw: drawSeed, onExpire: sprout,
      }, wi)
    }
    w.part({ x: p.x, y: p.y, life: 0.15, size: 16, size1: 4, color: w.color(wi), alpha: 0.6, shape: Shape.Glow })
    w.sfx('plant', { vol: 0.35, pitch: rand(1.15, 1.3) }, 0.05)
  },
} satisfies WeaponDef
