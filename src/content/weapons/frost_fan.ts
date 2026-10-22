import { renderer as R, Shape } from '../../core/gl'
import { l } from '../../core/i18n'
import { mix, rand } from '../../core/math'
import { COLOR } from '../../game/types'
import type { Enemy, Shot, WeaponDef, WeaponLevel } from '../../game/types'
import type { World } from '../../game/world'

// per-level tables (index = level-1)
const DMG = [7, 7, 11, 11, 16, 16, 24]
const CD = [1.3, 1.3, 1.3, 1.1, 1.1, 1.1, 1]
const AMT = [4, 5, 5, 6, 6, 7, 7]
const PIERCE = [2, 2, 2, 2, 2, 3, 3]
const SLOW = [0.3, 0.3, 0.3, 0.3, 0.4, 0.4, 0.4]

const LIFE = 0.42 // shard flight time at duration 1 (≈180 units of reach)
const DRAG = 3.2 // shards burst out fast, hang, then shatter
const GAP = 0.15 // radians between shards
const MAX_FAN = 0.6 // max half-width of the fan
const CHILL = 1.6 // slow duration (s) at duration 1
const BLOOM_R = 34
const W = COLOR.W

function glide(s: Shot, _w: World, dt: number) {
  const k = Math.exp(-DRAG * dt)
  s.vx *= k
  s.vy *= k
  s.x += s.vx * dt
  s.y += s.vy * dt
  s.rot = Math.atan2(s.vy, s.vx)
}

function draw(s: Shot) {
  const a = Math.min(1, s.life / 0.06)
  const tail = Math.hypot(s.vx, s.vy) * 0.035 // streak shrinks as the shard slows
  const c = Math.cos(s.rot), sn = Math.sin(s.rot)
  R.draw(Shape.Capsule, s.x - c * tail, s.y - sn * tail, tail + s.h, s.h * 0.55, s.rot, s.color, 0.3 * a, 0.4)
  R.draw(Shape.Diamond, s.x, s.y, s.w, s.h, s.rot, s.color, a, s.glow)
  R.draw(Shape.Diamond, s.x, s.y, s.w * 0.55, s.h * 0.5, s.rot, W, 0.95 * a, 0)
}

function frost(e: Enemy, s: WeaponLevel) {
  e.slow = Math.max(e.slow, CHILL * (s.duration / LIFE))
  e.slowAmt = Math.max(e.slowAmt, s.slow)
}

function chill(s: Shot, e: Enemy, w: World) {
  const st = s.data as WeaponLevel
  frost(e, st)
  w.burst(e.x, e.y, { n: 3, color: s.color, speed: 140, life: 0.25, size: 1.8 * st.area, shape: Shape.Diamond, spin: 10 })
}

/** range end (or pierce spent): the shard bursts into glittering splinters */
function shatter(s: Shot, w: World) {
  const st = s.data as WeaponLevel
  w.burst(s.x, s.y, { n: 5, color: s.color, speed: 120, life: 0.3, size: 1.7 * st.area, shape: Shape.Diamond, spin: 14 })
  w.part({ x: s.x, y: s.y, life: 0.12, size: 12 * st.area, size1: 2, color: W, alpha: 0.5, shape: Shape.Glow })
  if (st.bloom) {
    const r = BLOOM_R * st.area
    w.inRadius(s.x, s.y, r, (e) => {
      w.damage(e, st.dmg * 0.35, s.src, { kb: 40, dirx: e.x - s.x, diry: e.y - s.y })
      frost(e, st)
    })
    w.part({ x: s.x, y: s.y, life: 0.3, size: r * 0.3, size1: r, color: s.color, alpha: 0.6, shape: Shape.Ring, glow: 1 })
    w.part({ x: s.x, y: s.y, life: 0.25, size: r * 1.2, size1: r * 0.3, color: s.color, alpha: 0.35, shape: Shape.Glow })
  }
  w.sfx('shatter', { vol: 0.14, pitch: rand(1.3, 1.7), x: s.x }, 0.08)
}

