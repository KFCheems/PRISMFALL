import { renderer as R, Shape } from '../../core/gl'
import { l, loc } from '../../core/i18n'
import { chance, clamp, damp, dist2, ease, hex, lerp, rand, scale, TAU, wrapAngle, type RGB } from '../../core/math'
import { COLOR } from '../../game/types'
import type { Bullet, Enemy, EnemyDef } from '../../game/types'
import type { World } from '../../game/world'

// Null Prism — stage 4 FINAL boss. A rotating prism that refracts through the spectrum.
// Crimson: aimed bursts & slams · Verdant: expanding/returning rings & drain zones · Azure: fast spirals & teleports
// · Null Light (white): everything at once, with arena-crossing laser grids and firing spectrum shards.

const VIOLET = hex('#a64dff'), PALE = hex('#efe4ff')
const WHITE: RGB = [1, 1, 1]
const HUE: RGB[] = [VIOLET, COLOR.R, COLOR.G, COLOR.B, WHITE] // body hue per phase
const BC: RGB[] = [VIOLET, hex('#ff2e4d'), hex('#e8ff4a'), hex('#c46bff'), hex('#ff8ce6')] // bullet / hazard hue per phase
const SHARD: RGB[] = [COLOR.R, COLOR.G, COLOR.B]
const TH = [0, 0.75, 0.5, 0.25]
const BANNERS = [
  [l('VERDANT REFRACTION', '翠绿折射'), l('The prism drinks your light.', '棱镜正在吞饮你的光。')],
  [l('AZURE REFRACTION', '蔚蓝折射'), l('It moves faster than thought.', '它比思绪更快。')],
  [l('NULL LIGHT', '虚无之光'), l('All colors. One end.', '万色归一，终焉降临。')],
]
const PULSE_T = 3.4, PULSE_R = 330, GRID_SP = 170, ZONE_R = 110

const accel = (b: Bullet, _w: World, dt: number) => {
  const k = 1 + 0.35 * dt
  b.vx *= k
  b.vy *= k
  b.x += b.vx * dt
  b.y += b.vy * dt
}
/** ring bullets that swell out to PULSE_R and collapse back; b.data = { ox, oy, a, s } */
const pulse = (b: Bullet, _w: World, _dt: number) => {
  const q = b.data, rr = PULSE_R * Math.sin(Math.PI * Math.min(1, b.t / PULSE_T)), a = q.a + q.s * b.t
  b.x = q.ox + Math.cos(a) * rr
  b.y = q.oy + Math.sin(a) * rr
}
const preset = (o: Partial<Bullet>) => BC.map((color): Partial<Bullet> => ({ ...o, color }))
const B_FAN = preset({ r: 6, dmg: 11, shape: Shape.Tri })
const B_RING = preset({ r: 7, dmg: 11 })
const B_ACC = preset({ r: 7, dmg: 11, life: 5, update: accel })
const B_PULSE = preset({ r: 7, dmg: 11, life: PULSE_T, update: pulse })
const B_SPIRAL = preset({ r: 6, dmg: 10, shape: Shape.Diamond, life: 4 })
const B_FAST = preset({ r: 6, dmg: 12, shape: Shape.Tri, life: 3 })

type Atk = (e: Enemy, w: World, d: Data, dt: number) => boolean
interface Zone { x: number; y: number; on: number; off: number }

interface Data {
  phase: number; trans: number; t: number; i: number; n: number; dir: number; atk: Atk; dmg: number
  rot: number; rotV: number; spinTo: number
  col: RGB // displayed hue, eased toward HUE[phase]
  glow: number; air: number; fade: number; landed: boolean; t0: number; sx: number; sy: number; tx: number; ty: number
  aim: number; tele: number; ga: number
  zones: Zone[]; zap: number; shardT: number; shardK: number
}

const G = { x: 0, y: 0 } // scratch point

/** ticks of a clock (from, from+p, … n times) crossed this frame. `from` must be > 0. */
function ticks(d: Data, p: number, dt: number, from: number, n = Infinity) {
  return clamp(Math.floor((d.t - from) / p) + 1, 0, n) - clamp(Math.floor((d.t - dt - from) / p) + 1, 0, n)
}

