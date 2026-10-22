import { renderer as R, Shape } from '../../core/gl'
import { l, loc } from '../../core/i18n'
import { chance, clamp, damp, hex, mix, rand, scale, segDist2, TAU, type RGB } from '../../core/math'
import type { Bullet, Enemy, EnemyDef } from '../../game/types'
import type { World } from '../../game/world'

// Bloom Matriarch — stage 3 boss. A colossal flower whose eight petals are turrets.
// Phase 1: petal volleys, pollen spirals, thorn lashes · 2: spore storms & seeded menders/sporelings · 3: full bloom with rotating radial lasers.

const GREEN = hex('#3dffa0'), TEAL = hex('#2ef2d0'), PINK = hex('#ff4fa8'), ROSE = hex('#ff8ad0'), GOLD = hex('#ffe066')
const WHITE: RGB = [1, 1, 1]
const DARK = scale(GREEN, 0.11)
const RIM: RGB[] = [GREEN, GREEN, mix(GREEN, TEAL, 0.5), hex('#9dffd8')]
const TH = [0, 0.66, 0.33]
const BANNERS = [
  [l('SPORE STORM', '孢子风暴'), l('The air itself turns against you.', '连空气都与你为敌。')],
  [l('FULL BLOOM', '盛放'), l('Behold the heart of the Lattice.', '直视晶格之心吧。')],
]
const P = 8, BEAMS = 6, BEAM_W = 13, BEAM_L = 1300, MAX_ADDS = 4
const BLOOM_ON = 1.4, BLOOM_FLIP = 5.2, BLOOM_END = 9.4

/** bullets that curl along an arc; b.data = turn rate (rad/s) */
const curl = (b: Bullet, _w: World, dt: number) => {
  const c = b.data * dt, cs = Math.cos(c), sn = Math.sin(c), vx = b.vx
  b.vx = vx * cs - b.vy * sn
  b.vy = vx * sn + b.vy * cs
  b.x += b.vx * dt
  b.y += b.vy * dt
}
/** spores burst out, stall, then drift and sway; b.data = launch angle */
const spore = (b: Bullet, _w: World, dt: number) => {
  const k = Math.exp(-1.2 * dt), a = b.data
  b.vx *= k
  b.vy *= k
  b.x += (b.vx + Math.cos(a) * 20 + Math.cos(b.t * 2 + a * 3) * 18) * dt
  b.y += (b.vy + Math.sin(a) * 20 + Math.sin(b.t * 1.6 + a * 3) * 18) * dt
}
const B_SEED: Partial<Bullet> = { r: 6, dmg: 10, color: PINK, shape: Shape.Diamond }
const B_CURL: Partial<Bullet> = { r: 6, dmg: 10, color: ROSE, life: 5.5, update: curl }
const B_SPORE: Partial<Bullet> = { r: 8, dmg: 9, color: PINK, life: 7, update: spore }
const B_RING: Partial<Bullet> = { r: 7, dmg: 10, color: PINK }

type Atk = (e: Enemy, w: World, d: Data, dt: number) => boolean

interface Data {
  phase: number; trans: number; t: number; i: number; n: number; dir: number; atk: Atk
  rot: number; rotV: number; rotVTo: number // petal crown spin
  open: number; openTo: number // petal spread (1 = idle)
  pc: Float32Array // per-petal charge glow (telegraph)
  glow: number
  bA: number; bV: number; bVTo: number; bOn: number // radial lasers: angle, spin, state (<0 off, 0..1 warming, ≥1 live)
  adds: Enemy[]
}

const G = { x: 0, y: 0 } // scratch point

/** ticks of a clock (from, from+p, … n times) crossed this frame. `from` must be > 0. */
function ticks(d: Data, p: number, dt: number, from: number, n = Infinity) {
  return clamp(Math.floor((d.t - from) / p) + 1, 0, n) - clamp(Math.floor((d.t - dt - from) / p) + 1, 0, n)
}

function inArena(w: World, x: number, y: number, m: number) {
  const a = w.arena!, dx = x - a.x, dy = y - a.y, dl = Math.hypot(dx, dy), max = a.r - m
  const k = dl > max ? max / dl : 1
  G.x = a.x + dx * k
  G.y = a.y + dy * k
}

