import { renderer as R, Shape } from '../../core/gl'
import { l } from '../../core/i18n'
import { rand } from '../../core/math'
import { COLOR } from '../../game/types'
import type { Enemy, Shot, WeaponDef, WeaponInst, WeaponLevel } from '../../game/types'
import type { World } from '../../game/world'

// per-level tables (index = level-1)
const DMG = [11, 11, 14, 14, 14, 18, 18]
const CD = [0.9, 0.9, 0.9, 0.75, 0.75, 0.75, 0.75]
const AMT = [1, 2, 2, 2, 3, 3, 4]
const PIERCE = [1, 1, 2, 2, 2, 3, 3]
const SPEED = [560, 560, 560, 560, 560, 560, 644]

const W = COLOR.W

/** bolts leave one after another (a rattling burst) instead of as a simultaneous spread */
interface Burst {
  q: number // bolts left in the current burst
  t: number // time until the next one
  i: number // index of the next bolt
}

function draw(s: Shot) {
  const a = Math.min(1, s.life / 0.1)
  const c = Math.cos(s.rot), sn = Math.sin(s.rot)
  R.draw(Shape.Capsule, s.x - c * s.w * 1.3, s.y - sn * s.w * 1.3, s.w * 1.6, s.h * 0.6, s.rot, s.color, a * 0.3, 0.5)
  R.draw(Shape.Capsule, s.x, s.y, s.w, s.h, s.rot, s.color, a, s.glow)
  R.draw(Shape.Capsule, s.x, s.y, s.w * 0.6, s.h * 0.45, s.rot, W, a, 0)
}

/** sparks spray back off the struck surface */
function hit(s: Shot, e: Enemy, w: World) {
  const x = e.x - Math.cos(s.rot) * e.r, y = e.y - Math.sin(s.rot) * e.r
  w.part({ x, y, life: 0.1, size: s.h * 4, size1: 3, color: s.color, alpha: 0.9, shape: Shape.Glow })
  for (let i = 0; i < 3; i++) {
    const a = s.rot + Math.PI + rand(-1, 1), v = rand(140, 300)
    w.part({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.12, 0.2), size: 1.5, size1: 0, color: i ? s.color : W, glow: 1, drag: 5, stretch: 0.03 })
  }
}

/** out of range: a soft pop (spent bolts already sparked in `hit`) */
function fizzle(s: Shot, w: World) {
  if (s.pierce > 0) w.part({ x: s.x, y: s.y, life: 0.12, size: s.h * 2.5, size1: 0, color: s.color, alpha: 0.7, shape: Shape.Glow })
}

function bolt(wi: WeaponInst, w: World, s: WeaponLevel, i: number) {
  const p = w.p, side = i % 2 ? 1 : -1
  // zig-zag around the aim line and alternate barrels, so a burst reads as a stream
  const a = Math.atan2(p.aim.y, p.aim.x) + (i ? side * Math.ceil(i / 2) * 0.05 : 0)
  const c = Math.cos(a), sn = Math.sin(a)
  const x = p.x + c * 16 - sn * side * 5, y = p.y + sn * 16 + c * side * 5
  w.shot({
    x, y, vx: c * s.speed, vy: sn * s.speed, rot: a,
    r: 6 * s.area, w: 12 * s.area, h: 4 * s.area, shape: Shape.Capsule,
    dmg: s.dmg, pierce: s.pierce, life: s.duration, kb: 50, glow: 1.2, trail: wi.fuse ? 40 : 0,
    onHit: hit, onExpire: fizzle, draw,
  }, wi)
  const col = w.color(wi)
  w.part({ x, y, vx: p.vx, vy: p.vy, life: 0.08, size: 20 * s.area, size1: 6, color: col, alpha: 0.9, shape: Shape.Glow })
  w.part({ x, y, vx: p.vx, vy: p.vy, life: 0.06, size: 6 * s.area, size1: 2, color: W, glow: 1.4 })
  for (let k = 0; k < 2; k++) {
    const b = a + rand(-0.45, 0.45), v = rand(160, 300)
    w.part({ x, y, vx: Math.cos(b) * v + p.vx, vy: Math.sin(b) * v + p.vy, life: rand(0.08, 0.14), size: 1.3, size1: 0, color: col, glow: 1, drag: 8, stretch: 0.025 })
  }
  w.sfx('shoot', { vol: 0.3, pitch: 1 + i * 0.05 + rand(-0.03, 0.03) }, 0.03)
}

export default {
  id: 'pulse_bolt',
  hue: 'B',
  name: l('Pulse Bolt', '脉冲光弹'),
  desc: l('Rattles off bursts of light bolts wherever you aim.', '朝瞄准方向连射光弹，一轮接一轮。'),
  icon: '<path d="M4 22h16M10 32h12M4 42h16" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><rect x="26" y="21" width="34" height="22" rx="11" fill="currentColor"/>',
  levels: [
    l('+1 bolt per burst', '每轮连射 +1 光弹'),
    l('+3 damage, +1 pierce', '伤害 +3，贯穿 +1'),
    l('-0.15s cooldown', '冷却 -0.15 秒'),
    l('+1 bolt per burst', '每轮连射 +1 光弹'),
    l('+4 damage, +1 pierce', '伤害 +4，贯穿 +1'),
    l('+1 bolt per burst, +15% bolt speed', '每轮连射 +1 光弹，弹速 +15%'),
  ],
  stats: (lv) => ({ dmg: DMG[lv - 1], cd: CD[lv - 1], area: 1, speed: SPEED[lv - 1], amount: AMT[lv - 1], duration: 1.3, pierce: PIERCE[lv - 1] }),
  fire(wi, w, s) {
    const st = wi.state as Burst
    bolt(wi, w, s, 0)
    st.i = 1
    st.q = s.amount - 1
    st.t = Math.min(0.07, (s.cd * 0.5) / s.amount)
  },
  tick(wi, w, dt, s) {
    const st = wi.state as Burst
    if (!st.q) return
    st.t -= dt
    while (st.q > 0 && st.t <= 0) {
      bolt(wi, w, s, st.i++)
      st.q--
      st.t += Math.min(0.07, (s.cd * 0.5) / s.amount)
    }
  },
} satisfies WeaponDef
