import { renderer as R, Shape } from '../../core/gl'
import { l } from '../../core/i18n'
import { ease, rand, TAU } from '../../core/math'
import { COLOR } from '../../game/types'
import type { Shot, WeaponDef, WeaponLevel } from '../../game/types'
import type { World } from '../../game/world'

// per-level tables (index = level-1)
const DMG = [16, 16, 20, 20, 26, 26, 34]
const CD = [1.6, 1.6, 1.6, 1.45, 1.45, 1.35, 1.25]
const AREA = [1, 1, 1, 1.15, 1.15, 1.3, 1.5] // blast radius
const AMT = [1, 2, 2, 2, 3, 3, 4] // shells per volley

const FLIGHT = 0.55 // seconds the shell hangs in the air
const BLAST = 58 // explosion radius at area 1
const W = COLOR.W

/** a lobbed shell: falls onto a preselected spot, then the telegraphed ring detonates */
function shell(s: Shot, w: World, dt: number) {
  if (!w.p.weapons.includes(s.src!)) return void (s.dead = true)
  const d = s.data as { tx: number; ty: number; ox: number; oy: number; t: number; blast: number }
  d.t += dt
  const k = Math.min(1, d.t / FLIGHT)
  // arc: horizontal eases, vertical lifts into a lob then drops
  const hk = ease.outCubic(k), lift = Math.sin(k * Math.PI) * 70
  s.x = d.ox + (d.tx - d.ox) * hk
  s.y = d.oy + (d.ty - d.oy) * hk - lift
  s.spin = 6
}

/** the shell cracks open: real blast + a hot landing scar */
function burst(s: Shot, w: World) {
  const d = s.data as { tx: number; ty: number; blast: number; dmg: number }
  const wi = s.src!, col = s.color
  w.explode(d.tx, d.ty, d.blast, d.dmg, wi, col, wi.fuse ?? undefined)
  for (let i = 0; i < 8; i++) {
    const a = rand(0, TAU), v = rand(120, 360)
    w.part({ x: d.tx, y: d.ty, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.3, 0.6), size: rand(2, 4), size1: 0, color: i % 2 ? col : COLOR.Y, glow: 1, drag: 3 })
  }
  w.part({ x: d.tx, y: d.ty, life: 0.4, size: d.blast * 0.3, size1: d.blast * 1.4, color: COLOR.Y, alpha: 0.8, shape: Shape.Ring, glow: 1 })
  w.shake(0.1)
  w.sfx('explode', { vol: 0.5, pitch: rand(0.85, 1), x: d.tx }, 0.05)
}

function drawShell(s: Shot) {
  const d = s.data as { t: number }
  const k = Math.min(1, d.t / FLIGHT)
  // glint of an aiming laser on the ground below the falling shell
  R.draw(Shape.Glow, s.x, s.y, 14, 14, 0, s.color, 0.9)
  R.draw(Shape.Circle, s.x, s.y, 4.5, 4.5, 0, W, 1, 0.8)
  // trailing embers from the fuse
  R.draw(Shape.Circle, s.x - s.vx * 0.01, s.y - s.vy * 0.01, 2, 2, 0, COLOR.Y, 0.5 * (1 - k))
}

export default {
  id: 'ember_mortar',
  hue: 'R',
  name: l('Ember Mortar', '余烬迫击炮'),
  desc: l('Loft smoldering shells that come down on distant foes and burst into cinders.', '抛射燃烧的炮弹，砸向远处的敌人并炸出漫天火星。'),
  icon: '<path d="M32 6v18" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path d="M14 24h36l-6 16H20z" fill="currentColor"/><path d="M24 40c0 8 4 14 8 16 4-2 8-8 8-16" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><circle cx="32" cy="46" r="4" fill="currentColor"/>',
  levels: [
    l('+1 shell per volley', '每次齐射 +1 发'),
    l('+4 damage', '伤害 +4'),
    l('+15% blast, -0.2s cooldown', '爆炸范围 +15%，冷却 -0.2 秒'),
    l('+6 damage, +1 shell', '伤害 +6，弹体 +1'),
    l('+15% blast, -0.15s cooldown', '爆炸范围 +15%，冷却 -0.15 秒'),
    l('+8 damage, +1 shell, +20% blast', '伤害 +8，弹体 +1，爆炸范围 +20%'),
  ],
  stats: (lv) => ({ dmg: DMG[lv - 1], cd: CD[lv - 1], area: AREA[lv - 1], speed: 0, amount: AMT[lv - 1], duration: FLIGHT, pierce: 1 }),
  fire(wi, w, s) {
    const p = w.p, col = w.color(wi), blast = BLAST * s.area
    const picked: { x: number; y: number }[] = []
    for (let i = 0; i < s.amount; i++) {
      const e = w.randomEnemy(true), tx = e ? e.x : p.x + p.aim.x * 160 + rand(-60, 60), ty = e ? e.y : p.y + p.aim.y * 160 + rand(-60, 60)
      picked.push({ x: tx, y: ty })
      w.shot({
        x: p.x, y: p.y, r: blast * 0.5, life: FLIGHT, pierce: Infinity, noCollide: true, color: col,
        data: { ox: p.x, oy: p.y, tx, ty, t: 0, blast, dmg: s.dmg }, update: shell, draw: drawShell, onExpire: burst,
      }, wi)
      // telegraph ring under the impact point while the shell is airborne
      w.hazard({ kind: 'circle', x: tx, y: ty, r: blast, delay: FLIGHT, active: 0.06, dmg: 0, color: col })
    }
    // muzzle puff + recoil smoke
    w.part({ x: p.x, y: p.y, life: 0.2, size: 30, size1: 8, color: col, alpha: 0.7, shape: Shape.Glow })
    w.burst(p.x, p.y, { n: 6, color: COLOR.Y, speed: 180, life: 0.3, size: 2, stretch: 0.02 })
    w.sfx('mortar', { vol: 0.45, pitch: rand(0.9, 1.1) }, 0.04)
    if (wi.fuse) w.part({ x: p.x, y: p.y, life: 0.3, size: 10, size1: blast * 0.5, color: COLOR[wi.fuse], alpha: 0.5, shape: Shape.Ring })
  },
} satisfies WeaponDef
