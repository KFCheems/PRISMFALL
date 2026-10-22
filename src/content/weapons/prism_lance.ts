import { renderer as R, Shape } from '../../core/gl'
import { l } from '../../core/i18n'
import { hex, rand, TAU, type RGB } from '../../core/math'
import { COLOR, fuseParts } from '../../game/types'
import type { Shot, WeaponDef, WeaponLevel } from '../../game/types'
import type { World } from '../../game/world'

// per-level tables (index = level-1)
const DMG = [22, 28, 28, 28, 36, 36, 44]
const CD = [1.7, 1.7, 1.7, 1.45, 1.45, 1.45, 1.3]
const AMT = [1, 1, 2, 2, 2, 3, 3]
const AREA = [1, 1, 1, 1.15, 1.15, 1.15, 1.3]

const CHARGE = 0.25 // glint before the beam fires
const SPREAD = 0.16 // radians between fanned beams (several converge on big targets)
const LEN = 540 // beam length at area 1
const HALF_W = 9 // beam half width at area 1
const MUZZLE = 16
const W = COLOR.W
const VIOLET = hex('#8f6bff')

interface Beam {
  len: number
  hw: number
  fa: RGB // dispersion fringe on either side of the core
  fb: RGB
}

const beamAngle = (base: number, i: number, n: number) => base + (i - (n - 1) / 2) * SPREAD

/** charge-up: a star glint at the muzzle and faint sight lines where the lance will strike */
function glint(g: Shot, w: World) {
  const p = w.p, s = g.data as WeaponLevel
  const k = 1 - g.life / g.maxLife, z = s.area
  const base = Math.atan2(p.aim.y, p.aim.x)
  const x = p.x + p.aim.x * MUZZLE, y = p.y + p.aim.y * MUZZLE
  R.draw(Shape.Glow, x, y, 34 * z * k, 34 * z * k, 0, g.color, 0.7 * k)
  R.draw(Shape.Star, x, y, (3 + 6 * k) * z, (3 + 6 * k) * z, g.rot, W, k, 1.2)
  R.draw(Shape.Capsule, x, y, 28 * z * k, 1.3, base, W, k, 1)
  R.draw(Shape.Capsule, x, y, 12 * z * k, 1.3, base + Math.PI / 2, W, k * 0.8, 1)
  const len = LEN * z
  for (let i = 0; i < s.amount; i++) {
    const a = beamAngle(base, i, s.amount)
    R.line(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, 1.2, g.color, 0.18 * k, 0)
  }
}

/** the beam stays rooted to the player while it fades */
function anchor(s: Shot, w: World) {
  s.x = w.p.x + Math.cos(s.rot) * MUZZLE
  s.y = w.p.y + Math.sin(s.rot) * MUZZLE
}

function beam(s: Shot) {
  const b = s.data as Beam, k = s.life / s.maxLife
  const c = Math.cos(s.rot), sn = Math.sin(s.rot), half = b.len / 2
  const cx = s.x + c * half, cy = s.y + sn * half
  const snap = 1 + Math.max(0, k - 0.75) * 3 // over-bright pop on the first frames
  const hw = b.hw * (0.3 + 0.7 * k) * snap
  R.draw(Shape.Capsule, cx, cy, half, hw * 1.8, s.rot, s.color, 0.35 * k, 1.5)
  R.draw(Shape.Capsule, cx, cy, half, hw, s.rot, s.color, k, 1.2)
  R.draw(Shape.Capsule, cx, cy, half, hw * 0.42, s.rot, W, k, 0.3)
  const ox = -sn * hw * 1.35, oy = c * hw * 1.35
  R.draw(Shape.Capsule, cx + ox, cy + oy, half, 1.3, s.rot, b.fa, 0.6 * k, 0.8)
  R.draw(Shape.Capsule, cx - ox, cy - oy, half, 1.3, s.rot, b.fb, 0.6 * k, 0.8)
  // light facets racing down the beam
  const age = s.maxLife - s.life
  for (let i = 0; i < 6; i++) {
    const t = (i / 6 + age * 3) % 1
    R.draw(Shape.Diamond, s.x + c * b.len * t, s.y + sn * b.len * t, 5 * k, 2 * k, s.rot, W, k, 1)
  }
  R.draw(Shape.Glow, s.x, s.y, b.hw * 6 * snap, b.hw * 6 * snap, 0, s.color, k)
  R.draw(Shape.Glow, s.x + c * b.len, s.y + sn * b.len, b.hw * 4 * k, b.hw * 4 * k, 0, s.color, 0.8 * k)
}

