import { renderer as R, Shape } from '../../core/gl'
import { l } from '../../core/i18n'
import { clamp, damp, rand, TAU } from '../../core/math'
import { COLOR } from '../../game/types'
import type { Shot, WeaponDef, WeaponInst, WeaponLevel } from '../../game/types'
import type { World } from '../../game/world'

// per-level tables (index = level-1)
const DMG = [12, 12, 16, 16, 22, 28, 36]
const CD = [0.75, 0.75, 0.75, 0.65, 0.65, 0.55, 0.5] // seconds between a sentinel's shots
const AMT = [1, 2, 2, 2, 3, 3, 4] // sentinels per cast
const AREA = [1, 1, 1.1, 1.1, 1.2, 1.2, 1.35]
const DUR = [4, 4, 4, 5, 5, 6, 7] // seconds a sentinel lives

const RANGE = 210 // target range at area 1
const PETAL = 11 // sentinel size at area 1
const BOLT_SPD = 520
const W = COLOR.W

interface Garden {
  s: WeaponLevel
  flower: number // shared petal rotation
}

interface Sentinel {
  t: number // time until the next shot
  life: number // remaining lifetime
  bloom: number // 0 → 1 sprout animation
  seed: number // per-sentinel phase offset
  dur: number // full lifetime, for the wither fade
}

function launch(wi: WeaponInst, w: World, x: number, y: number, life: number): Shot {
  return w.shot({
    x, y, r: PETAL, life, pierce: Infinity, noCollide: true, kb: 0,
    data: { t: rand(0.1, 0.4), life, bloom: 0, seed: rand(0, TAU), dur: life } satisfies Sentinel, update: fire, draw: drawSentinel,
  }, wi)
}

/** sentinel brain: settle, track nearest foe, and spit darts on its own cooldown */
function fire(d: Shot, w: World, dt: number) {
  const wi = d.src!, g = wi.state as Garden, s = g.s, D = d.data as Sentinel
  if (!w.p.weapons.includes(wi)) return void (d.dead = true)
  d.color = w.color(wi)
  D.life -= dt
  D.bloom = Math.min(1, D.bloom + dt * 4)
  if (D.life <= 0) return void (d.dead = true)
  D.t -= dt
  if (D.t > 0) return
  const e = w.nearest(d.x, d.y, RANGE * s.area)
  if (!e) return void (D.t = 0.12)
  D.t = s.cd * rand(0.9, 1.1)
  const dx = e.x - d.x, dy = e.y - d.y, len = Math.hypot(dx, dy) || 1, c = dx / len, sn = dy / len
  w.shot({
    x: d.x + c * PETAL * 0.8, y: d.y + sn * PETAL * 0.8, vx: c * BOLT_SPD, vy: sn * BOLT_SPD, rot: Math.atan2(sn, c),
    r: 5 * s.area, w: 9 * s.area, h: 3 * s.area, shape: Shape.Diamond, dmg: s.dmg, pierce: s.pierce, life: 0.9, kb: 40, glow: 1.1,
    trail: wi.fuse ? 24 : 0,
  }, wi)
  w.part({ x: d.x, y: d.y, life: 0.1, size: PETAL * s.area * 1.6, size1: 3, color: d.color, alpha: 0.9, shape: Shape.Glow })
  w.sfx('turret', { vol: 0.28, pitch: rand(1.1, 1.35), x: d.x }, 0.05)
}

