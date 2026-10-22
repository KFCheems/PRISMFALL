import { renderer as R, Shape } from '../../core/gl'
import { l } from '../../core/i18n'
import { hex, rand, TAU, type RGB } from '../../core/math'
import { COLOR, fuseParts } from '../../game/types'
import type { Enemy, Shot, WeaponDef, WeaponLevel } from '../../game/types'
import type { World } from '../../game/world'

// per-level tables (index = level-1)
const DMG = [12, 16, 16, 16, 21, 21, 27]
const CD = [1.7, 1.7, 1.7, 1.7, 1.7, 1.45, 1.45]
const AMT = [1, 1, 2, 2, 2, 3, 3]
const AREA = [1, 1, 1, 1.2, 1.2, 1.2, 1.2]
const SPEED = [640, 640, 640, 736, 736, 736, 736] // throw speed; reach = speed × duration / 2

const OUT = 0.7 // outbound flight time at duration 1
const FAN = 0.32 // radians between prisms
const EMIT = 0.1 // seconds between side-ray pairs on the way back
const SIZE = 13
const W = COLOR.W
const VIOLET = hex('#8f6bff')

interface Flight {
  s: WeaponLevel
  dec: number // outbound deceleration
  back: boolean
  bt: number // time since the turn
  sp: number // return speed
  side: number // which way the return arc bows
  emit: number
  trail: number
  n: number
  fa: RGB // spectral trail colors
  fb: RGB
}

function fly(s: Shot, w: World, dt: number) {
  const F = s.data as Flight, p = w.p, st = F.s
  if (!F.back) {
    const sp = Math.hypot(s.vx, s.vy), next = sp - F.dec * dt
    if (next > 0) {
      s.vx *= next / sp
      s.vy *= next / sp
    } else turn(s, w, F)
  } else {
    const dx = p.x - s.x, dy = p.y - s.y, d = Math.hypot(dx, dy) || 1
    if (d < p.r + 8 + F.sp * dt) return void caught(s, w)
    // home on the player with a sideways bow that dies off: a boomerang arc that always lands
    F.bt += dt
    F.sp = Math.min(st.speed * 1.3, F.sp + st.speed * 3 * dt)
    const ux = dx / d, uy = dy / d, curl = F.side * st.speed * 0.35 * Math.exp(-F.bt * 4)
    s.vx = ux * F.sp - uy * curl
    s.vy = uy * F.sp + ux * curl
    F.emit -= dt
    if (F.emit <= 0) {
      F.emit += EMIT
      const a = Math.atan2(s.vy, s.vx)
      ray(s, w, a + Math.PI / 2 + rand(-0.15, 0.15))
      ray(s, w, a - Math.PI / 2 + rand(-0.15, 0.15))
      w.sfx('laser', { vol: 0.12, pitch: rand(1.7, 2), x: s.x }, 0.06)
    }
  }
  s.x += s.vx * dt
  s.y += s.vy * dt
  F.trail -= dt
  if (F.trail <= 0) {
    F.trail += 0.025
    const k = F.n++ & 3, c = k === 1 ? F.fa : k === 3 ? F.fb : s.color
    w.part({ x: s.x + rand(-4, 4), y: s.y + rand(-4, 4), vx: rand(-20, 20), vy: rand(-20, 20), life: 0.35, size: 2.4 * st.area, size1: 0, color: c, alpha: 0.8, glow: 1 })
  }
}

/** apex: the prism flares, stops dead and starts the return trip */
function turn(s: Shot, w: World, F: Flight) {
  const st = F.s
  F.back = true
  s.vx = s.vy = 0
  s.kb = 0 // never knock foes into the player on the way back
  s.homing = 0
  s.spin *= 1.5
  w.part({ x: s.x, y: s.y, life: 0.2, size: 30 * st.area, size1: 4, color: s.color, alpha: 0.9, shape: Shape.Glow })
  w.part({ x: s.x, y: s.y, life: 0.18, size: 12 * st.area, size1: 2, color: W, rot: s.rot, spin: 6, shape: Shape.Star, glow: 1.4 })
  w.sfx('shard', { vol: 0.3, pitch: 1.4, x: s.x }, 0.05)
  for (let i = 0; i < st.nova; i++) ray(s, w, s.rot + (i / st.nova) * TAU)
}

/** refracted shard split off the prism; it shares the prism's hit timers, so a volley never double-dips one foe */
function ray(s: Shot, w: World, a: number) {
  const st = (s.data as Flight).s, z = st.area, c = Math.cos(a), sn = Math.sin(a), v = st.speed * 0.95
  w.shot({
    x: s.x + c * s.r * 0.6, y: s.y + sn * s.r * 0.6, vx: c * v, vy: sn * v, rot: a,
    r: 5 * z, w: 10 * z, h: 2.2 * z, shape: Shape.Capsule,
    dmg: st.dmg * 0.6, pierce: st.pierce, life: 0.24 * (st.duration / OUT), kb: 30, glow: 1.3, hits: s.hits, hitCd: s.hitCd,
  }, s.src)
}

