import { renderer as R, Shape } from '../../core/gl'
import { l, loc } from '../../core/i18n'
import { chance, clamp, damp, dist2, hex, lerp, mix, rand, scale, TAU, turnToward, type RGB } from '../../core/math'
import type { Bullet, Enemy, EnemyDef } from '../../game/types'
import type { World } from '../../game/world'

// Pyre Serpent — stage 2 boss. A long segmented serpent; only the head takes damage, the whole body burns on contact.
// Phase 1: fire breath & single dives · 2: chained dives, ember volleys from the scales, firefall · 3: inferno orbit, sweeping breath.

const RED = hex('#ff3b2e'), ORANGE = hex('#ff7a1f'), GOLD = hex('#ffc53d'), HOT = hex('#ff2e6a')
const WHITE: RGB = [1, 1, 1]
const DARK = scale(RED, 0.13)
const RIM: RGB[] = [RED, RED, hex('#ff5a24'), hex('#ffa030')]
const TH = [0, 0.66, 0.33]
const BANNERS = [
  [l('WILDFIRE', '野火燎原'), l('Its scales split with flame.', '鳞片之间迸出烈焰。')],
  [l('INFERNO', '炼狱焚天'), l('The pyre burns itself to burn you.', '它焚尽自身，只为将你焚尽。')],
]
const SEGS = 18, STEP = 6, OFF = 5, N = 128 // body: SEGS segments, OFF path samples (STEP units each) apart
const SR = Float32Array.from({ length: SEGS }, (_, i) => lerp(31, 11, i / (SEGS - 1)))
const BODY_DMG = 16, DIVE_SP = 1050, CONE = 0.4, RANGE = 340, ORBIT_R = 380, FIRES = 48
const BT1 = 1.05, BT2 = 2.35 // breath: wind-up ends / breath ends

const flame = (b: Bullet, _w: World, dt: number) => {
  const k = Math.exp(-0.8 * dt)
  b.vx *= k
  b.vy *= k
  b.x += b.vx * dt
  b.y += b.vy * dt
}
const B_FLAME: Partial<Bullet> = { r: 7, dmg: 9, color: ORANGE, life: 1.4, update: flame }
const B_EMBER: Partial<Bullet> = { r: 6, dmg: 10, color: HOT, shape: Shape.Diamond, life: 5 }
const B_FIREBALL: Partial<Bullet> = { r: 10, dmg: 12, color: ORANGE, life: 4 }
const B_SHARD: Partial<Bullet> = { r: 6, dmg: 10, color: HOT, life: 3.5 }

type Atk = (e: Enemy, w: World, d: Data, dt: number) => boolean

interface Data {
  phase: number; trans: number; t: number; i: number; n: number; dir: number; atk: Atk
  h: number // heading
  px: Float32Array; py: Float32Array; head: number; lx: number; ly: number // head path (ring buffer)
  sx: Float32Array; sy: Float32Array; sa: Float32Array // segment poses
  mouth: number; glow: number; aim: number; sweep: number
  st: number; t0: number; ox: number; oy: number; dx: number; dy: number; len: number; gone: number; drop: number // dive
  wave: number; ring: number // ember wave index / orbit telegraph radius
  fx: Float32Array; fy: Float32Array; fe: Float32Array; fi: number // burning trail spots (for flames fx)
}

const G = { x: 0, y: 0 } // scratch point

/** ticks of a clock (from, from+p, … n times) crossed this frame. `from` must be > 0. */
function ticks(d: Data, p: number, dt: number, from: number, n = Infinity) {
  return clamp(Math.floor((d.t - from) / p) + 1, 0, n) - clamp(Math.floor((d.t - dt - from) / p) + 1, 0, n)
}

/** clamp a point into the arena (minus margin) → G */
function inArena(w: World, x: number, y: number, m: number) {
  const a = w.arena!, dx = x - a.x, dy = y - a.y, dl = Math.hypot(dx, dy), max = a.r - m
  const k = dl > max ? max / dl : 1
  G.x = a.x + dx * k
  G.y = a.y + dy * k
}

function record(d: Data, x: number, y: number) {
  let dx = x - d.lx, dy = y - d.ly, l = Math.hypot(dx, dy)
  if (l < STEP) return
  dx /= l
  dy /= l
  for (; l >= STEP; l -= STEP) {
    d.lx += dx * STEP
    d.ly += dy * STEP
    d.head = (d.head + 1) % N
    d.px[d.head] = d.lx
    d.py[d.head] = d.ly
  }
}