export default {
  id: 'frost_fan',
  hue: 'B',
  name: l('Frost Fan', '霜扇'),
  desc: l('Blasts a close-range fan of ice shards. Everything they pierce is slowed.', '近距离喷出扇形冰棱，被贯穿的敌人都会减速。'),
  icon: '<g fill="currentColor"><path d="M14 32l14-6 30 6-30 6z"/><path d="M14 32l14-6 30 6-30 6z" transform="rotate(-35 8 32)"/><path d="M14 32l14-6 30 6-30 6z" transform="rotate(35 8 32)"/><circle cx="8" cy="32" r="4"/></g>',
  levels: [
    l('+1 shard', '冰棱 +1'),
    l('+4 damage', '伤害 +4'),
    l('+1 shard, -0.2s cooldown', '冰棱 +1，冷却 -0.2 秒'),
    l('+5 damage, slow 30% → 40%', '伤害 +5，减速 30% → 40%'),
    l('+1 shard, +1 pierce', '冰棱 +1，贯穿 +1'),
    l('+8 damage, -0.1s cooldown. Shards shatter into a chilling frost burst', '伤害 +8，冷却 -0.1 秒，冰棱碎裂时迸发刺骨寒霜'),
  ],
  stats: (lv) => ({
    dmg: DMG[lv - 1], cd: CD[lv - 1], area: 1, speed: 720, amount: AMT[lv - 1], duration: LIFE, pierce: PIERCE[lv - 1],
    slow: SLOW[lv - 1], bloom: lv >= 7 ? 1 : 0,
  }),
  fire(wi, w, s) {
    const p = w.p, n = s.amount, col = w.color(wi)
    const base = Math.atan2(p.aim.y, p.aim.x), gap = Math.min(GAP, MAX_FAN / Math.ceil((n - 1) / 2))
    // centre-out so there is always a shard on the aim line; an even count leans to alternating sides
    const flip = (wi.state.flip = -(wi.state.flip ?? 1))
    for (let i = 0; i < n; i++) {
      const a = base + (i % 2 ? flip : -flip) * Math.ceil(i / 2) * gap + rand(-0.03, 0.03)
      const c = Math.cos(a), sn = Math.sin(a), v = s.speed * rand(0.88, 1.08)
      w.shot({
        x: p.x + c * 12, y: p.y + sn * 12, vx: c * v, vy: sn * v, rot: a,
        r: 6 * s.area, w: 10 * s.area, h: 3.6 * s.area, shape: Shape.Diamond,
        dmg: s.dmg, pierce: s.pierce, life: s.duration * rand(0.92, 1.05), kb: 80, glow: 1.1, data: s,
        update: glide, onHit: chill, onExpire: shatter, draw,
      }, wi)
    }
    // a cold puff rolling out over the fan
    const mist = mix(col, W, 0.6), mx = p.x + Math.cos(base) * 14, my = p.y + Math.sin(base) * 14
    w.part({ x: mx, y: my, vx: p.vx, vy: p.vy, life: 0.14, size: 26 * s.area, size1: 6, color: col, alpha: 0.8, shape: Shape.Glow })
    for (let i = 0; i < 7; i++) {
      const a = base + rand(-1, 1) * (gap * n * 0.5 + 0.2), v = rand(60, 220)
      w.part({ x: mx, y: my, vx: Math.cos(a) * v + p.vx, vy: Math.sin(a) * v + p.vy, life: rand(0.25, 0.4), size: rand(2, 3.5) * s.area, size1: 0, color: mist, alpha: 0.5, glow: 0.4, drag: 5 })
    }
    w.shake(0.05)
    w.sfx('shard', { vol: 0.5, pitch: rand(0.92, 1.08) })
  },
} satisfies WeaponDef