function caught(s: Shot, w: World) {
  const p = w.p
  s.dead = true
  w.part({ x: p.x, y: p.y, vx: p.vx, vy: p.vy, life: 0.15, size: 26, size1: 4, color: s.color, alpha: 0.7, shape: Shape.Glow })
  w.part({ x: p.x, y: p.y, vx: p.vx, vy: p.vy, life: 0.2, size: 6, size1: 24, color: s.color, alpha: 0.6, shape: Shape.Ring, glow: 1 })
  w.sfx('pulse', { vol: 0.2, pitch: 1.6 }, 0.05)
}

function spark(s: Shot, e: Enemy, w: World) {
  w.burst(e.x, e.y, { n: 3, color: s.color, speed: 200, life: 0.2, size: 1.6, stretch: 0.03 })
}

/** lost (player outran it): fade out in a puff */
function fade(s: Shot, w: World) {
  w.burst(s.x, s.y, { n: 8, color: s.color, speed: 120, life: 0.3, size: 2 })
}

function draw(s: Shot) {
  const z = s.w, a = Math.min(1, s.life / 0.15)
  R.draw(Shape.Glow, s.x, s.y, z * 3.5, z * 3.5, 0, s.color, 0.45 * a)
  R.draw(Shape.Tri, s.x, s.y, z, z, s.rot, s.color, 0.28 * a, 0)
  R.draw(Shape.Tri, s.x, s.y, z, z, s.rot, s.color, a, 1.3, 2.4)
  R.draw(Shape.Tri, s.x, s.y, z * 0.4, z * 0.4, -s.rot * 0.5, W, 0.9 * a, 0.8)
}

export default {
  id: 'refractor',
  hue: 'B',
  name: l('Refractor', '折射棱'),
  desc: l('Hurls a spinning prism that boomerangs back, splitting light shards off both sides on the return.', '掷出旋转棱镜，飞回途中向两侧折射出光刃。'),
  icon: '<path d="M32 12l16 28H16z" fill="none" stroke="currentColor" stroke-width="5" stroke-linejoin="round"/><path d="M50 46a22 22 0 0 1-36 0M14 54v-8h8M20 24L8 17M44 24l12-7" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>',
  levels: [
    l('+4 damage', '伤害 +4'),
    l('+1 prism', '棱镜 +1'),
    l('+20% size, +15% throw range', '尺寸 +20%，投掷距离 +15%'),
    l('+5 damage', '伤害 +5'),
    l('+1 prism, -0.25s cooldown', '棱镜 +1，冷却 -0.25 秒'),
    l('+6 damage. Prisms flare a ring of 8 shards at the turn', '伤害 +6，棱镜折返时迸发 8 道环形光刃'),
  ],
  stats: (lv) => ({
    dmg: DMG[lv - 1], cd: CD[lv - 1], area: AREA[lv - 1], speed: SPEED[lv - 1], amount: AMT[lv - 1], duration: OUT, pierce: 1,
    nova: lv >= 7 ? 8 : 0,
  }),
  fire(wi, w, s) {
    const p = w.p, n = s.amount, base = Math.atan2(p.aim.y, p.aim.x)
    const [fa, fb] = wi.fuse ? fuseParts(wi.fuse).map((h) => COLOR[h]) : [COLOR.C, VIOLET]
    wi.state.flip = -(wi.state.flip ?? 1) // a lone prism alternates its return arc
    for (let i = 0; i < n; i++) {
      const off = i - (n - 1) / 2, a = base + off * FAN, c = Math.cos(a), sn = Math.sin(a)
      const data: Flight = { s, dec: s.speed / s.duration, back: false, bt: 0, sp: 0, side: off < 0 ? 1 : off > 0 ? -1 : wi.state.flip, emit: EMIT / 2, trail: 0, n: 0, fa, fb }
      w.shot({
        x: p.x + c * 14, y: p.y + sn * 14, vx: c * s.speed, vy: sn * s.speed,
        r: SIZE * s.area, w: SIZE * s.area, pierce: Infinity, hitCd: 0.35, life: s.duration + 3, dmg: s.dmg, kb: 70, spin: 14,
        data, update: fly, onHit: spark, onExpire: fade, draw,
      }, wi)
    }
    w.part({ x: p.x + p.aim.x * 14, y: p.y + p.aim.y * 14, vx: p.vx, vy: p.vy, life: 0.12, size: 28 * s.area, size1: 4, color: w.color(wi), alpha: 0.8, shape: Shape.Glow })
    w.sfx('orbit', { vol: 0.45, pitch: rand(0.95, 1.1) })
  },
  unlock: 'first_fusion',
} satisfies WeaponDef