function pose(e: Enemy, d: Data) {
  let qx = e.x, qy = e.y
  for (let i = 0; i < SEGS; i++) {
    const j = (d.head - OFF * (i + 1) + N) % N, x = d.px[j], y = d.py[j]
    d.sx[i] = x
    d.sy[i] = y
    d.sa[i] = Math.atan2(qy - y, qx - x)
    qx = x
    qy = y
  }
}

/** swim toward (gx, gy) with a limited turn rate and a sinuous wiggle */
function move(e: Enemy, d: Data, gx: number, gy: number, sp: number, turn: number, wig: number, dt: number) {
  d.h = turnToward(d.h, Math.atan2(gy - e.y, gx - e.x), turn * dt)
  const a = d.h + Math.sin(e.t * 4.5) * wig
  e.x += Math.cos(a) * sp * dt
  e.y += Math.sin(a) * sp * dt
  e.rot = a
}

/** circle the player at striking distance */
function slither(e: Enemy, w: World, d: Data, sp: number, dt: number, wig = 0.35) {
  const p = w.p, a = Math.atan2(e.y - p.y, e.x - p.x) + 0.75 * d.dir
  inArena(w, p.x + Math.cos(a) * 210, p.y + Math.sin(a) * 210, 90)
  move(e, d, G.x, G.y, sp, 2.3, wig, dt)
}

function fire(d: Data, w: World, x: number, y: number, life: number) {
  w.hazard({ x, y, r: 34, delay: 0.25, active: life, dmg: 10, color: ORANGE })
  d.fx[d.fi] = x
  d.fy[d.fi] = y
  d.fe[d.fi] = w.time + 0.25 + life
  d.fi = (d.fi + 1) % FIRES
}

const speed = (e: Enemy, d: Data) => e.speed * (0.88 + d.phase * 0.12)

// ───────────────────────────── attacks ─────────────────────────────
const rest: Atk = (e, w, d, dt) => {
  slither(e, w, d, speed(e, d), dt)
  return d.t > 1.7 - d.phase * 0.3
}

/** rears back, locks a cone, then pours fire (sweeping in later phases) */
const breath: Atk = (e, w, d, dt) => {
  if (d.t < BT1) {
    const p = w.p
    move(e, d, p.x, p.y, speed(e, d) * 0.6 * Math.max(0, 1 - d.t / 0.4), 3.5, 0.1, dt)
    if (d.t < 0.55) {
      d.sweep = [0, 0, 0.7, 1.25][d.phase] * d.dir
      d.aim = w.angleToPlayer(e) - d.sweep / 2
    }
    if (ticks(d, 1, dt, 0.01, 1)) w.sfx('charge', { x: e.x, pitch: 0.8 })
    d.mouth = d.t / BT1
    e.rot = turnToward(e.rot, d.aim, dt * 6)
    return false
  }
  const a = d.aim + d.sweep * clamp((d.t - BT1) / (BT2 - BT1), 0, 1)
  e.rot = a
  d.mouth = 1
  if (d.t < BT2) {
    const mx = e.x + Math.cos(a) * e.r, my = e.y + Math.sin(a) * e.r
    for (let k = ticks(d, 1 / 48, dt, BT1, 62); k > 0; k--) {
      const b = a + rand(-CONE, CONE) * 0.9
      w.enemyShot(mx, my, b, rand(240, 420), B_FLAME)
      w.part({ x: mx, y: my, vx: Math.cos(b) * rand(150, 380), vy: Math.sin(b) * rand(150, 380), life: rand(0.4, 0.8), size: rand(5, 10), size1: 0, color: chance(0.5) ? GOLD : ORANGE, glow: 1.2, drag: 1.5 })
    }
    w.shake(dt * 0.8)
    w.sfx('burn', { x: e.x }, 0.12)
  }
  return d.t > BT2 + 0.3
}

