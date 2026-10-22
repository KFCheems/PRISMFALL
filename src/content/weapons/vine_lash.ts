import { renderer as R, Shape } from '../../core/gl'
import { l } from '../../core/i18n'
import { ease, rand, TAU } from '../../core/math'
import type { Shot, WeaponDef } from '../../game/types'
import type { World } from '../../game/world'

// per-level tables (index = level-1)
const DMG = [16, 16, 22, 26, 26, 34, 44]
const CD = [1.05, 1.05, 1.0, 0.95, 0.9, 0.85, 0.8]
const AMT = [1, 2, 2, 2, 3, 3, 3]
const AREA = [1, 1, 1.15, 1.15, 1.15, 1.3, 1.45]

const LEN = 175 // full reach at area 1
const AMP = 9 // wave amplitude at area 1
const SEGS = 14
const LIFE = 0.34 // seconds per lash (× duration)
const OUT = 0.38 // fraction of the life spent extending
const HOLD = 0.52 // …then held until here, then retracting
const STAGGER = 0.05 // delay between the lashes of one volley
/** lash angles relative to the side being struck: forward, up/down diagonals, then the far side */
const FAN = [0, -0.55, 0.55, Math.PI, Math.PI + 0.55, Math.PI - 0.55, -1.1, 1.1, Math.PI + 1.1, Math.PI - 1.1]

/** extension 0..1 at normalized age k */
const reach = (k: number) => (k < OUT ? ease.outCubic(k / OUT) : k < HOLD ? 1 : 1 - ease.inCubic((k - HOLD) / (1 - HOLD)))

function lash(s: Shot, w: World, dt: number) {
  const d = s.data, p = w.p, wi = s.src!
  if (!p.weapons.includes(wi)) {
    s.dead = true
    return
  }
  s.x = p.x
  s.y = p.y
  if (d.delay > 0) {
    d.delay -= dt
    s.life += dt
    return
  }
  const k = 1 - s.life / s.maxLife, ext = reach(k)
  d.ext = ext
  if (!d.cracked && k >= OUT) {
    d.cracked = true
    const tx = s.x + d.cx * d.len, ty = s.y + d.cy * d.len
    w.part({ x: tx, y: ty, life: 0.22, size: 4, size1: 26 * d.area, color: s.color, alpha: 0.9, shape: Shape.Ring, glow: 1.2 })
    w.burst(tx, ty, { n: 5, color: s.color, speed: 260, life: 0.25, size: 1.8, stretch: 0.025 })
    if (d.hits) w.shake(0.06)
    w.sfx('whip', { vol: 0.45, pitch: rand(0.9, 1.1), x: tx }, 0.04)
  }
  if (ext < 0.12) return
  const len = d.len * ext, half = (AMP + 9) * d.area
  w.inLine(s.x, s.y, s.x + d.cx * len, s.y + d.cy * len, half, (e) => {
    if (!w.canHit(s, e)) return
    w.damage(e, s.dmg, wi, { kb: s.kb, dirx: d.cx, diry: d.cy })
    d.hits++
    w.burst(e.x, e.y, { n: 3, color: s.color, speed: 160, life: 0.3, size: 2.2, shape: Shape.Diamond, spin: 10 })
  })
  if (wi.fuse && Math.random() < dt * 40) w.part({ x: s.x + d.cx * len, y: s.y + d.cy * len, vx: rand(-40, 40), vy: rand(-40, 40), life: 0.3, size: 2.5, color: s.color, glow: 1 })
}

function drawVine(s: Shot, w: World) {
  const d = s.data
  if (d.delay > 0 || d.ext <= 0) return
  const c = s.color, a = d.area, len = d.len * d.ext, amp = AMP * a * (0.4 + 0.6 * d.ext)
  const cx = d.cx, cy = d.cy, ph = w.time * 26 + d.seed
  const fade = Math.min(1, d.ext * 2.5)
  let px = s.x, py = s.y
  for (let i = 1; i <= SEGS; i++) {
    const u = i / SEGS, off = Math.sin(u * 9 - ph) * amp * u * d.flip
    const x = s.x + cx * len * u - cy * off, y = s.y + cy * len * u + cx * off
    const th = (5.5 - 3.5 * u) * a
    R.line(px, py, x, y, th, c, fade, 0.9)
    R.line(px, py, x, y, th * 0.35, [1, 1, 1], fade * 0.7, 0)
    // leaves sprout on alternating sides of the vine
    if (i % 3 === 0 && i < SEGS) {
      const side = i % 2 ? 1 : -1, la = Math.atan2(y - py, x - px) + side * 0.9
      R.draw(Shape.Diamond, x + Math.cos(la) * 5 * a, y + Math.sin(la) * 5 * a, 6 * a, 2.6 * a, la, c, fade, 0.8)
    }
    px = x
    py = y
  }
  // barbed tip
  const ta = Math.atan2(cy, cx)
  R.draw(Shape.Glow, px, py, 26 * a, 26 * a, 0, c, 0.45 * fade)
  R.draw(Shape.Tri, px, py, 6.5 * a, 6.5 * a, ta, c, fade, 1.3)
  R.draw(Shape.Tri, px, py, 3 * a, 3 * a, ta, [1, 1, 1], fade, 0)
}

export default {
  id: 'vine_lash',
  hue: 'G',
  name: l('Vine Lash', '藤鞭'),
  desc: l('A thorned vine cracks left, then right, through everything in its path. Extra projectiles add diagonal lashes.', '带刺藤鞭左右交替抽打，横扫路径上的一切。额外弹体会追加斜向鞭击。'),
  icon: '<path d="M8 40c8-14 14-14 20 0s12 14 18 0 8-14 12-6" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path d="M58 34l-12-6 2 13z" fill="currentColor"/><path d="M18 31l-4-9M38 47l3 9" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>',
  levels: [
    l('+1 diagonal lash', '+1 道斜向鞭击'),
    l('+6 damage, +15% area', '伤害 +6，范围 +15%'),
    l('+6 damage, lashes faster', '伤害 +6，抽打加快'),
    l('+1 diagonal lash', '+1 道斜向鞭击'),
    l('+10 damage, +15% area', '伤害 +10，范围 +15%'),
    l('+12 damage, +15% area, lashes faster', '伤害 +12，范围 +15%，抽打加快'),
  ],
  stats: (lv) => ({ dmg: DMG[lv - 1], cd: CD[lv - 1], area: AREA[lv - 1], speed: 0, amount: AMT[lv - 1], duration: 1, pierce: Infinity }),
  fire(wi, w, s) {
    const st = wi.state
    st.side = st.side === 1 ? -1 : 1
    const base = st.side === 1 ? 0 : Math.PI, n = Math.min(s.amount, FAN.length), life = LIFE * Math.max(0.6, s.duration)
    for (let i = 0; i < n; i++) {
      const a = base + FAN[i]
      w.shot({
        r: 0, dmg: s.dmg, pierce: Infinity, life, kb: 90, noCollide: true, update: lash, draw: drawVine,
        data: { cx: Math.cos(a), cy: Math.sin(a), len: LEN * s.area, area: s.area, delay: i * STAGGER, ext: 0, hits: 0, cracked: false, seed: rand(0, TAU), flip: st.side },
      }, wi)
    }
  },
} satisfies WeaponDef