const petalA = (d: Data, k: number) => d.rot + (k * TAU) / P

/** petal tip (turret muzzle) → G */
function tip(e: Enemy, d: Data, k: number) {
  const a = petalA(d, k), r = e.r * (1.7 + 0.75 * d.open)
  G.x = e.x + Math.cos(a) * r
  G.y = e.y + Math.sin(a) * r
}

function steer(e: Enemy, tx: number, ty: number, sp: number, dt: number) {
  const dx = tx - e.x, dy = ty - e.y, l = Math.hypot(dx, dy) || 1, v = Math.min(sp, l * 1.5)
  e.vx = damp(e.vx, (dx / l) * v, 2, dt)
  e.vy = damp(e.vy, (dy / l) * v, 2, dt)
}

/** a rooted giant: creeps to keep ~300 from the player */
function drift(e: Enemy, w: World, dt: number, mul = 1) {
  const p = w.p, a = Math.atan2(e.y - p.y, e.x - p.x)
  steer(e, p.x + Math.cos(a) * 300, p.y + Math.sin(a) * 300, e.speed * mul, dt)
}

// ───────────────────────────── attacks ─────────────────────────────
const rest: Atk = (e, w, d, dt) => {
  drift(e, w, dt)
  return d.t > 1.6 - d.phase * 0.25
}

/** petals fire aimed triplets one after another around the crown — watch the glowing tip */
const petalBurst: Atk = (e, w, d, dt) => {
  drift(e, w, dt, 0.6)
  const gap = d.phase === 1 ? 0.2 : 0.15, n = d.phase === 1 ? P : P * 2, t0 = 0.5
  for (let s = Math.max(0, Math.floor((d.t - t0) / gap)); s < n && t0 + s * gap < d.t + 0.4; s++) {
    const k = (((s * 3 * d.dir) % P) + P) % P, c = clamp(1 - (t0 + s * gap - d.t) / 0.4, 0, 1)
    d.pc[k] = Math.max(d.pc[k], c)
    if (d.phase > 1) d.pc[(k + 4) % P] = Math.max(d.pc[(k + 4) % P], c)
  }
  for (let q = ticks(d, gap, dt, t0, n); q > 0; q--) {
    const s = d.n++, k = (((s * 3 * d.dir) % P) + P) % P
    for (let m = 0; m < (d.phase > 1 ? 2 : 1); m++) {
      tip(e, d, (k + m * 4) % P)
      const a = Math.atan2(w.p.y - G.y, w.p.x - G.x)
      for (let j = -1; j <= 1; j++) w.enemyShot(G.x, G.y, a + j * 0.16, 190 + d.phase * 15, B_SEED)
      w.burst(G.x, G.y, { n: 4, color: PINK, speed: 120, life: 0.3, size: 2.5 })
    }
    w.sfx('turret', { x: e.x, vol: 0.5 }, 0.05)
  }
  return d.t > t0 + n * gap + 0.4
}

/** the crown spins and every petal streams curling pollen — weave between the arms */
const pollenSpiral: Atk = (e, w, d, dt) => {
  e.vx = damp(e.vx, 0, 3, dt)
  e.vy = damp(e.vy, 0, 3, dt)
  d.rotVTo = 0.8 * d.dir
  const all = d.phase > 1, wind = 0.7
  for (let k = 0; k < P; k += all ? 1 : 2) d.pc[k] = Math.max(d.pc[k], Math.min(1, d.t / wind))
  if (ticks(d, 0.19, dt, wind, 17)) {
    for (let k = 0; k < P; k += all ? 1 : 2) {
      tip(e, d, k)
      const b = w.enemyShot(G.x, G.y, petalA(d, k), 120, B_CURL)
      b.data = -0.55 * d.dir
    }
    w.sfx('spore', { x: e.x, vol: 0.4 }, 0.1)
  }
  return d.t > wind + 17 * 0.19 + 0.4
}

