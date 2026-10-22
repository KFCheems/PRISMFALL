import { renderer as R, Shape } from '../../core/gl'
import { l } from '../../core/i18n'
import { rand, TAU } from '../../core/math'
import { COLOR } from '../../game/types'
import type { Shot, WeaponDef, WeaponInst, WeaponLevel } from '../../game/types'
import type { World } from '../../game/world'

// per-level tables (index = level-1)
const DMG = [12, 12, 16, 16, 21, 26, 32]
const CD = [0.42, 0.4, 0.38, 0.36, 0.34, 0.32, 0.3] // seconds between blade damage ticks
const AMT = [1, 2, 2, 3, 3, 4, 5] // number of blades
const ROT = [3.4, 3.4, 3.8, 4.2, 4.6, 5.0, 5.8] // rotation speed (rad/s)
const AREA = [1, 1, 1.1, 1.1, 1.2, 1.2, 1.35]

const ORBIT = 46 // orbit radius at area 1
const BLADE = 22 // blade length at area 1
const BLADE_W = 9 // blade collision radius
const W = COLOR.W

interface Ring {
  blades: { a: number; hit: number }[] // per-blade angle and per-tick cooldown
  ang: number // shared base rotation
  s: WeaponLevel
}

/** blades are pure-visual shots; damage is dealt by tick so all blades hit at once per volley */
function drawBlade(s: Shot) {
  const d = s.data as { len: number }
  R.draw(Shape.Capsule, s.x, s.y, d.len, 3.2, s.rot, s.color, 0.35, 1.4)
  R.draw(Shape.Capsule, s.x, s.y, d.len, 1.4, s.rot, W, 0.9, 0)
  R.draw(Shape.Glow, s.x, s.y, d.len * 1.2, d.len * 1.2, 0, s.color, 0.35)
}

export default {
  id: 'blade_ring',
  hue: 'R',
  name: l('Blade Ring', '刃环'),
  desc: l('Blades of living steel wheel around you, shredding anything that draws close.', '活体钢刃环绕身周疾转，绞碎一切靠近的敌人。'),
  icon: '<circle cx="32" cy="32" r="22" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-dasharray="2 14"/><circle cx="32" cy="32" r="6" fill="currentColor"/><g fill="currentColor"><path d="M32 4l4 8h-8z"/><path d="M32 60l4-8h-8z"/><path d="M4 32l8 4v-8z"/><path d="M60 32l-8 4v-8z"/></g>',
  levels: [
    l('+1 blade', '刃 +1'),
    l('+4 damage, spins faster', '伤害 +4，转速加快'),
    l('+1 blade, +10% orbit size', '刃 +1，环绕半径 +10%'),
    l('+4 damage, spins faster', '伤害 +4，转速加快'),
    l('+1 blade, +10% orbit size', '刃 +1，环绕半径 +10%'),
    l('+6 damage, +1 blade, spins much faster, +15% orbit size', '伤害 +6，刃 +1，转速大幅加快，环绕半径 +15%'),
  ],
  stats: (lv) => ({ dmg: DMG[lv - 1], cd: CD[lv - 1], area: AREA[lv - 1], speed: ROT[lv - 1], amount: AMT[lv - 1], duration: 1, pierce: Infinity }),
  tick(wi, w, dt, s) {
    const st = wi.state as Ring
    st.s = s
    st.ang = (st.ang ?? 0) + s.speed * dt
    const n = s.amount, col = w.color(wi), p = w.p, r = ORBIT * s.area, len = BLADE * s.area
    st.blades ??= []
    // keep per-blade scratch in sync with the amount
    while (st.blades.length < n) st.blades.push({ a: 0, hit: 0 })
    if (st.blades.length > n) st.blades.length = n
    for (let i = 0; i < n; i++) {
      const b = st.blades[i]
      b.a = st.ang + (i / n) * TAU
      b.hit -= dt
      const x = p.x + Math.cos(b.a) * r, y = p.y + Math.sin(b.a) * r
      if (b.hit <= 0) {
        b.hit = s.cd
        // a blade cuts every foe its capsule overlaps
        w.inLine(p.x + Math.cos(b.a) * (r - len), p.y + Math.sin(b.a) * (r - len), p.x + Math.cos(b.a) * (r + len), p.y + Math.sin(b.a) * (r + len), BLADE_W * s.area, (e) => {
          w.damage(e, s.dmg, wi, { kb: 90, dirx: Math.cos(b.a + Math.PI / 2), diry: Math.sin(b.a + Math.PI / 2) })
          w.part({ x: e.x, y: e.y, life: 0.1, size: e.r * 1.2, size1: 0, color: W, alpha: 0.6, shape: Shape.Glow })
        })
      }
      // visual blade tracked by a persistent shot slot (recycled as the ring turns)
      drawBlade({ x, y, rot: b.a, color: col, data: { len } } as unknown as Shot)
    }
    if (wi.fuse) R.draw(Shape.Ring, p.x, p.y, r, r, 0, COLOR[wi.fuse], 0.25, 0.8, 2)
    if (Math.random() < dt * 6) {
      const a = rand(0, TAU), v = rand(40, 90)
      w.part({ x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.25, size: 1.8, size1: 0, color: col, glow: 1, drag: 3 })
    }
    w.sfx('orbit', { vol: 0.12, pitch: 1.1 }, 0.35)
  },
} satisfies WeaponDef
