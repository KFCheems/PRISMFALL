import { renderer as R, Shape } from '../../core/gl'
import { l } from '../../core/i18n'
import { rand, TAU } from '../../core/math'
import { COLOR } from '../../game/types'
import type { Shot, WeaponDef, WeaponLevel } from '../../game/types'
import type { World } from '../../game/world'

// per-level tables (index = level-1)
const DMG = [12, 12, 16, 16, 22, 30, 38]
const CD = [1.5, 1.5, 1.5, 1.3, 1.3, 1.2, 1.1]
const AREA = [1, 1.1, 1.1, 1.2, 1.2, 1.35, 1.5]
const AMT = [1, 1, 2, 2, 3, 3, 4] // shockwaves per pulse

const RING_R = 120 // max radius of a shockwave at area 1
const GROW = 420 // expansion speed (world units/s) — controls how thick a "hit shell" the wave is
const THICK = 30 // hit-shell thickness at area 1
const W = COLOR.W

/** the shockwave travels outward; enemies are damaged as the front passes them, once per wave */
function wave(s: Shot, w: World, dt: number) {
  const wi = s.src!
  if (!w.p.weapons.includes(wi)) return void (s.dead = true)
  const d = s.data as { max: number; dmg: number }
  s.x = w.p.x
  s.y = w.p.y
  // r grows from 0 → max over the wave's lifetime
  const k = 1 - s.life / s.maxLife, r = d.max * k
  // damage only when the expanding front reaches each enemy (once per wave via canHit)
  w.inRadius(s.x, s.y, r + THICK, (e) => {
    const dist = Math.hypot(e.x - s.x, e.y - s.y)
    if (dist < r - THICK) return // front already passed — this enemy was caught earlier
    if (!w.canHit(s, e)) return
    const dx = e.x - s.x, dy = e.y - s.y, len = Math.hypot(dx, dy) || 1
    w.damage(e, d.dmg, wi, { kb: 340, dirx: dx, diry: dy })
    w.part({ x: e.x, y: e.y, life: 0.2, size: e.r * 1.5, size1: 0, color: W, alpha: 0.8, shape: Shape.Glow })
    w.burst(e.x, e.y, { n: 3, color: s.color, speed: 220, life: 0.25, size: 2, stretch: 0.03 })
  })
}

function drawWave(s: Shot) {
  const k = 1 - s.life / s.maxLife, d = s.data as { max: number }
  const r = d.max * k, a = 1 - k
  R.draw(Shape.Ring, s.x, s.y, r, r, 0, s.color, a * 0.95, 1.6, Math.max(2, 18 * (1 - k * 0.5)))
  R.draw(Shape.Ring, s.x, s.y, r * 0.92, r * 0.92, 0, W, a * 0.5, 1, 2)
  R.draw(Shape.Glow, s.x, s.y, r * 0.25, r * 0.25, 0, s.color, a * 0.3)
}

export default {
  id: 'nova_pulse',
  hue: 'R',
  name: l('Nova Pulse', '新星脉冲'),
  desc: l('A ring of force erupts from you, flinging back everything it touches.', '力场冲击环从脚下炸开，将触及的一切轰然击飞。'),
  icon: '<circle cx="32" cy="32" r="9" fill="currentColor"/><circle cx="32" cy="32" r="20" fill="none" stroke="currentColor" stroke-width="4" opacity="0.7"/><circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" stroke-width="4" stroke-dasharray="3 7" opacity="0.5"/><g fill="currentColor"><path d="M32 2l3 6-6 0z"/><path d="M32 62l3-6-6 0z"/><path d="M2 32l6 3 0-6z"/><path d="M62 32l-6 3 0-6z"/></g>',
  levels: [
    l('+10% radius', '半径 +10%'),
    l('+4 damage', '伤害 +4'),
    l('+1 shockwave per pulse', '每次脉冲 +1 冲击环'),
    l('+10% radius, -0.2s cooldown', '半径 +10%，冷却 -0.2 秒'),
    l('+6 damage, +1 shockwave', '伤害 +6，冲击环 +1'),
    l('+8 damage, +15% radius, -0.15s cooldown', '伤害 +8，半径 +15%，冷却 -0.15 秒'),
  ],
  stats: (lv) => ({ dmg: DMG[lv - 1], cd: CD[lv - 1], area: AREA[lv - 1], speed: GROW, amount: AMT[lv - 1], duration: 0.55, pierce: Infinity }),
  fire(wi, w, s) {
    const p = w.p, col = w.color(wi)
    for (let i = 0; i < s.amount; i++) {
      // stagger extra waves slightly so they read as a pulsing corona, not one flat ring;
      // follow-up waves fall off steeply so extra rings add coverage, not raw multiplier
      const delay = i * 0.09
      w.shot({
        x: p.x, y: p.y, r: 0, life: s.duration + delay, pierce: Infinity, noCollide: true, color: col,
        data: { max: RING_R * s.area * (1 - delay * 0.15), dmg: s.dmg * (1 - i * 0.28) }, update: wave, draw: drawWave,
      }, wi)
    }
    w.part({ x: p.x, y: p.y, life: 0.18, size: 22, size1: 6, color: col, alpha: 0.9, shape: Shape.Glow })
    if (wi.fuse) w.flash(COLOR[wi.fuse], 0.05)
    w.sfx('pulse', { vol: 0.5, pitch: rand(0.85, 1) }, 0.05)
  },
} satisfies WeaponDef