/** petals clench, then burst open and loose a storm of drifting spores */
const sporeStorm: Atk = (e, w, d, dt) => {
  drift(e, w, dt, 0.3)
  const wind = 0.9, dur = 2.6, rate = [0, 20, 38, 24][d.phase]
  if (d.t < wind) {
    d.openTo = 0.45
    d.glow = d.t / wind
    for (let k = 0; k < P; k++) d.pc[k] = Math.max(d.pc[k], d.t / wind)
    if (ticks(d, 1, dt, 0.01, 1)) w.sfx('charge', { x: e.x, pitch: 0.6 })
    return false
  }
  d.openTo = 1.25
  for (let q = ticks(d, 1 / rate, dt, wind, Math.round(rate * dur)); q > 0; q--) {
    const k = Math.floor(rand(0, P)), a = petalA(d, k) + rand(-0.7, 0.7)
    tip(e, d, k)
    const b = w.enemyShot(G.x, G.y, a, rand(150, 380), B_SPORE)
    b.data = a
  }
  if (ticks(d, 0.25, dt, wind, 10)) w.sfx('spore', { x: e.x, pitch: rand(0.8, 1.2) })
  return d.t > wind + dur + 0.5
}

/** thorn lashes: telegraphed lines radiating from the core, one always aimed at you */
const vines: Atk = (e, w, d, dt) => {
  drift(e, w, dt, 0.5)
  const n = 5 + d.phase, waves = d.phase > 1 ? 2 : 1
  if (ticks(d, 0.6, dt, 0.2, waves)) {
    const off = d.n++ % 2 ? Math.PI / n : 0, a0 = w.angleToPlayer(e) + off
    for (let k = 0; k < n; k++) {
      const a = a0 + (k * TAU) / n, c = Math.cos(a), s = Math.sin(a)
      w.hazard({
        kind: 'line', x: e.x + c * e.r * 0.6, y: e.y + s * e.r * 0.6, x2: e.x + c * 760, y2: e.y + s * 760, r: 16, delay: 0.95, active: 0.25, dmg: 18, color: PINK,
        onBoom: k ? undefined : (h, w) => w.sfx('whip', { x: h.x }),
      })
    }
    w.sfx('charge', { x: e.x, pitch: 1.3 })
    d.glow = 1
  }
  return d.t > 0.2 + waves * 0.6 + 1.3
}

/** petals hurl seed pods that sprout menders & sporelings (capped) */
const summon: Atk = (e, w, d, dt) => {
  drift(e, w, dt, 0.4)
  if (ticks(d, 1, dt, 0.3, 1)) {
    d.adds = d.adds.filter((a) => !a.dead)
    const ids = d.phase === 3 ? ['mender', 'sporeling', 'mender'] : ['mender', 'sporeling', 'sporeling']
    const n = Math.min(3, MAX_ADDS - d.adds.length)
    for (let i = 0; i < n; i++) {
      const k = (i * 3 + Math.floor(rand(0, P))) % P, a = petalA(d, k)
      tip(e, d, k)
      const sx = G.x, sy = G.y, r = rand(160, 300)
      inArena(w, e.x + Math.cos(a) * r, e.y + Math.sin(a) * r, 60)
      const id = ids[i]
      w.hazard({
        x: G.x, y: G.y, r: 46, delay: 1.1, active: 0.15, dmg: 12, color: PINK,
        onBoom: (h, w) => {
          d.adds.push(w.spawnEnemy(id, h.x, h.y))
          w.burst(h.x, h.y, { n: 16, color: GREEN, speed: 200, life: 0.5, size: 3, shape: Shape.Diamond, spin: 6 })
          w.sfx('plant', { x: h.x })
        },
      })
      w.part({ x: sx, y: sy, vx: (G.x - sx) / 1.1, vy: (G.y - sy) / 1.1, drag: 0, life: 1.1, size: 7, size1: 9, color: GREEN, glow: 1.3, shape: Shape.Diamond, spin: 8 })
    }
    w.ringShot(e.x, e.y, 18 + d.phase * 2, 140, rand(0, TAU), B_RING)
    w.sfx('enemyShoot', { x: e.x, pitch: 0.8 })
  }
  return d.t > 1.9
}