/** ring of n bullets with a hole of `gap` bullets centred on angle ga */
function gapRing(w: World, x: number, y: number, n: number, speed: number, ga: number, gap: number, o: Partial<Bullet>) {
  const step = TAU / n, half = (gap / 2) * step
  for (let i = 0; i < n; i++) {
    const a = ga + (i + 0.5) * step
    if (Math.abs(wrapAngle(a - ga)) > half) w.enemyShot(x, y, a, speed, o)
  }
}

function inArena(w: World, x: number, y: number, m: number) {
  const a = w.arena!, dx = x - a.x, dy = y - a.y, dl = Math.hypot(dx, dy), max = a.r - m
  const k = dl > max ? max / dl : 1
  G.x = a.x + dx * k
  G.y = a.y + dy * k
}

function steer(e: Enemy, tx: number, ty: number, sp: number, dt: number) {
  const dx = tx - e.x, dy = ty - e.y, l = Math.hypot(dx, dy) || 1, v = Math.min(sp, l * 1.5)
  e.vx = damp(e.vx, (dx / l) * v, 3, dt)
  e.vy = damp(e.vy, (dy / l) * v, 3, dt)
}

function hover(e: Enemy, w: World, range: number, sp: number, dt: number) {
  const a = Math.atan2(e.y - w.p.y, e.x - w.p.x) + 0.35
  steer(e, w.p.x + Math.cos(a) * range, w.p.y + Math.sin(a) * range, sp, dt)
}

// ───────────────────────────── crimson ─────────────────────────────
const rest: Atk = (e, w, d, dt) => {
  hover(e, w, 290, e.speed, dt)
  return d.t > [0, 1.3, 1.2, 1.1, 0.8][d.phase]
}

/** tight 7-way fans; a red sight line tracks you and locks just before each shot */
const burst: Atk = (e, w, d, dt) => {
  hover(e, w, 290, e.speed * 0.7, dt)
  const n = d.phase === 1 ? 5 : 3, per = 0.6, t0 = 0.5
  const k = Math.floor((d.t - t0) / per) + 1, nt = t0 + k * per
  d.tele = k < n ? clamp(1 - (nt - d.t) / 0.4, 0, 1) : 0
  if (nt - d.t > 0.12) d.aim = w.angleToPlayer(e)
  if (ticks(d, per, dt, t0, n)) {
    for (let j = -3; j <= 3; j++) w.enemyShot(e.x, e.y, d.aim + j * 0.12, 270, B_FAN[d.phase])
    w.sfx('enemyShoot', { x: e.x, pitch: 1.3 })
    w.part({ x: e.x, y: e.y, life: 0.2, size: e.r * 1.6, size1: e.r * 0.6, color: BC[d.phase], alpha: 0.8, shape: Shape.Glow })
    d.glow = 1
  }
  return d.t > t0 + n * per + 0.3
}

function land(e: Enemy, w: World, d: Data) {
  if (e.dead || d.landed) return
  d.landed = true
  d.air = 0
  e.x = d.tx
  e.y = d.ty
  e.dmg = d.dmg
  const c = BC[d.phase], a = w.angleToPlayer(e)
  gapRing(w, e.x, e.y, 32, 190, a + rand(0.6, 1.2) * (chance(0.5) ? 1 : -1), 4, B_RING[d.phase])
  // a diagonal cross of lances from the impact point
  for (let k = 0; k < 4; k++) {
    const b = a + Math.PI / 4 + (k * Math.PI) / 2
    w.hazard({ kind: 'line', x: e.x, y: e.y, x2: e.x + Math.cos(b) * 640, y2: e.y + Math.sin(b) * 640, r: 15, delay: 0.6, active: 0.25, dmg: 20, color: c })
  }
  w.shake(0.8)
  w.hitstop(0.06)
  R.ripple(e.x, e.y, 1.8, 0.7)
  w.sfx('explodeBig', { x: e.x })
  w.burst(e.x, e.y, { n: 30, color: c, speed: 440, life: 0.6, size: 4, shape: Shape.Tri, spin: 8 })
  w.ringFx(e.x, e.y, 220, c)
}