function aimDive(e: Enemy, w: World, d: Data) {
  const p = w.p, ar = w.arena!
  let dx = p.x + p.vx * 0.25 - e.x, dy = p.y + p.vy * 0.25 - e.y
  const dl = Math.hypot(dx, dy)
  if (dl < 60) {
    dx = Math.cos(d.h)
    dy = Math.sin(d.h)
  } else {
    dx /= dl
    dy /= dl
  }
  // distance to the far arena wall along the dive
  const fx = e.x - ar.x, fy = e.y - ar.y, b = fx * dx + fy * dy, rr = ar.r - 70
  Object.assign(d, { dx, dy, ox: e.x, oy: e.y, len: Math.max(250, -b + Math.sqrt(Math.max(0, b * b - (fx * fx + fy * fy - rr * rr)))) })
  w.sfx('charge', { x: e.x, pitch: 1.1 })
}

/** telegraphed lunge across the arena, scorching the ground behind it (1–3 chained) */
const dive: Atk = (e, w, d, dt) => {
  const tele = [0, 1.15, 0.95, 0.8][d.phase]
  if (d.st === 0) {
    if (!d.len) aimDive(e, w, d)
    const k = (d.t - d.t0) / tele
    e.rot = turnToward(e.rot, Math.atan2(d.dy, d.dx), dt * 8)
    d.mouth = 0.5 * k
    d.glow = k
    if (chance(dt * 30)) w.part({ x: e.x + rand(-20, 20), y: e.y + rand(-20, 20), vx: -d.dx * 120, vy: -d.dy * 120, life: 0.4, size: 4, size1: 0, color: GOLD, glow: 1 })
    if (k >= 1) {
      Object.assign(d, { st: 1, t0: d.t, gone: 0, drop: 0, h: Math.atan2(d.dy, d.dx) })
      w.shake(0.3)
      w.sfx('explode', { x: e.x, pitch: 0.7 })
    }
  } else if (d.st === 1) {
    const step = Math.min(DIVE_SP * dt, d.len - d.gone)
    e.x += d.dx * step
    e.y += d.dy * step
    e.rot = d.h
    d.gone += step
    for (; d.drop <= d.gone - 48; d.drop += 48) fire(d, w, d.ox + d.dx * d.drop, d.oy + d.dy * d.drop, 1.4 + d.phase * 0.5)
    w.part({ x: e.x + rand(-14, 14), y: e.y + rand(-14, 14), vx: -d.dx * 300 + rand(-80, 80), vy: -d.dy * 300 + rand(-80, 80), life: 0.4, size: 3, size1: 0, color: GOLD, glow: 1, stretch: 0.04 })
    if (d.gone >= d.len) {
      d.st = 2
      d.t0 = d.t
      d.n++
      w.shake(0.5)
      w.hitstop(0.04)
      R.ripple(e.x, e.y, 1.2, 0.6)
      w.burst(e.x, e.y, { n: 24, color: ORANGE, speed: 380, life: 0.6, size: 4, stretch: 0.03 })
      w.sfx('explodeBig', { x: e.x, vol: 0.7 })
      if (d.phase > 1) w.ringShot(e.x, e.y, 14 + d.phase * 2, 150, rand(0, TAU), B_SHARD)
    }
  } else {
    slither(e, w, d, speed(e, d) * 0.6, dt)
    if (d.t - d.t0 > 0.45) {
      if (d.n >= d.phase) return true
      Object.assign(d, { st: 0, t0: d.t, len: 0 })
    }
  }
  return false
}

const RATE = 26, LEAD = 0.45, PASS = SEGS / RATE + LEAD + 0.3 // ember wave: segments/s, telegraph lead, pass period

/** a glow runs down the spine; each scale it passes spits embers to both sides */
const embers: Atk = (e, w, d, dt) => {
  slither(e, w, d, speed(e, d) * 0.55, dt, 0.2)
  const passes = d.phase, u = d.t - 0.2, k = Math.floor(u / PASS)
  if (u < 0 || k >= passes) {
    d.wave = -99
    return u > passes * PASS
  }
  const off = LEAD * RATE, local = u - k * PASS
  d.wave = local * RATE - off
  const a = Math.floor((local - dt) * RATE - off), b = Math.min(SEGS - 1, Math.floor(d.wave))
  for (let i = Math.max(0, a + 1); i <= b; i++) {
    const tilt = k % 2 ? 0.3 : -0.3
    for (let s = -1; s <= 1; s += 2) w.enemyShot(d.sx[i], d.sy[i], d.sa[i] + s * (Math.PI / 2 + tilt), 115 + d.phase * 10, B_EMBER)
    w.sfx('enemyShoot', { x: d.sx[i], vol: 0.4 }, 0.06)
  }
  return false
}