/** Full Bloom: roots in the arena's heart and sweeps six slow-turning lasers, flipping direction once */
const bloom: Atk = (e, w, d, dt) => {
  const ar = w.arena!
  steer(e, ar.x, ar.y, e.speed * 2, dt)
  d.openTo = 1.45
  if (d.t < BLOOM_ON) {
    if (d.bOn < 0) {
      d.bA = w.angleToPlayer(e) + Math.PI / BEAMS
      d.bV = d.bVTo = 0.3 * d.dir
      w.sfx('charge', { x: e.x, pitch: 0.5 })
    }
    d.bOn = d.t / BLOOM_ON
  } else if (d.t < BLOOM_END) {
    if (d.bOn < 1) {
      w.sfx('beam', { x: e.x })
      w.shake(0.4)
      R.ripple(e.x, e.y, 1.2, 0.6)
    }
    d.bOn = 1 + (d.t - BLOOM_ON)
    if (ticks(d, 1, dt, BLOOM_FLIP, 1)) {
      d.bVTo = -d.bV
      w.sfx('bossWarn', { vol: 0.4, pitch: 1.5 })
    }
    for (let q = ticks(d, 1 / 9, dt, BLOOM_ON, 72); q > 0; q--) {
      const k = Math.floor(rand(0, P)), a = petalA(d, k) + rand(-0.4, 0.4)
      tip(e, d, k)
      const b = w.enemyShot(G.x, G.y, a, rand(120, 260), B_SPORE)
      b.data = a
    }
    w.sfx('laser', { x: e.x, vol: 0.3 }, 0.35)
  } else d.bOn = -1
  return d.t > BLOOM_END + 0.5
}

const SEQ: Atk[][] = [
  [],
  [petalBurst, pollenSpiral, vines, petalBurst, sporeStorm],
  [sporeStorm, petalBurst, summon, vines, pollenSpiral, sporeStorm, petalBurst],
  [bloom, petalBurst, summon, pollenSpiral, bloom, sporeStorm, vines],
]

function begin(d: Data, atk: Atk) {
  Object.assign(d, { atk, t: 0, n: 0, dir: chance(0.5) ? 1 : -1, rotVTo: 0.25, openTo: 1, bOn: -1 })
}

const next = (d: Data) => begin(d, d.atk === rest ? SEQ[d.phase][d.i++ % SEQ[d.phase].length] : rest)

function phaseUp(e: Enemy, w: World, d: Data) {
  d.phase++
  d.i = 0
  d.trans = 2.4
  begin(d, rest)
  d.openTo = 0.2
  e.invuln = true
  e.burn = 0
  for (const b of w.bullets) if (!b.dead) {
    b.dead = true
    w.part({ x: b.x, y: b.y, life: 0.3, size: b.r * 1.5, size1: 0, color: b.color, glow: 1 })
  }
  const c = RIM[d.phase], [title, sub] = BANNERS[d.phase - 2]
  w.hooks.banner(loc(title), loc(sub), c)
  w.sfx('bossPhase')
  w.shake(0.7)
  w.flash(GREEN, 0.3)
  w.hitstop(0.12)
  R.ripple(e.x, e.y, 2.2, 1.1)
  for (let i = 0; i < 3; i++) w.part({ x: e.x, y: e.y, life: 0.6 + i * 0.2, size: e.r, size1: 260 + i * 120, color: i === 1 ? PINK : c, alpha: 0.9, shape: Shape.Ring, glow: 1.4 })
}