/** leaps onto your position; the landing fires a gapped ring and a telegraphed cross */
const slam: Atk = (e, w, d, dt) => {
  const per = 1.7
  if (ticks(d, per, dt, 0.2, 2)) {
    const p = w.p
    inArena(w, p.x + p.vx * 0.3, p.y + p.vy * 0.3, e.r)
    Object.assign(d, { sx: e.x, sy: e.y, tx: G.x, ty: G.y, t0: d.t, landed: false })
    e.dmg = 0
    w.hazard({ x: G.x, y: G.y, r: 150, delay: 0.9, active: 0.15, dmg: 26, color: BC[d.phase], onBoom: () => land(e, w, d) })
    w.sfx('charge', { x: e.x, pitch: 0.8 })
  }
  if (!d.landed) {
    const k = clamp((d.t - d.t0) / 0.9, 0, 1), f = ease.inOutSine(k)
    e.x = lerp(d.sx, d.tx, f)
    e.y = lerp(d.sy, d.ty, f)
    e.vx = e.vy = 0
    d.air = Math.sin(k * Math.PI)
  } else {
    e.vx = damp(e.vx, 0, 4, dt)
    e.vy = damp(e.vy, 0, 4, dt)
  }
  return d.t > 0.2 + 2 * per && d.landed
}

// ───────────────────────────── verdant ─────────────────────────────
/** accelerating rings, each hole shifted from the last */
const rings: Atk = (e, w, d, dt) => {
  hover(e, w, 280, e.speed * 0.4, dt)
  const n = d.phase === 2 ? 5 : 3
  if (ticks(d, 0.7, dt, 0.5, n)) {
    d.aim = d.n++ ? d.aim + rand(0.5, 0.8) * d.dir : w.angleToPlayer(e)
    gapRing(w, e.x, e.y, 30, 70, d.aim, 4, B_ACC[d.phase])
    w.ringFx(e.x, e.y, e.r * 2, BC[d.phase])
    w.sfx('pulse', { x: e.x, pitch: 0.8 })
    d.glow = 1
  }
  return d.t > 0.5 + n * 0.7 + 0.4
}

/** rings that swell outward then collapse back into the prism — pass through the gap twice */
const swell: Atk = (e, w, d, dt) => {
  hover(e, w, 260, e.speed * 0.3, dt)
  const n = d.phase === 2 ? 3 : 2
  if (ticks(d, 1.1, dt, 0.5, n)) {
    const ga = w.angleToPlayer(e) + rand(-0.6, 0.6), s = (d.n++ % 2 ? 0.35 : -0.35) * d.dir, step = TAU / 28
    for (let i = 0; i < 28; i++) {
      const a = ga + (i + 0.5) * step
      if (Math.abs(wrapAngle(a - ga)) < 2 * step) continue
      w.enemyShot(e.x, e.y, a, 0, B_PULSE[d.phase]).data = { ox: e.x, oy: e.y, a, s }
    }
    w.sfx('pulse', { x: e.x, pitch: 0.6 })
    w.ringFx(e.x, e.y, 120, BC[d.phase])
    d.glow = 1
  }
  return d.t > 0.5 + (n - 1) * 1.1 + PULSE_T * 0.6
}

/** drain zones bloom around you: they burn, pull you in, and feed the prism while you stand in them */
const drain: Atk = (e, w, d, dt) => {
  hover(e, w, 300, e.speed * 0.5, dt)
  const n = d.phase === 2 ? 3 : 2
  if (ticks(d, 0.3, dt, 0.3, n)) {
    const p = w.p, a = rand(0, TAU), r = d.n++ ? rand(170, 300) : 0
    inArena(w, p.x + p.vx * 0.4 + Math.cos(a) * r, p.y + p.vy * 0.4 + Math.sin(a) * r, 40)
    const on = w.time + 1.2, life = 4.5
    w.hazard({ x: G.x, y: G.y, r: ZONE_R, delay: 1.2, active: life, dmg: 9, color: BC[d.phase] })
    d.zones.push({ x: G.x, y: G.y, on, off: on + life })
    w.sfx('void', { x: G.x, vol: 0.6 })
  }
  return d.t > 0.3 + n * 0.3 + 1.6
}

// ───────────────────────────── azure ─────────────────────────────
/** a swaying multi-arm spiral; gaps widen with distance — keep your range */
const spiral: Atk = (e, w, d, dt) => {
  e.vx = damp(e.vx, 0, 3, dt)
  e.vy = damp(e.vy, 0, 3, dt)
  const arms = d.phase === 3 ? 5 : 3, wind = 0.6
  if (d.t < wind) {
    d.glow = d.t / wind
    d.spinTo = 5 * d.dir
    return false
  }
  if (ticks(d, 0.1, dt, wind, 32)) {
    const u = d.t - wind, base = d.dir * (1.3 * u + 0.9 * Math.sin(1.7 * u))
    for (let k = 0; k < arms; k++) w.enemyShot(e.x, e.y, base + (k * TAU) / arms, 240, B_SPIRAL[d.phase])
    w.sfx('enemyShoot', { x: e.x, vol: 0.35 }, 0.1)
  }
  return d.t > wind + 3.2 + 0.4
}