function drawSentinel(d: Shot, w: World) {
  const D = d.data as Sentinel, s = (d.src!.state as Garden).s, z = PETAL * s.area * (0.4 + 0.6 * D.bloom)
  const fade = clamp(D.life / Math.min(0.6, D.dur), 0, 1) // dim as it withers
  const rot = D.seed + w.time * 1.6, c = d.color
  // stem
  R.draw(Shape.Capsule, d.x, d.y + z, z * 0.9, 1.8 * D.bloom, Math.PI / 2, c, 0.5 * fade, 0.6)
  // petals fanning out around the core
  for (let i = 0; i < 6; i++) {
    const a = rot + (i / 6) * TAU
    R.draw(Shape.Diamond, d.x + Math.cos(a) * z * 0.9, d.y + Math.sin(a) * z * 0.9, z * 0.5, z * 0.75, a, c, 0.7 * fade, 0.6)
  }
  R.draw(Shape.Glow, d.x, d.y, z * 1.6, z * 1.6, 0, c, 0.3 * D.bloom * fade)
  R.draw(Shape.Circle, d.x, d.y, z * 0.5, z * 0.5, 0, c, 1 * fade, 1.2)
  R.draw(Shape.Circle, d.x, d.y, z * 0.24, z * 0.24, 0, W, 1 * fade, 0)
}

export default {
  id: 'bloom_turret',
  hue: 'G',
  name: l('Bloom Sentinel', '绽放哨卫'),
  desc: l('Plants flowering sentinels that blossom and spit thorns at every foe in reach.', '种下绽放的哨卫，花开之时朝射程内的敌人连吐荆棘。'),
  icon: '<path d="M32 32v26" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path d="M32 50c-8-2-14-8-14-16 8 0 14 6 14 16zM32 50c8-2 14-8 14-16-8 0-14 6-14 16z" fill="currentColor" opacity="0.7"/><g fill="currentColor"><circle cx="32" cy="20" r="6"/><path d="M32 8c3 4 3 8 0 10-3-2-3-6 0-10zM32 32c3-4 3-8 0-10-3 2-3 6 0 10zM20 20c4 3 8 3 10 0-2-3-6-3-10 0zM44 20c-4-3-8-3-10 0 2 3 6 3 10 0z"/></g>',
  levels: [
    l('+1 sentinel per cast', '每次施放 +1 哨卫'),
    l('+4 damage', '伤害 +4'),
    l('+10% range, -0.1s shot cooldown', '射程 +10%，射击冷却 -0.1 秒'),
    l('+1 sentinel, lasts 1s longer', '哨卫 +1，持续时间 +1 秒'),
    l('+6 damage, +10% range', '伤害 +6，射程 +10%'),
    l('+1 sentinel, +8 damage, lasts 1s longer, shoots faster', '哨卫 +1，伤害 +8，持续 +1 秒，射速加快'),
  ],
  stats: (lv) => ({ dmg: DMG[lv - 1], cd: CD[lv - 1], area: AREA[lv - 1], speed: BOLT_SPD, amount: AMT[lv - 1], duration: DUR[lv - 1], pierce: 1 }),
  tick(wi, w, dt, s) {
    const g = wi.state as Garden
    g.s = s
    g.flower = (g.flower ?? 0) + dt * 2
    // prune any sentinels that died or exceed the current count, and keep their lifetime in step with the stat block
    const live = w.shots.filter((q) => q.src === wi && !q.dead)
    while (live.length > s.amount) live.pop()!.dead = true
    for (const q of live) (q.data as Sentinel).life = Math.min((q.data as Sentinel).life, s.duration)
  },
  fire(wi, w, s) {
    const p = w.p, col = w.color(wi), base = Math.atan2(p.aim.y, p.aim.x)
    // top the garden up to `amount` sentinels instead of replanting the whole bed on every cooldown
    const live = w.shots.filter((q) => q.src === wi && !q.dead).length
    for (let i = live; i < s.amount; i++) {
      // scatter sentinels in a loose arc ahead of the player so they cover ground
      const a = base + (i - (s.amount - 1) / 2) * 0.7 + rand(-0.2, 0.2), d = rand(46, 90) * s.area
      const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d
      w.part({ x, y, life: 0.35, size: PETAL * s.area * 0.4, size1: PETAL * s.area * 1.6, color: col, alpha: 0.8, shape: Shape.Ring, glow: 1 })
      w.burst(x, y, { n: 5, color: COLOR.G, speed: 90, life: 0.4, size: 2 })
      launch(wi, w, x, y, s.duration)
    }
    w.sfx('plant', { vol: 0.4, pitch: rand(1, 1.2) }, 0.05)
  },
} satisfies WeaponDef