export default {
  id: 'matriarch', name: l('Bloom Matriarch', '绽放母体'), title: l('Heart of the Verdant Lattice', '翠绿晶格之心'),
  desc: l('Every petal a turret. Every seed a soldier.', '每片花瓣都是炮台，每颗种子都是士兵。'),
  shape: Shape.Oct, color: GREEN, r: 64, hp: 46000, speed: 45, dmg: 24, xp: 0, mass: 120, boss: true, music: 'boss',

  spawn(e) {
    const d: Data = {
      phase: 1, trans: 0, t: 0, i: 0, n: 0, dir: 1, atk: rest, rot: 0, rotV: 0, rotVTo: 0.25, open: 0, openTo: 1,
      pc: new Float32Array(P), glow: 0, bA: 0, bV: 0, bVTo: 0, bOn: -1, adds: [],
    }
    e.data = d
  },

  ai(e, w, dt) {
    const d = e.data as Data
    d.glow = Math.max(0, d.glow - dt * 2)
    const fade = Math.exp(-8 * dt)
    for (let k = 0; k < P; k++) d.pc[k] *= fade
    if (d.trans > 0) {
      d.trans -= dt
      d.rotVTo = 3 * d.dir
      d.glow = 1
      e.vx = damp(e.vx, 0, 4, dt)
      e.vy = damp(e.vy, 0, 4, dt)
      if (d.trans < 0.6) d.openTo = 1.6
      if (d.trans <= 0) {
        e.invuln = false
        begin(d, rest)
        w.ringShot(e.x, e.y, 28, 150, rand(0, TAU), B_RING)
        w.burst(e.x, e.y, { n: 40, color: GREEN, speed: 460, life: 0.7, size: 5, shape: Shape.Diamond, spin: 8 })
        w.sfx('explodeBig', { x: e.x })
        w.shake(0.5)
      }
    } else if (d.phase < 3 && e.hp < e.maxHp * TH[d.phase]) phaseUp(e, w, d)
    else {
      d.t += dt
      if (d.atk(e, w, d, dt)) next(d)
    }
    d.rotV = damp(d.rotV, d.rotVTo, 2, dt)
    d.rot += d.rotV * dt
    d.open = damp(d.open, d.openTo, 4, dt)
    e.rot = d.rot
    // radial lasers
    if (d.bOn >= 0) {
      d.bV = damp(d.bV, d.bVTo, 1.5, dt)
      d.bA += d.bV * dt
      const p = w.p
      if (d.bOn >= 1 && !p.dead && p.iframes <= 0) {
        const rr = BEAM_W + p.r * 0.5
        for (let k = 0; k < BEAMS; k++) {
          const a = d.bA + (k * TAU) / BEAMS, c = Math.cos(a), s = Math.sin(a)
          if (segDist2(p.x, p.y, e.x + c * e.r * 0.5, e.y + s * e.r * 0.5, e.x + c * BEAM_L, e.y + s * BEAM_L) < rr * rr) {
            w.hurt(14)
            break
          }
        }
      }
    }
  },

  draw(e, w) {
    const d = e.data as Data, t = w.time, x = e.x, y = e.y, rim = RIM[d.phase]
    const r = e.r * (1 + Math.sin(t * 2.4) * 0.025 + d.glow * 0.05), op = d.open
    // radial lasers (under the flower)
    if (d.bOn >= 0) {
      const live = d.bOn >= 1, flip = d.atk === bloom && d.t > BLOOM_FLIP - 0.6 && d.t < BLOOM_FLIP
      for (let k = 0; k < BEAMS; k++) {
        const a = d.bA + (k * TAU) / BEAMS, c = Math.cos(a), s = Math.sin(a), hl = BEAM_L / 2
        if (live) {
          const fl = 1 + Math.sin(t * 40 + k) * 0.12
          R.draw(Shape.Capsule, x + c * hl, y + s * hl, hl, BEAM_W * fl, a, flip ? WHITE : PINK, 0.9, 1.5)
          R.draw(Shape.Capsule, x + c * hl, y + s * hl, hl, BEAM_W * 0.35, a, WHITE, 1, 0.5)
        } else {
          R.draw(Shape.Capsule, x + c * hl, y + s * hl, hl, BEAM_W, a, PINK, 0.12, 0, 0)
          R.draw(Shape.Capsule, x + c * hl, y + s * hl, hl, 1.5 + d.bOn * 3, a, PINK, 0.5 + Math.sin(t * 30) * 0.3, 0.8)
        }
      }
      if (live) R.draw(Shape.Glow, x, y, r * 3, r * 3, 0, PINK, 0.6)
    }
    // halo & thorny vine ring
    R.draw(Shape.Glow, x, y, r * 4, r * 4, 0, TEAL, 0.18 + d.glow * 0.2)
    const vr = r * (2.45 + op * 0.25)
    R.draw(Shape.Ring, x, y, vr, vr, 0, rim, 0.35, 0.5, 1.5)
    for (let i = 0; i < 16; i++) {
      const a = -d.rot * 0.6 + (i * TAU) / 16
      R.draw(Shape.Tri, x + Math.cos(a) * vr, y + Math.sin(a) * vr, 6, 4, a + Math.PI / 2, rim, 0.6, 0.5)
    }
    // outer petals = turrets
    for (let k = 0; k < P; k++) {
      const a = petalA(d, k), c = Math.cos(a), s = Math.sin(a), pl = r * (0.72 + 0.28 * op), pd = r * (0.85 + 0.55 * op) + pl * 0.35
      const px = x + c * pd, py = y + s * pd, ch = d.pc[k], col = ch > 0.05 ? mix(rim, PINK, ch) : rim
      R.draw(Shape.Diamond, px, py, pl, r * 0.34, a, DARK, 0.95, 0, 0, 0)
      R.draw(Shape.Diamond, px, py, pl, r * 0.34, a, col, 1, 0.9 + ch, 3)
      R.draw(Shape.Diamond, px, py, pl * 0.6, r * 0.15, a, TEAL, 0.5, 0.4, 1.2)
      tip(e, d, k)
      const or = r * (0.12 + ch * 0.06)
      if (ch > 0.05) R.draw(Shape.Glow, G.x, G.y, or * 5, or * 5, 0, PINK, ch * 0.8)
      R.draw(Shape.Circle, G.x, G.y, or, or, 0, PINK, 0.5 + ch * 0.5, 1)
      R.draw(Shape.Circle, G.x, G.y, or * 0.45, or * 0.45, 0, WHITE, 0.6 + ch * 0.4, 0)
    }
    // inner petals
    for (let k = 0; k < P; k++) {
      const a = petalA(d, k) + Math.PI / P - d.rot * 0.3, pd = r * (0.55 + 0.15 * op)
      R.draw(Shape.Diamond, x + Math.cos(a) * pd, y + Math.sin(a) * pd, r * 0.5, r * 0.22, a, DARK, 0.95, 0, 0, 0)
      R.draw(Shape.Diamond, x + Math.cos(a) * pd, y + Math.sin(a) * pd, r * 0.5, r * 0.22, a, TEAL, 0.9, 0.7, 2)
    }
    // core: stamen star & the eye
    const eye = e.flash > 0 ? WHITE : d.phase === 3 ? ROSE : GOLD
    R.draw(Shape.Oct, x, y, r * 0.5, r * 0.5, d.rot * 0.5, DARK, 1, 0, 0, 0)
    R.draw(Shape.Oct, x, y, r * 0.5, r * 0.5, d.rot * 0.5, rim, 1, 1.2, 3)
    R.draw(Shape.Star, x, y, r * 0.38, r * 0.38, -d.rot * 1.4, GOLD, 0.7, 0.8, 1.6)
    R.draw(Shape.Glow, x, y, r * 1.4, r * 1.4, 0, eye, 0.4 + d.glow * 0.5)
    R.draw(Shape.Circle, x, y, r * (0.17 + d.glow * 0.04), r * (0.17 + d.glow * 0.04), 0, eye, 1, 1.5)
    R.draw(Shape.Circle, x, y, r * 0.07, r * 0.07, 0, WHITE, 1, 0)
    if (e.invuln) R.draw(Shape.Ring, x, y, r * 1.5, r * 1.5, 0, WHITE, 0.5 + Math.sin(t * 20) * 0.3, 1.2, 2)
  },

  death(e, w) {
    const d = e.data as Data
    for (let k = 0; k < P; k++) {
      const a = petalA(d, k)
      w.part({ x: e.x, y: e.y, vx: Math.cos(a) * 420, vy: Math.sin(a) * 420, life: 1.2, size: e.r * 0.7, size1: 0, color: GREEN, shape: Shape.Diamond, rot: a, spin: rand(-4, 4), glow: 1.2, drag: 2 })
    }
    w.burst(e.x, e.y, { n: 50, color: PINK, speed: 500, life: 1, size: 4 })
    for (let i = 0; i < 3; i++) w.part({ x: e.x, y: e.y, life: 0.8 + i * 0.25, size: e.r, size1: 300 + i * 160, color: i === 1 ? PINK : GREEN, alpha: 0.9, shape: Shape.Ring, glow: 1.5 })
    for (const b of w.bullets) b.dead = true
    for (const a of d.adds) if (!a.dead) w.kill(a, null)
  },
} satisfies EnemyDef