/** blinks out and reappears on a telegraphed glyph, firing on arrival */
const blink: Atk = (e, w, d, dt) => {
  const per = 1.5, n = d.phase === 3 ? 3 : 2, k = Math.floor(d.t / per), u = d.t - k * per
  e.vx = damp(e.vx, 0, 6, dt)
  e.vy = damp(e.vy, 0, 6, dt)
  if (k >= n) return d.t > n * per + 0.2
  if (d.n === k) {
    d.n++
    const p = w.p, a = rand(0, TAU)
    inArena(w, p.x + Math.cos(a) * rand(270, 400), p.y + Math.sin(a) * rand(270, 400), e.r + 20)
    if (dist2(G.x, G.y, p.x, p.y) < 240 * 240) inArena(w, p.x - Math.cos(a) * 320, p.y - Math.sin(a) * 320, e.r + 20)
    d.tx = G.x
    d.ty = G.y
    e.invuln = true
    w.hazard({ x: d.tx, y: d.ty, r: 90, delay: 0.95, active: 0.15, dmg: 18, color: BC[d.phase] })
    w.sfx('teleport', { x: e.x })
  }
  if (u < 0.35) d.fade = u / 0.35
  else if (u < 0.95) d.fade = 1
  else {
    if (d.fade >= 1) {
      w.burst(e.x, e.y, { n: 16, color: d.col, speed: 200, life: 0.4, size: 3, shape: Shape.Tri })
      e.x = d.tx
      e.y = d.ty
      e.invuln = false
      gapRing(w, e.x, e.y, 26, 180, w.angleToPlayer(e) + rand(0.5, 1) * (chance(0.5) ? 1 : -1), 3, B_RING[d.phase])
      const a = w.angleToPlayer(e)
      for (let j = -1; j <= 1; j++) w.enemyShot(e.x, e.y, a + j * 0.25, 340, B_FAST[d.phase])
      R.ripple(e.x, e.y, 1, 0.5)
      w.sfx('teleport', { x: e.x, pitch: 1.4 })
      w.shake(0.3)
    }
    d.fade = Math.max(0, 1 - (u - 0.95) / 0.25) * 0.999
  }
  return false
}

// ───────────────────────────── null light ─────────────────────────────
/** two sweeping volleys of arena-crossing lasers forming a grid — find a cell */
const grid: Atk = (e, w, d, dt) => {
  hover(e, w, 300, e.speed * 0.3, dt)
  if (ticks(d, 0.75, dt, 0.3, 2)) {
    const ar = w.arena!
    if (!d.n) d.ga = rand(0, Math.PI)
    const th = d.ga + (d.n++ ? Math.PI / 2 : 0), ux = Math.cos(th), uy = Math.sin(th), jit = rand(-0.5, 0.5) * GRID_SP
    for (let i = 0; i < 8; i++) {
      const o = (i - 3.5) * GRID_SP + jit
      if (Math.abs(o) > ar.r - 20) continue
      const L = Math.sqrt(ar.r * ar.r - o * o) + 40, cx = ar.x - uy * o, cy = ar.y + ux * o
      w.hazard({
        kind: 'line', x: cx - ux * L, y: cy - uy * L, x2: cx + ux * L, y2: cy + uy * L, r: 15, delay: 1.3 + i * 0.06, active: 0.35, dmg: 22, color: PALE,
        onBoom: i ? undefined : (_h, w) => {
          w.sfx('laser')
          w.shake(0.35)
          w.flash(PALE, 0.12)
        },
      })
    }
    w.sfx('charge', { x: e.x, pitch: 1.5 })
    d.glow = 1
  }
  return d.t > 0.3 + 0.75 + 1.3 + 0.9
}

const SEQ: Atk[][] = [
  [],
  [burst, slam, burst, slam],
  [rings, drain, swell, rings, drain],
  [spiral, blink, spiral, blink],
  [grid, slam, swell, grid, blink, spiral, drain, grid, burst],
]

