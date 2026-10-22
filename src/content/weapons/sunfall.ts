import { renderer as R, Shape } from '../../core/gl'
import { l } from '../../core/i18n'
import { clamp, rand, TAU } from '../../core/math'
import { COLOR } from '../../game/types'
import type { Shot, WeaponDef, WeaponLevel } from '../../game/types'
import type { World } from '../../game/world'

// per-level tables (index = level-1)
const DMG = [26, 26, 33, 33, 42, 52, 64]
const CD = [1.9, 1.9, 1.9, 1.65, 1.65, 1.5, 1.4]
const AMT = [1, 2, 2, 3, 3, 3, 4] // pillars per cast
const AREA = [1, 1, 1.1, 1.1, 1.2, 1.3, 1.45]

const GLYPH = 0.55 // seconds the target glyph burns before the pillar slams down
const BEAM_R = 34 // pillar radius at area 1
const W = COLOR.W

interface Drop {
  x: number
  y: number
  t: number
  r: number
  dmg: number
  struck?: boolean
}

/** the whole cast lives on one driving shot; per-target sub-state tracks the telegraph then the strike */
function drawDrop(s: Shot) {
  const d = s.data as Drop
  if (d.t < GLYPH) {
    const k = d.t / GLYPH, pulse = 0.35 + 0.65 * Math.abs(Math.sin(d.t * 14))
    // glyph: a shrinking targeting ring plus rotating runes
    R.draw(Shape.Ring, d.x, d.y, d.r, d.r, 0, s.color, 0.3 + 0.5 * pulse, 1.4, 2)
    R.draw(Shape.Ring, d.x, d.y, d.r * (1.4 - 0.4 * k), d.r * (1.4 - 0.4 * k), 0, s.color, 0.5 * k, 1, 1.5)
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + d.t * 3
      R.draw(Shape.Diamond, d.x + Math.cos(a) * d.r * 0.7, d.y + Math.sin(a) * d.r * 0.7, 3, 5, a, s.color, 0.8 * pulse, 1)
    }
    R.draw(Shape.Glow, d.x, d.y, d.r * 0.8, d.r * 0.8, 0, s.color, 0.25 * k)
    return
  }
  // pillar: bright column flaring on impact, fading quickly
  const life = s.life, fall = clamp(life / 0.35, 0, 1)
  R.draw(Shape.Capsule, d.x, d.y - 260 * fall, 260, d.r * 0.55 * life, Math.PI / 2, s.color, 0.55 * life, 1.4)
  R.draw(Shape.Capsule, d.x, d.y - 260 * fall, 260, d.r * 0.25 * life, Math.PI / 2, W, 0.8 * life, 0)
  R.draw(Shape.Glow, d.x, d.y, d.r * 1.6, d.r * 1.6, 0, s.color, 0.7 * life)
  R.draw(Shape.Ring, d.x, d.y, d.r * (2.2 - 1.2 * (1 - life)), d.r * (2.2 - 1.2 * (1 - life)), 0, s.color, life, 1, 3)
}

function drive(s: Shot, w: World, dt: number) {
  const wi = s.src!
  if (!w.p.weapons.includes(wi)) return void (s.dead = true)
  const d = s.data as Drop
  d.t += dt
  if (d.t < GLYPH) return
  if (!d.struck) {
    d.struck = true
    const col = s.color
    w.inRadius(d.x, d.y, d.r, (e) => void w.damage(e, d.dmg, wi, { kb: 120, dirx: e.x - d.x, diry: e.y - d.y }))
    w.part({ x: d.x, y: d.y, life: 0.4, size: d.r * 0.6, size1: d.r * 1.8, color: col, alpha: 0.9, shape: Shape.Ring, glow: 1 })
    w.burst(d.x, d.y, { n: 10, color: COLOR.Y, speed: 260, life: 0.4, size: 2.4, stretch: 0.03 })
    w.shake(0.08)
    w.sfx('explodeBig', { vol: 0.35, pitch: rand(1.1, 1.3), x: d.x }, 0.04)
  }
}

export default {
  id: 'sunfall',
  hue: 'R',
  name: l('Sunfall', '日陨'),
  desc: l('Heaven brands its mark on distant foes, then slams down pillars of searing light.', '苍天为敌烙下标记，随即降下灼目的光柱将其贯穿。'),
  icon: '<path d="M32 3v10M32 51v10M3 32h10M51 32h10M11 11l7 7M46 46l7 7M53 11l-7 7M18 46l-7 7" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><circle cx="32" cy="32" r="12" fill="currentColor"/><path d="M26 60l6-10 6 10" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/>',
  levels: [
    l('+1 pillar per cast', '每次施放 +1 光柱'),
    l('+7 damage', '伤害 +7'),
    l('+10% strike radius, casts faster', '打击半径 +10%，施放加快'),
    l('+1 pillar, +9 damage', '光柱 +1，伤害 +9'),
    l('+10 damage, +10% strike radius', '伤害 +10，打击半径 +10%'),
    l('+12 damage, casts faster, +15% radius', '伤害 +12，施放加快，半径 +15%'),
  ],
  stats: (lv) => ({ dmg: DMG[lv - 1], cd: CD[lv - 1], area: AREA[lv - 1], speed: 0, amount: AMT[lv - 1], duration: GLYPH + 0.45, pierce: 1 }),
  fire(wi, w, s) {
    const p = w.p, col = w.color(wi), r = BEAM_R * s.area
    for (let i = 0; i < s.amount; i++) {
      const e = w.randomEnemy(true)
      const x = e ? e.x : p.x + rand(-180, 180), y = e ? e.y : p.y + rand(-180, 180)
      w.shot({
        x, y, r, life: GLYPH + 0.45, pierce: Infinity, noCollide: true, color: col,
        data: { x, y, t: 0, r, dmg: s.dmg } satisfies Drop, update: drive, draw: drawDrop,
      }, wi)
    }
    if (wi.fuse) w.part({ x: p.x, y: p.y, life: 0.35, size: 20, size1: 160 * s.area, color: COLOR[wi.fuse], alpha: 0.4, shape: Shape.Ring })
    w.sfx('charge', { vol: 0.3, pitch: 1.3 }, 0.1)
  },
  unlock: 'clear_crimson',
} satisfies WeaponDef