/** end of the charge: re-aim and strike every foe along each line at once */
function release(g: Shot, w: World) {
  const wi = g.src!, s = g.data as WeaponLevel, p = w.p
  if (p.dead || !p.weapons.includes(wi)) return
  const base = Math.atan2(p.aim.y, p.aim.x), len = LEN * s.area, hw = HALF_W * s.area, col = g.color
  const [fa, fb] = wi.fuse ? fuseParts(wi.fuse).map((h) => COLOR[h]) : [COLOR.C, VIOLET]
  let hits = 0
  for (let i = 0; i < s.amount; i++) {
    const a = beamAngle(base, i, s.amount)
    const c = Math.cos(a), sn = Math.sin(a)
    const x = p.x + c * MUZZLE, y = p.y + sn * MUZZLE
    w.inLine(x, y, x + c * len, y + sn * len, hw, (e) => {
      w.damage(e, s.dmg, wi, { kb: 90, dirx: c, diry: sn })
      if (hits++ > 30) return
      w.part({ x: e.x, y: e.y, life: 0.18, size: e.r * 1.6, size1: 0, color: col, alpha: 0.8, shape: Shape.Glow })
      w.burst(e.x, e.y, { n: 3, color: col, speed: 220, life: 0.22, size: 1.6, stretch: 0.025 })
    })
    w.shot({ x, y, rot: a, r: hw, life: 0.22, pierce: Infinity, noCollide: true, data: { len, hw, fa, fb } satisfies Beam, update: anchor, draw: beam }, wi)
  }
  w.part({ x: p.x, y: p.y, vx: p.vx, vy: p.vy, life: 0.16, size: 60 * s.area, size1: 10, color: col, alpha: 0.8, shape: Shape.Glow })
  w.part({ x: p.x + p.aim.x * MUZZLE, y: p.y + p.aim.y * MUZZLE, life: 0.22, size: 8, size1: 34 * s.area, color: W, alpha: 0.7, shape: Shape.Ring, glow: 1 })
  w.shake(0.06 + Math.min(hits, 20) * 0.006)
  if (hits >= 10) w.hitstop(0.02)
  w.sfx('laser', { vol: 0.55, pitch: rand(0.95, 1.05) })
}

export default {
  id: 'prism_lance',
  hue: 'B',
  name: l('Prism Lance', '棱镜长枪'),
  desc: l('A heartbeat of charge, then a piercing beam that cuts through every foe in line.', '蓄能一瞬，随即射出贯穿光束，直线上的敌人无一幸免。'),
  icon: '<path d="M8 50L20 14l12 36z" fill="none" stroke="currentColor" stroke-width="5" stroke-linejoin="round"/><path d="M28 32h30" stroke="currentColor" stroke-width="9" stroke-linecap="round"/>',
  levels: [
    l('+6 damage', '伤害 +6'),
    l('+1 beam', '光束 +1'),
    l('-0.25s cooldown, +15% beam size', '冷却 -0.25 秒，光束尺寸 +15%'),
    l('+8 damage', '伤害 +8'),
    l('+1 beam', '光束 +1'),
    l('+8 damage, -0.15s cooldown, +15% beam size', '伤害 +8，冷却 -0.15 秒，光束尺寸 +15%'),
  ],
  stats: (lv) => ({ dmg: DMG[lv - 1], cd: CD[lv - 1], area: AREA[lv - 1], speed: 0, amount: AMT[lv - 1], duration: 1, pierce: Infinity }),
  fire(wi, w, s) {
    const p = w.p, col = w.color(wi)
    w.shot({ r: 1, life: CHARGE, pierce: Infinity, noCollide: true, spin: 9, data: s, draw: glint, onExpire: release }, wi)
    // motes of light drawn into the muzzle
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + rand(0, 0.5), d = 50 * s.area, v = (d * 0.9) / CHARGE
      w.part({ x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d, vx: p.vx - Math.cos(a) * v, vy: p.vy - Math.sin(a) * v, drag: 0, life: CHARGE, size: 2.4, size1: 0.8, color: col, glow: 1, stretch: 0.012 })
    }
    w.part({ x: p.x, y: p.y, vx: p.vx, vy: p.vy, drag: 0, life: CHARGE, size: 34 * s.area, size1: 4, color: col, alpha: 0.6, shape: Shape.Ring, glow: 1 })
    w.sfx('beam', { vol: 0.25, pitch: 1.7 })
  },
} satisfies WeaponDef