function begin(d: Data, atk: Atk) {
  Object.assign(d, { atk, t: 0, n: 0, dir: chance(0.5) ? 1 : -1, spinTo: 0.6, tele: 0, fade: 0 })
}

const next = (d: Data) => begin(d, d.atk === rest ? SEQ[d.phase][d.i++ % SEQ[d.phase].length] : rest)

function phaseUp(e: Enemy, w: World, d: Data) {
  d.phase++
  d.i = 0
  d.trans = 2.6
  begin(d, rest)
  Object.assign(d, { landed: true, air: 0 })
  e.dmg = d.dmg
  e.invuln = true
  e.burn = 0
  for (const b of w.bullets) if (!b.dead) {
    b.dead = true
    w.part({ x: b.x, y: b.y, life: 0.3, size: b.r * 1.5, size1: 0, color: b.color, glow: 1 })
  }
  const c = HUE[d.phase], [title, sub] = BANNERS[d.phase - 2]
  w.hooks.banner(loc(title), loc(sub), c)
  w.sfx('bossPhase')
  w.shake(0.9)
  w.flash(c, d.phase === 4 ? 0.6 : 0.35)
  w.hitstop(0.15)
  R.ripple(e.x, e.y, 2.6, 1.3)
  for (let i = 0; i < 3; i++) w.part({ x: e.x, y: e.y, life: 0.6 + i * 0.2, size: e.r, size1: 280 + i * 140, color: d.phase === 4 ? SHARD[i] : i === 1 ? VIOLET : c, alpha: 0.9, shape: Shape.Ring, glow: 1.5 })
  if (d.phase === 4) for (let i = 0; i < 6; i++) w.spawnEnemy(i % 2 ? 'phantom' : 'swarmer', e.x + Math.cos((i * TAU) / 6) * 260, e.y + Math.sin((i * TAU) / 6) * 260)
}

/** the white phase's spectrum shards take turns firing their own hue's pattern */
function shards(e: Enemy, w: World, d: Data, dt: number) {
  d.shardT += dt
  if (d.shardT < 0.7) return
  d.shardT = 0
  const k = d.shardK++ % 3, a = d.rot * 0.7 + (k * TAU) / 3, sx = e.x + Math.cos(a) * e.r * 2.2, sy = e.y + Math.sin(a) * e.r * 2.2
  const pa = Math.atan2(w.p.y - sy, w.p.x - sx)
  if (k === 0) for (let j = -1; j <= 1; j++) w.enemyShot(sx, sy, pa + j * 0.18, 230, B_FAN[1])
  else if (k === 1) w.ringShot(sx, sy, 8, 110, rand(0, TAU), B_RING[2])
  else w.enemyShot(sx, sy, pa, 380, B_FAST[3])
  w.burst(sx, sy, { n: 5, color: SHARD[k], speed: 120, life: 0.3, size: 2.5 })
}

/** live drain zones: pull the player toward their centre and leech hp for the prism */
function zones(e: Enemy, w: World, d: Data, dt: number) {
  const p = w.p, now = w.time
  d.zones = d.zones.filter((z) => z.off > now)
  d.zap -= dt
  for (const z of d.zones) {
    if (now < z.on || p.dead) continue
    if (chance(dt * 10)) w.part({ x: z.x + rand(-ZONE_R, ZONE_R) * 0.7, y: z.y + rand(-ZONE_R, ZONE_R) * 0.7, vx: rand(-20, 20), vy: rand(-60, -20), life: 0.6, size: 3, size1: 0, color: BC[2], glow: 1 })
    const dx = z.x - p.x, dy = z.y - p.y, dd = Math.hypot(dx, dy)
    if (dd > ZONE_R + p.r) continue
    if (dd > 4) {
      p.x += (dx / dd) * 55 * dt
      p.y += (dy / dd) * 55 * dt
    }
    if (!e.invuln) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.0025 * dt)
    if (d.zap <= 0) {
      d.zap = 0.15
      w.zap(p.x, p.y, e.x, e.y, BC[2], 2)
    }
  }
}