/** meteors rain on and around the player, each bursting into embers */
const firefall: Atk = (e, w, d, dt) => {
  slither(e, w, d, speed(e, d) * 0.4, dt, 0.15)
  d.mouth = 0.6
  d.glow = 0.6
  const n = 4 + d.phase * 3
  for (let k = ticks(d, 0.14, dt, 0.4, n); k > 0; k--) {
    const p = w.p, first = d.n++ === 0, a = rand(0, TAU), r = first ? 0 : rand(70, 280)
    inArena(w, p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, 40)
    const x = G.x, y = G.y
    w.hazard({
      x, y, r: 66, delay: 1.15, active: 0.15, dmg: 20, color: ORANGE,
      onBoom: (h, w) => {
        w.ringShot(h.x, h.y, 8, 140, rand(0, TAU), B_SHARD)
        w.sfx('explode', { x: h.x, vol: 0.6 }, 0.05)
      },
    })
    w.part({ x: x - 260, y: y - 600, vx: 260 / 1.15, vy: 600 / 1.15, drag: 0, life: 1.15, size: 7, size1: 5, color: GOLD, glow: 1.4, stretch: 0.06 })
  }
  if (ticks(d, 1, dt, 0.4, 1)) w.sfx('bossWarn', { vol: 0.5, pitch: 1.4 })
  return d.t > 0.4 + n * 0.14 + 1.5
}

/** circles the arena at full speed, laying a ring of fire and lobbing fireballs inward */
const orbit: Atk = (e, w, d, dt) => {
  const c = w.arena!, a = Math.atan2(e.y - c.y, e.x - c.x) + 0.5 * d.dir
  d.ring = d.t < 1 ? ORBIT_R : 0
  move(e, d, c.x + Math.cos(a) * ORBIT_R, c.y + Math.sin(a) * ORBIT_R, d.t < 1 ? speed(e, d) * 1.3 : 470, 4.5, 0.1, dt)
  if (ticks(d, 0.5, dt, 1.2, 9)) {
    const pa = w.angleToPlayer(e)
    for (let k = -1; k <= 1; k++) w.enemyShot(e.x, e.y, pa + k * 0.22, 210, B_FIREBALL)
    w.sfx('enemyShoot', { x: e.x, pitch: 0.7 })
  }
  if (ticks(d, 0.3, dt, 1.2, 16)) fire(d, w, d.sx[SEGS - 1], d.sy[SEGS - 1], 2.4)
  return d.t > 5.9
}

const SEQ: Atk[][] = [
  [],
  [breath, dive, breath, dive],
  [embers, dive, breath, firefall, embers, dive, breath],
  [orbit, dive, firefall, embers, breath, dive],
]

function begin(d: Data, atk: Atk) {
  Object.assign(d, { atk, t: 0, n: 0, st: 0, t0: 0, len: 0, ring: 0, wave: -99, dir: chance(0.5) ? 1 : -1 })
}

const next = (d: Data) => begin(d, d.atk === rest ? SEQ[d.phase][d.i++ % SEQ[d.phase].length] : rest)

function phaseUp(e: Enemy, w: World, d: Data) {
  d.phase++
  d.i = 0
  d.trans = 2.4
  begin(d, rest)
  e.invuln = true
  e.burn = 0
  for (const b of w.bullets) if (!b.dead) {
    b.dead = true
    w.part({ x: b.x, y: b.y, life: 0.3, size: b.r * 1.5, size1: 0, color: b.color, glow: 1 })
  }
  const c = RIM[d.phase], [title, sub] = BANNERS[d.phase - 2]
  w.hooks.banner(loc(title), loc(sub), c)
  w.sfx('bossPhase')
  w.shake(0.8)
  w.flash(ORANGE, 0.35)
  w.hitstop(0.12)
  R.ripple(e.x, e.y, 2.2, 1.1)
  for (let i = 0; i < 3; i++) w.part({ x: e.x, y: e.y, life: 0.6 + i * 0.2, size: e.r, size1: 260 + i * 120, color: i === 1 ? GOLD : c, alpha: 0.9, shape: Shape.Ring, glow: 1.4 })
  const adds = d.phase === 2 ? ['cinder', 'cinder', 'cinder'] : ['bomber', 'cinder', 'bomber', 'cinder']
  adds.forEach((id, i) => {
    const a = (i / adds.length) * TAU
    inArena(w, e.x + Math.cos(a) * 240, e.y + Math.sin(a) * 240, 60)
    w.spawnEnemy(id, G.x, G.y)
  })
}

