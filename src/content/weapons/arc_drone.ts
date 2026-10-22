import { renderer as R, Shape } from '../../core/gl'
import { l } from '../../core/i18n'
import { clamp, damp, rand, TAU } from '../../core/math'
import { COLOR } from '../../game/types'
import type { Shot, WeaponDef, WeaponInst, WeaponLevel } from '../../game/types'
import type { World } from '../../game/world'

// per-level tables (index = level-1)
const DMG = [12, 12, 17, 17, 17, 22, 22]
const CD = [0.9, 0.9, 0.9, 0.75, 0.75, 0.75, 0.65] // seconds between zaps, per drone
const AMT = [1, 2, 2, 2, 3, 3, 3]
const CHAIN = [0, 0, 1, 1, 1, 1, 3] // extra foes a zap arcs to (stored as pierce, so +pierce passives add jumps)
const AREA = [1, 1, 1, 1, 1, 1.15, 1.15]

const ORBIT = 52 // orbit radius at area 1
const RANGE = 190 // zap reach from the drone to the foe's edge, at area 1
const BIG = 60 // widest foe considered (bosses)
const SIZE = 6.5
const W = COLOR.W

interface Fleet {
  drones: Shot[]
  ang: number // shared orbit phase
  s: WeaponLevel // latest stat block (refreshed by tick)
}

interface Drone {
  i: number // slot in the formation
  t: number // time until the next zap
  flash: number
}

function launch(wi: WeaponInst, w: World) {
  const p = w.p
  w.burst(p.x, p.y, { n: 8, color: w.color(wi), speed: 160, life: 0.3, size: 2 })
  w.sfx('drone', { vol: 0.4 })
  return w.shot({ r: SIZE, life: Infinity, pierce: Infinity, noCollide: true, kb: 0, data: { i: 0, t: rand(0.15, 0.45), flash: 0 } satisfies Drone, update: fly, draw }, wi)
}

function fly(d: Shot, w: World, dt: number) {
  const wi = d.src!, p = w.p
  if (!p.weapons.includes(wi)) return void (d.dead = true)
  const f = wi.state as Fleet, s = f.s, D = d.data as Drone
  d.color = w.color(wi) // re-tint after fusion
  const a = f.ang + (D.i / f.drones.length) * TAU
  const r = ORBIT * s.area + Math.sin(w.time * 2.6 + D.i * 2.1) * 6
  d.x = damp(d.x, p.x + Math.cos(a) * r, 12, dt)
  d.y = damp(d.y, p.y + Math.sin(a) * r, 12, dt)
  D.flash = Math.max(0, D.flash - dt * 6)
  D.t -= dt
  if (D.t > 0 || p.dead) return
  const e = w.nearest(d.x, d.y, RANGE * s.area + BIG)
  const dx = e ? e.x - d.x : 0, dy = e ? e.y - d.y : 0, len = Math.hypot(dx, dy) || 1
  if (!e || len - e.r > RANGE * s.area) return void (D.t = 0.1)
  D.t = s.cd * rand(0.9, 1.1)
  D.flash = 1
  w.zap(d.x, d.y, e.x, e.y, d.color, wi.fuse ? 3.2 : 2.4)
  w.damage(e, s.dmg, wi, { kb: 30, dirx: dx, diry: dy })
  if (s.pierce > 0) w.chain(e, s.dmg * 0.6, wi, s.pierce, d.color)
  w.part({ x: e.x, y: e.y, life: 0.12, size: e.r + 14, size1: 2, color: W, alpha: 0.6, shape: Shape.Glow })
  w.burst(e.x, e.y, { n: 4, color: d.color, speed: 200, life: 0.2, size: 1.5, stretch: 0.03 })
  w.part({ x: d.x, y: d.y, life: 0.1, size: 14 * s.area, size1: 2, color: d.color, alpha: 0.8, shape: Shape.Glow })
  w.sfx('zap', { vol: 0.3, pitch: rand(1.1, 1.4), x: d.x }, 0.05)
  // recoil: the drone kicks back from its shot and eases into its slot again
  d.x -= (dx / len) * 7
  d.y -= (dy / len) * 7
}

function draw(d: Shot, w: World) {
  const D = d.data as Drone, s = (d.src!.state as Fleet).s
  const z = SIZE * s.area, rot = w.time * 3 + D.i * 1.3
  const ready = 1 - clamp(D.t / s.cd, 0, 1) // the core brightens as the next zap charges
  R.draw(Shape.Glow, d.x, d.y, z * 4.5, z * 4.5, 0, d.color, 0.25 + 0.5 * D.flash)
  R.draw(Shape.Hex, d.x, d.y, z, z, rot, d.color, 0.3, 0)
  R.draw(Shape.Hex, d.x, d.y, z, z, rot, d.color, 1, 1 + D.flash, 1.6)
  R.draw(Shape.Circle, d.x, d.y, z * (0.28 + 0.2 * ready), z * (0.28 + 0.2 * ready), 0, W, 0.5 + 0.5 * ready, 0.6 + D.flash)
  for (let j = 0; j < 2; j++) {
    const a = -rot * 1.8 + j * Math.PI
    R.draw(Shape.Circle, d.x + Math.cos(a) * z * 1.7, d.y + Math.sin(a) * z * 1.7, 1.3, 1.3, 0, d.color, 0.9, 1)
  }
}

export default {
  id: 'arc_drone',
  hue: 'B',
  name: l('Arc Drone', '电弧无人机'),
  desc: l('Drones orbit you and zap the nearest foe with lightning.', '无人机环绕你飞行，用闪电电击最近的敌人。'),
  icon: '<path d="M10 14l10-6 10 6v12l-10 6-10-6z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><circle cx="20" cy="20" r="4" fill="currentColor"/><path d="M30 30l14 4-8 8 20 14" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>',
  levels: [
    l('+1 drone', '无人机 +1'),
    l('+5 damage, zaps chain to 1 more foe', '伤害 +5，电弧额外连锁 1 个敌人'),
    l('-0.15s zap cooldown', '电击冷却 -0.15 秒'),
    l('+1 drone', '无人机 +1'),
    l('+5 damage, +15% range', '伤害 +5，范围 +15%'),
    l('-0.1s zap cooldown, zaps chain to 2 more foes', '电击冷却 -0.1 秒，电弧额外连锁 2 个敌人'),
  ],
  stats: (lv) => ({ dmg: DMG[lv - 1], cd: CD[lv - 1], area: AREA[lv - 1], speed: 2.4, amount: AMT[lv - 1], duration: 1, pierce: CHAIN[lv - 1] }),
  tick(wi, w, dt, s) {
    const f = wi.state as Fleet
    f.s = s
    f.ang = (f.ang ?? 0) + s.speed * dt
    const ds = (f.drones ??= [])
    if (ds.length === s.amount) return
    while (ds.length < s.amount) ds.push(launch(wi, w))
    while (ds.length > s.amount) ds.pop()!.dead = true
    ds.forEach((d, i) => ((d.data as Drone).i = i))
  },
} satisfies WeaponDef