export default {
  id: 'null_prism', name: l('Null Prism', '虚无棱镜'), title: l('The Last Refraction', '最后的折射'),
  desc: l('Where every color ends.', '一切色彩的终点。'),
  shape: Shape.Tri, color: VIOLET, r: 56, hp: 52000, speed: 95, dmg: 28, xp: 0, mass: 100, boss: true, music: 'finalBoss',

  spawn(e) {
    const d: Data = {
      phase: 1, trans: 0, t: 0, i: 0, n: 0, dir: 1, atk: rest, dmg: e.dmg, rot: 0, rotV: 0, spinTo: 0.6, col: [...VIOLET],
      glow: 0, air: 0, fade: 0, landed: true, t0: 0, sx: 0, sy: 0, tx: 0, ty: 0, aim: 0, tele: 0, ga: 0, zones: [], zap: 0, shardT: 0, shardK: 0,
    }
    e.data = d
  },

  ai(e, w, dt) {
    const d = e.data as Data
    d.glow = Math.max(0, d.glow - dt * 2)
    if (d.trans > 0) {
      d.trans -= dt
      d.spinTo = 7
      d.glow = 1
      e.vx = damp(e.vx, 0, 4, dt)
      e.vy = damp(e.vy, 0, 4, dt)
      if (chance(dt * 40)) {
        const a = rand(0, TAU), r = rand(200, 320)
        w.part({ x: e.x + Math.cos(a) * r, y: e.y + Math.sin(a) * r, vx: -Math.cos(a) * r * 1.6, vy: -Math.sin(a) * r * 1.6, life: 0.6, size: 3, size1: 0, color: SHARD[Math.floor(rand(0, 3))], glow: 1.2, drag: 0, stretch: 0.03 })
      }
      if (d.trans <= 0) {
        e.invuln = false
        begin(d, rest)
        w.ringShot(e.x, e.y, 30, 150, rand(0, TAU), B_RING[d.phase])
        w.sfx('explodeBig', { x: e.x })
        w.shake(0.5)
      }
    } else if (d.phase < 4 && e.hp < e.maxHp * TH[d.phase]) phaseUp(e, w, d)
    else {
      d.t += dt
      if (d.atk(e, w, d, dt)) next(d)
      if (d.phase === 4) shards(e, w, d, dt)
    }
    zones(e, w, d, dt)
    d.rotV = damp(d.rotV, d.spinTo, 2.5, dt)
    d.rot += d.rotV * dt
    e.rot = d.rot
    const c = HUE[d.phase], k = 1 - Math.exp(-3 * dt)
    for (let i = 0; i < 3; i++) d.col[i] += (c[i] - d.col[i]) * k
  },

  draw(e, w) {
    const d = e.data as Data, t = w.time, x = e.x, y = e.y, c = d.col, vis = 1 - d.fade
    const r = e.r * (1 + d.air * 0.5) * (1 + Math.sin(t * 3.2) * 0.03 + d.glow * 0.06)
    const dark = scale(c, 0.12), out = e.flash > 0 ? WHITE : c
    // telegraphs: sight line, teleport glyph
    if (d.tele > 0) {
      const bc = BC[d.phase]
      for (let j = -3; j <= 3; j += 3) {
        const a = d.aim + j * 0.12
        R.line(x, y, x + Math.cos(a) * 700, y + Math.sin(a) * 700, j ? 1.2 : 2.2, bc, d.tele * (0.4 + Math.sin(t * 40) * 0.2), 0.6)
      }
    }
    if (d.atk === blink && d.fade > 0) {
      const g = d.fade
      R.draw(Shape.Tri, d.tx, d.ty, e.r * g, e.r * g, -d.rot, c, 0.7 * g, 1, 2)
      R.draw(Shape.Tri, d.tx, d.ty, e.r * g, e.r * g, -d.rot + Math.PI, VIOLET, 0.5 * g, 1, 2)
    }
    if (vis <= 0.01) return
    if (d.air > 0) R.draw(Shape.Tri, x + d.air * 26, y + d.air * 40, e.r, e.r, d.rot, [0, 0, 0], 0.25 + d.air * 0.4, 0, 0, 0)
    // halo, refraction beams & orbiting rings
    R.draw(Shape.Glow, x, y, r * 4, r * 4, 0, c, (0.22 + d.glow * 0.25) * vis)
    R.draw(Shape.Glow, x, y, r * 2.4, r * 2.4, 0, VIOLET, 0.3 * vis)
    for (let k = 0; k < 3; k++) {
      const a = d.rot + (k * TAU) / 3, len = r * (2.6 + Math.sin(t * 2 + k) * 0.3)
      R.line(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, 2.5, SHARD[k], 0.45 * vis, 1)
    }
    R.draw(Shape.Arc, x, y, r * 1.75, 1.6, -d.rot * 0.5, c, 0.7 * vis, 0.8, 1.2)
    R.draw(Shape.Arc, x, y, r * 1.75, 1.6, -d.rot * 0.5 + Math.PI, c, 0.7 * vis, 0.8, 1.2)
    R.draw(Shape.Ring, x, y, r * 2.05, r * 2.05, 0, VIOLET, 0.3 * vis, 0.5, 1.2)
    // prism body: dark tri, bright rim, counter-rotating inner tri (hexagram in the final phase)
    R.draw(Shape.Tri, x, y, r * 1.2, r * 1.2, d.rot, dark, 0.95 * vis, 0, 0, 0)
    R.draw(Shape.Tri, x, y, r * 1.2, r * 1.2, d.rot, out, vis, 1.4, 4.5)
    R.draw(Shape.Tri, x, y, r * 0.95, r * 0.95, d.rot, VIOLET, 0.5 * vis, 0.4, 1.4)
    R.draw(Shape.Tri, x, y, r * 0.62, r * 0.62, -d.rot * 1.5, PALE, 0.9 * vis, 0.9, 2.2)
    if (d.phase === 4) R.draw(Shape.Tri, x, y, r * 0.62, r * 0.62, -d.rot * 1.5 + Math.PI, PALE, 0.9 * vis, 0.9, 2.2)
    for (let k = 0; k < 3; k++) {
      const a = d.rot + (k * TAU) / 3
      R.draw(Shape.Diamond, x + Math.cos(a) * r * 1.2, y + Math.sin(a) * r * 1.2, 7, 7, a, d.glow > 0.3 ? WHITE : c, vis, 1.2)
    }
    // core eye
    const eye = e.flash > 0 ? WHITE : d.phase === 4 ? PALE : c, er = r * (0.2 + d.glow * 0.05)
    R.draw(Shape.Glow, x, y, r * 1.5, r * 1.5, 0, eye, (0.6 + d.glow * 0.4) * vis)
    R.draw(Shape.Diamond, x, y, er * 1.3, er * 1.3, t * 2, eye, vis, 1.6)
    R.draw(Shape.Circle, x, y, er * 0.45, er * 0.45, 0, WHITE, vis, 0)
    // spectrum shards (all three blaze in the final phase)
    for (let k = 0; k < 3; k++) {
      const a = d.rot * 0.7 + (k * TAU) / 3, sx = x + Math.cos(a) * e.r * 2.2, sy = y + Math.sin(a) * e.r * 2.2
      const on = d.phase === 4 || d.phase === k + 1, al = (on ? 1 : 0.3) * vis
      R.draw(Shape.Diamond, sx, sy, 9, 15, a, scale(SHARD[k], 0.15), al, 0, 0, 0)
      R.draw(Shape.Diamond, sx, sy, 9, 15, a, SHARD[k], al, on ? 1.4 : 0.4, 2.2)
      if (on) R.draw(Shape.Glow, sx, sy, 40, 40, 0, SHARD[k], 0.4 * vis)
    }
    if (e.invuln && d.trans > 0) R.draw(Shape.Ring, x, y, r * 1.7, r * 1.7, 0, WHITE, 0.5 + Math.sin(t * 20) * 0.3, 1.2, 2)
  },

  death(e, w) {
    const d = e.data as Data
    d.zones.length = 0
    for (const b of w.bullets) b.dead = true
    for (const h of w.hazards) h.dead = true
    for (let i = 0; i < 6; i++) w.part({ x: e.x, y: e.y, life: 0.9 + i * 0.2, size: e.r, size1: 320 + i * 140, color: i % 3 === 0 ? COLOR.R : i % 3 === 1 ? COLOR.G : COLOR.B, alpha: 0.9, shape: Shape.Ring, glow: 1.6 })
    for (let k = 0; k < 3; k++) w.burst(e.x, e.y, { n: 30, color: SHARD[k], speed: 600, life: 1.2, size: 4, shape: Shape.Tri, spin: 10 })
    w.flash(WHITE, 0.8)
  },
} satisfies EnemyDef