/** curled up and blazing between phases; erupts when it uncoils */
function coil(e: Enemy, w: World, d: Data, dt: number) {
  d.trans -= dt
  d.h += 3.4 * dt * d.dir
  e.x += Math.cos(d.h) * 250 * dt
  e.y += Math.sin(d.h) * 250 * dt
  e.rot = d.h
  d.glow = 1
  d.mouth = 0.8
  const i = Math.floor(rand(0, SEGS))
  w.part({ x: d.sx[i], y: d.sy[i], vx: rand(-40, 40), vy: rand(-140, -60), life: 0.6, size: rand(4, 8), size1: 0, color: chance(0.5) ? GOLD : ORANGE, glow: 1.2 })
  if (d.trans > 0) return
  e.invuln = false
  w.ringShot(e.x, e.y, 20, 140, rand(0, TAU), B_EMBER)
  w.burst(e.x, e.y, { n: 40, color: GOLD, speed: 500, life: 0.7, size: 4, stretch: 0.03 })
  w.shake(0.6)
  w.sfx('explodeBig', { x: e.x })
}

export default {
  id: 'pyre', name: l('Pyre Serpent', '焚火巨蛇'), title: l('Coil of the Crimson Expanse', '赤红荒原之蟒'),
  desc: l('A wildfire that learned to hunt.', '一场学会了狩猎的野火。'),
  shape: Shape.Diamond, color: RED, r: 38, hp: 56000, speed: 195, dmg: 26, xp: 0, mass: 80, boss: true, music: 'boss',

  spawn(e, w) {
    const d: Data = {
      phase: 1, trans: 0, t: 0, i: 0, n: 0, dir: 1, atk: rest, h: w.angleToPlayer(e),
      px: new Float32Array(N), py: new Float32Array(N), head: N - 1, lx: e.x, ly: e.y,
      sx: new Float32Array(SEGS), sy: new Float32Array(SEGS), sa: new Float32Array(SEGS),
      mouth: 0, glow: 0, aim: 0, sweep: 0, st: 0, t0: 0, ox: 0, oy: 0, dx: 0, dy: 0, len: 0, gone: 0, drop: 0, wave: -99, ring: 0,
      fx: new Float32Array(FIRES), fy: new Float32Array(FIRES), fe: new Float32Array(FIRES), fi: 0,
    }
    // emerge coiled: the stored path is a spiral winding into the head
    let a = d.h + Math.PI, r = 60
    for (let k = 0; k < N; k++) {
      const j = (N - 1 - k + N) % N
      d.px[j] = e.x + Math.cos(a) * r - Math.cos(d.h + Math.PI) * 60
      d.py[j] = e.y + Math.sin(a) * r - Math.sin(d.h + Math.PI) * 60
      a -= STEP / r
      r += 0.9
    }
    d.lx = d.px[N - 1]
    d.ly = d.py[N - 1]
    e.data = d
    pose(e, d)
  },

  ai(e, w, dt) {
    const d = e.data as Data
    record(d, e.x, e.y)
    pose(e, d)
    d.mouth = damp(d.mouth, 0, 5, dt)
    d.glow = Math.max(0, d.glow - dt * 2)
    if (d.trans > 0) coil(e, w, d, dt)
    else if (d.phase < 3 && e.hp < e.maxHp * TH[d.phase]) phaseUp(e, w, d)
    else {
      d.t += dt
      if (d.atk(e, w, d, dt)) next(d)
    }
    // the whole body burns
    const p = w.p
    if (!p.dead && p.iframes <= 0) {
      for (let i = 0; i < SEGS; i++) {
        const rr = SR[i] * 0.85 + p.r * 0.6
        if (dist2(d.sx[i], d.sy[i], p.x, p.y) < rr * rr) {
          w.hurt(BODY_DMG)
          break
        }
      }
    }
    // embers rising from scorched ground and scales
    for (let i = 0; i < FIRES; i++) {
      if (d.fe[i] > w.time && chance(dt * 5)) w.part({ x: d.fx[i] + rand(-22, 22), y: d.fy[i] + rand(-22, 22), vy: rand(-90, -40), life: rand(0.4, 0.7), size: rand(3, 6), size1: 0, color: chance(0.4) ? GOLD : ORANGE, glow: 1, drag: 1 })
    }
    if (chance(dt * 14)) {
      const i = Math.floor(rand(0, SEGS))
      w.part({ x: d.sx[i] + rand(-10, 10), y: d.sy[i] + rand(-10, 10), vy: rand(-60, -20), life: 0.5, size: 2.5, size1: 0, color: GOLD, glow: 1 })
    }
  },

  draw(e, w) {
    const d = e.data as Data, t = w.time, rim = RIM[d.phase]
    const blink = 0.55 + Math.sin(t * 30) * 0.15
    // telegraphs
    if (d.atk === breath && d.t < BT1) {
      const k = d.t / BT1, mid = d.aim + d.sweep / 2
      if (d.sweep) R.draw(Shape.Arc, e.x, e.y, RANGE / 2, RANGE / 2, mid, ORANGE, 0.08, 0, CONE + Math.abs(d.sweep) / 2)
      R.draw(Shape.Arc, e.x, e.y, RANGE / 2, RANGE / 2, d.aim, ORANGE, 0.1 + k * 0.14, 0, CONE)
      R.draw(Shape.Arc, e.x, e.y, RANGE, 2, d.aim, ORANGE, blink, 0.6, CONE)
      for (let s = -1; s <= 1; s += 2) {
        const a = d.aim + s * CONE
        R.line(e.x, e.y, e.x + Math.cos(a) * RANGE, e.y + Math.sin(a) * RANGE, 2, ORANGE, blink, 0.5)
      }
    }
    if (d.atk === dive && d.st === 0 && d.len) {
      const k = clamp((d.t - d.t0) / [0, 1.15, 0.95, 0.8][d.phase], 0, 1), hl = d.len / 2, ang = Math.atan2(d.dy, d.dx)
      const cx = d.ox + d.dx * hl, cy = d.oy + d.dy * hl
      R.draw(Shape.Capsule, cx, cy, hl + 34, 34, ang, ORANGE, 0.1, 0, 0)
      R.draw(Shape.Capsule, cx, cy, hl + 34, 34 * k, ang, ORANGE, 0.2, 0, 0)
      R.draw(Shape.Capsule, cx, cy, hl + 34, 34, ang, ORANGE, blink, 0.5, 1.5)
      for (let s = ((t * 260) % 70) + 40; s < d.len; s += 70) R.draw(Shape.Tri, d.ox + d.dx * s, d.oy + d.dy * s, 10, 10, ang, GOLD, 0.5 * k, 0.6)
    }
    if (d.ring) {
      const c = w.arena!
      R.draw(Shape.Ring, c.x, c.y, ORBIT_R + 34, ORBIT_R + 34, 0, ORANGE, 0.12, 0, 68)
      R.draw(Shape.Ring, c.x, c.y, ORBIT_R + 34, ORBIT_R + 34, 0, ORANGE, blink, 0.6, 2)
      R.draw(Shape.Ring, c.x, c.y, ORBIT_R - 34, ORBIT_R - 34, 0, ORANGE, blink, 0.6, 2)
    }
    // tail flame
    const tl = SEGS - 1, ta = d.sa[tl] + Math.PI, fl = 1 + Math.sin(t * 22) * 0.2
    R.draw(Shape.Tri, d.sx[tl] + Math.cos(ta) * 14, d.sy[tl] + Math.sin(ta) * 14, 13 * fl, 13 * fl, ta, GOLD, 0.9, 1.4)
    // body, tail → head
    for (let i = tl; i >= 0; i--) {
      const x = d.sx[i], y = d.sy[i], a = d.sa[i], r = SR[i]
      const heat = 0.5 + 0.5 * Math.sin(t * 7 - i * 0.55), tg = d.wave > -99 ? clamp(1 - (i - d.wave) / (LEAD * RATE), 0, 1) * (i > d.wave ? 1 : 0) : 0
      const c = tg > 0 ? mix(rim, WHITE, tg * 0.6) : mix(rim, GOLD, heat * 0.35 * (d.phase - 1))
      for (let s = -1; s <= 1; s += 2) {
        const fa = a + s * Math.PI / 2
        R.draw(Shape.Tri, x + Math.cos(fa) * r * 0.95, y + Math.sin(fa) * r * 0.95, r * 0.42, r * 0.42, a + Math.PI - s * 1.1, c, 0.85, 0.6)
      }
      R.draw(Shape.Circle, x, y, r, r, 0, DARK, 0.95, 0, 0, 0)
      R.draw(Shape.Hex, x, y, r * 0.98, r * 0.98, a, c, 1, 0.9, Math.max(2, r * 0.12))
      R.draw(Shape.Diamond, x, y, r * 0.5, r * 0.28, a, GOLD, 0.35 + heat * 0.5, 1)
      if (tg > 0) R.draw(Shape.Glow, x, y, r * 2.6, r * 2.6, 0, HOT, tg * 0.8)
    }
    // head
    const x = e.x, y = e.y, a = e.rot, r = e.r * (1 + d.glow * 0.08), fx = Math.cos(a), fy = Math.sin(a), sx = -fy, sy = fx
    const eye = e.flash > 0 ? WHITE : d.phase === 3 ? WHITE : GOLD, jaw = d.mouth * 0.5
    R.draw(Shape.Glow, x, y, r * 3.4, r * 3.4, 0, ORANGE, 0.25 + d.glow * 0.25)
    for (let s = -1; s <= 1; s += 2) {
      R.draw(Shape.Tri, x + fx * r * 0.7 + sx * s * r * 0.3, y + fy * r * 0.7 + sy * s * r * 0.3, r * 0.75, r * 0.38, a + s * jaw, DARK, 0.95, 0, 0, 0)
      R.draw(Shape.Tri, x + fx * r * 0.7 + sx * s * r * 0.3, y + fy * r * 0.7 + sy * s * r * 0.3, r * 0.75, r * 0.38, a + s * jaw, rim, 1, 1, 2.5)
      R.draw(Shape.Tri, x - fx * r * 0.55 + sx * s * r * 0.55, y - fy * r * 0.55 + sy * s * r * 0.55, r * 0.55, r * 0.22, a + Math.PI - s * 0.45, GOLD, 0.9, 0.9)
    }
    if (d.mouth > 0.05) R.draw(Shape.Glow, x + fx * r * 1.2, y + fy * r * 1.2, r * 2 * d.mouth, r * 2 * d.mouth, 0, GOLD, d.mouth)
    R.draw(Shape.Diamond, x, y, r * 1.2, r * 0.82, a, DARK, 0.96, 0, 0, 0)
    R.draw(Shape.Diamond, x, y, r * 1.2, r * 0.82, a, rim, 1, 1.3, 4)
    R.draw(Shape.Diamond, x - fx * r * 0.15, y - fy * r * 0.15, r * 0.6, r * 0.4, a, GOLD, 0.7, 0.6, 1.6)
    for (let s = -1; s <= 1; s += 2) {
      const ex = x + fx * r * 0.32 + sx * s * r * 0.36, ey = y + fy * r * 0.32 + sy * s * r * 0.36
      R.draw(Shape.Diamond, ex, ey, r * 0.2, r * 0.1, a + s * 0.5, eye, 1, 1.6)
    }
    if (e.invuln) R.draw(Shape.Ring, x, y, r * 1.6, r * 1.6, 0, WHITE, 0.5 + Math.sin(t * 20) * 0.3, 1.2, 2)
  },

  death(e, w) {
    const d = e.data as Data
    for (let i = 0; i < SEGS; i += 2) w.burst(d.sx[i], d.sy[i], { n: 10, color: chance(0.5) ? GOLD : ORANGE, speed: 300, life: 0.9, size: 4, shape: Shape.Hex, spin: 10 })
    for (let i = 0; i < 3; i++) w.part({ x: e.x, y: e.y, life: 0.8 + i * 0.25, size: e.r, size1: 300 + i * 160, color: i === 1 ? GOLD : RED, alpha: 0.9, shape: Shape.Ring, glow: 1.5 })
    for (const b of w.bullets) b.dead = true
  },
} satisfies EnemyDef
