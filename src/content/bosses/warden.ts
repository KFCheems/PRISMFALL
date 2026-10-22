import { renderer as R, Shape } from '../../core/gl'
import { l, loc } from '../../core/i18n'
import { chance, clamp, damp, dist2, ease, hex, lerp, rand, scale, TAU, wrapAngle, type RGB } from '../../core/math'
import type { Bullet, Enemy, EnemyDef } from '../../game/types'
import type { World } from '../../game/world'

// The Hexwarden — stage 1 boss. A hexagonal keeper ringed by six shield plates.
// Phase 1: gapped ring volleys & vertex streams · 2: boomerang plate throws & plate carousel · 3: hexfall slams & counter-spirals.

const BLUE = hex('#5ad1ff'), ICE = hex('#b4f6ff'), CYAN = hex('#3dfff2'), PINK = hex('#ff4fa0'), HOT = hex('#ff2e7e')
const WHITE: RGB = [1, 1, 1], BLACK: RGB = [0, 0, 0]
const DARK = scale(BLUE, 0.13)
const RIM: RGB[] = [BLUE, BLUE, hex('#57f2ff'), ICE] // outline per phase
const EYE: RGB[] = [CYAN, CYAN, CYAN, HOT]
const TH = [0, 0.66, 0.33] // hp fraction that ends phase n
const BANNERS = [
  [l('SHIELDS UNBOUND', '护盾解放'), l('The plates break orbit.', '护盾板挣脱了轨道。')],
  [l('HEXFALL', '六角陨落'), l('It will not let you pass.', '它绝不会放你过去。')],
]
const PLATES = 6, ORBIT = 96, AIM_T = 0.55, OUT_T = 0.7, BAND = 250, ARMED = BAND - 40 // orbiting plates only bite once out in the band
const ORB = 0, AIM = 1, OUT = 2, BACK = 3 // plate modes

const B_RING: Partial<Bullet> = { r: 7, dmg: 10, color: PINK }
const B_STREAM: Partial<Bullet> = { r: 6, dmg: 9, color: HOT, shape: Shape.Diamond, life: 4.5 }
const B_AIM: Partial<Bullet> = { r: 6, dmg: 10, color: HOT, shape: Shape.Tri }
const B_SLAM: Partial<Bullet> = { r: 8, dmg: 12, color: PINK, shape: Shape.Hex }
const B_SPIRAL: Partial<Bullet> = { r: 6, dmg: 10, color: HOT, shape: Shape.Diamond, life: 5 }
const B_SPIRAL2: Partial<Bullet> = { r: 6, dmg: 10, color: PINK, life: 5 }
const B_APEX: Partial<Bullet> = { r: 5, dmg: 8, color: HOT, life: 2.5 }

type Atk = (e: Enemy, w: World, d: Data, dt: number) => boolean

interface Plate { x: number; y: number; slot: number; mode: number; t: number; dx: number; dy: number; len: number; sx: number; sy: number; rot: number }
interface Data {
  phase: number; trans: number; t: number; i: number; n: number; dir: number; atk: Atk; dmg: number
  rot: number; rotV: number; spinTo: number // body spin
  orbA: number; orbV: number; orbVTo: number; orb: number; orbTo: number // plate ring
  ring: number // carousel telegraph radius (0 = none)
  plates: Plate[]
  glow: number; air: number; landed: boolean; gap: number; t0: number; sx: number; sy: number; tx: number; ty: number
}

/** true on the frames the attack clock passes from, from+p, … (n times). `from` must be > 0. */
const every = (d: Data, p: number, dt: number, from: number, n = Infinity) => {
  const k = Math.floor((d.t - from) / p)
  return k >= 0 && k < n && k !== Math.floor((d.t - dt - from) / p)
}

/** ring of n bullets with a hole of `gap` bullets centred on angle ga */
function gapRing(w: World, x: number, y: number, n: number, speed: number, ga: number, gap: number, o: Partial<Bullet>) {
  const step = TAU / n, half = (gap / 2) * step
  for (let i = 0; i < n; i++) {
    const a = ga + (i + 0.5) * step
    if (Math.abs(wrapAngle(a - ga)) > half) w.enemyShot(x, y, a, speed, o)
  }
}

function steer(e: Enemy, tx: number, ty: number, sp: number, dt: number) {
  const dx = tx - e.x, dy = ty - e.y, l = Math.hypot(dx, dy) || 1, v = Math.min(sp, l * 1.5)
  e.vx = damp(e.vx, (dx / l) * v, 3, dt)
  e.vy = damp(e.vy, (dy / l) * v, 3, dt)
}

const brake = (e: Enemy, dt: number) => {
  e.vx = damp(e.vx, 0, 4, dt)
  e.vy = damp(e.vy, 0, 4, dt)
}

/** keep `range` from the player while slowly circling them */
function hover(e: Enemy, w: World, range: number, sp: number, dt: number) {
  const a = Math.atan2(e.y - w.p.y, e.x - w.p.x) + 0.3
  steer(e, w.p.x + Math.cos(a) * range, w.p.y + Math.sin(a) * range, sp, dt)
}

// ───────────────────────────── attacks ─────────────────────────────
const rest: Atk = (e, w, d, dt) => {
  hover(e, w, 280, e.speed, dt)
  return d.t > 1.5 - d.phase * 0.3
}

/** concentric rings, each with a hole that shifts — chase the gap */
const volley: Atk = (e, w, d, dt) => {
  hover(e, w, 260, e.speed * 0.5, dt)
  const n = 3 + d.phase, start = 0.6, gapT = 0.75
  if (d.t < start) d.glow = d.t / start
  else if (every(d, gapT, dt, start, n)) {
    d.gap = d.n === 0 ? w.angleToPlayer(e) + rand(-0.8, 0.8) : d.gap + rand(0.55, 0.85) * (d.n % 2 ? 1 : -1)
    d.n++
    gapRing(w, e.x, e.y, 26 + d.phase * 5, 145 + d.phase * 10, d.gap, 4, B_RING)
    w.ringFx(e.x, e.y, e.r * 1.8, PINK)
    w.sfx('enemyShoot', { x: e.x, pitch: 0.75 })
    d.glow = 1
  }
  return d.t > start + n * gapT + 0.4
}

/** six bullet streams pour from the vertices while the hexagon turns */
const streams: Atk = (e, w, d, dt) => {
  hover(e, w, 250, e.speed * 0.3, dt)
  if (d.t < 0.6) d.glow = d.t / 0.6
  else d.spinTo = 0.45 * d.dir
  if (every(d, 0.13, dt, 0.6, 23)) {
    for (let k = 0; k < 6; k++) {
      const a = d.rot + (k * TAU) / 6
      w.enemyShot(e.x + Math.cos(a) * e.r * 1.15, e.y + Math.sin(a) * e.r * 1.15, a, 165, B_STREAM)
    }
    w.sfx('enemyShoot', { x: e.x, vol: 0.5 }, 0.12)
  }
  return d.t > 3.9
}

/** quick 5-way fans aimed at the player */
const lances: Atk = (e, w, d, dt) => {
  hover(e, w, 300, e.speed * 0.8, dt)
  if (every(d, 0.55, dt, 0.4, 4)) {
    const a = w.angleToPlayer(e)
    for (let k = -2; k <= 2; k++) w.enemyShot(e.x, e.y, a + k * 0.2, 230, B_AIM)
    w.sfx('enemyShoot', { x: e.x, pitch: 1.2 })
    d.glow = 1
  }
  return d.t > 3
}

function launch(pl: Plate, w: World, e: Enemy, a: number) {
  pl.mode = AIM
  pl.t = 0
  pl.dx = Math.cos(a)
  pl.dy = Math.sin(a)
  pl.len = clamp(Math.sqrt(dist2(e.x, e.y, w.p.x, w.p.y)) + 160, 380, 640)
}

/** plates detach, telegraph their path, then boomerang out and back */
const throwPlates: Atk = (e, w, d, dt) => {
  hover(e, w, 300, e.speed * 0.6, dt)
  const waves = d.phase + 1, per = d.phase
  if (every(d, 1.5, dt, 0.2, waves)) {
    const a0 = w.angleToPlayer(e)
    let k = 0
    for (const pl of d.plates) {
      if (pl.mode !== ORB || k >= per) continue
      launch(pl, w, e, a0 + (k - (per - 1) / 2) * 0.5)
      k++
    }
    if (k) w.sfx('charge', { x: e.x })
  }
  return d.t > 0.2 + waves * 1.5 && d.plates.every((pl) => pl.mode === ORB)
}

/** plates swing out into a wide spinning band — stay out of it */
const carousel: Atk = (e, w, d, dt) => {
  brake(e, dt)
  const out = d.t > 0.9 && d.t < 5.6
  d.ring = d.t < 1.4 ? BAND : 0
  d.orbTo = out ? BAND : ORBIT
  d.orbVTo = out ? 0.75 * d.dir : 0.6
  if (every(d, 1.25, dt, 1.6, 3)) {
    gapRing(w, e.x, e.y, 22, 125, w.angleToPlayer(e) + rand(-1.2, 1.2), 3, B_RING)
    w.sfx('enemyShoot', { x: e.x, pitch: 0.7 })
  }
  return d.t > 6.4
}

function land(e: Enemy, w: World, d: Data) {
  if (e.dead) return
  d.landed = true
  d.air = 0
  e.x = d.tx
  e.y = d.ty
  e.dmg = d.dmg
  gapRing(w, e.x, e.y, 30, 165, w.angleToPlayer(e) + rand(0.7, 1.3) * (chance(0.5) ? 1 : -1), 4, B_SLAM)
  w.shake(0.7)
  w.hitstop(0.05)
  R.ripple(e.x, e.y, 1.6, 0.7)
  w.sfx('explodeBig', { x: e.x })
  w.burst(e.x, e.y, { n: 30, color: BLUE, speed: 420, life: 0.6, size: 4, shape: Shape.Hex, spin: 6 })
  w.ringFx(e.x, e.y, 200, PINK)
}

/** Hexfall: three telegraphed leaps; each landing sends out a gapped shockwave */
const slam: Atk = (e, w, d, dt) => {
  if (every(d, 1.55, dt, 0.3, 3)) {
    const p = w.p, ar = w.arena!
    let tx = p.x + p.vx * 0.35, ty = p.y + p.vy * 0.35
    const dx = tx - ar.x, dy = ty - ar.y, dl = Math.hypot(dx, dy), max = ar.r - e.r
    if (dl > max) {
      tx = ar.x + (dx / dl) * max
      ty = ar.y + (dy / dl) * max
    }
    Object.assign(d, { sx: e.x, sy: e.y, tx, ty, t0: d.t, landed: false })
    e.dmg = 0
    w.hazard({ x: tx, y: ty, r: 135, delay: 1, active: 0.15, dmg: 25, color: PINK, onBoom: () => land(e, w, d) })
    w.sfx('charge', { x: e.x, pitch: 0.7 })
  }
  if (!d.landed) {
    const k = clamp(d.t - d.t0, 0, 1), f = ease.inOutSine(k)
    e.x = lerp(d.sx, d.tx, f)
    e.y = lerp(d.sy, d.ty, f)
    e.vx = e.vy = 0
    d.air = Math.sin(k * Math.PI)
  } else brake(e, dt)
  return d.t > 0.3 + 3 * 1.55 + 0.3 && d.landed
}

/** retreats to the arena's heart and spins a counter-rotating lattice */
const spiral: Atk = (e, w, d, dt) => {
  const ar = w.arena!
  steer(e, ar.x, ar.y, e.speed * 1.5, dt)
  if (d.t < 0.8) {
    d.glow = d.t / 0.8
    return false
  }
  d.spinTo = 2 * d.dir
  if (every(d, 0.12, dt, 0.8, 38)) {
    const s = d.t * 1.1 * d.dir
    for (let k = 0; k < 3; k++) {
      w.enemyShot(e.x, e.y, s + (k * TAU) / 3, 150, B_SPIRAL)
      w.enemyShot(e.x, e.y, -s * 0.7 + (k * TAU) / 3 + Math.PI / 3, 115, B_SPIRAL2)
    }
    w.sfx('enemyShoot', { x: e.x, vol: 0.4 }, 0.12)
  }
  return d.t > 0.8 + 38 * 0.12 + 0.5
}

const SEQ: Atk[][] = [
  [],
  [volley, streams, lances, volley, streams],
  [throwPlates, volley, carousel, throwPlates, streams, lances],
  [slam, spiral, throwPlates, volley, slam, carousel],
]

function begin(d: Data, atk: Atk) {
  Object.assign(d, { atk, t: 0, n: 0, dir: chance(0.5) ? 1 : -1, spinTo: 0.35, orbTo: ORBIT, orbVTo: 0.6, ring: 0 })
}

const next = (d: Data) => begin(d, d.atk === rest ? SEQ[d.phase][d.i++ % SEQ[d.phase].length] : rest)

function phaseUp(e: Enemy, w: World, d: Data) {
  d.phase++
  d.i = 0
  d.trans = 2.2
  begin(d, rest)
  e.invuln = true
  e.burn = 0
  for (const pl of d.plates) if (pl.mode !== ORB) {
    pl.mode = BACK
    pl.t = 0
  }
  for (const b of w.bullets) if (!b.dead) {
    b.dead = true
    w.part({ x: b.x, y: b.y, life: 0.3, size: b.r * 1.5, size1: 0, color: b.color, glow: 1 })
  }
  const c = RIM[d.phase], [title, sub] = BANNERS[d.phase - 2]
  w.hooks.banner(loc(title), loc(sub), c)
  w.sfx('bossPhase')
  w.shake(0.7)
  w.flash(c, 0.35)
  w.hitstop(0.12)
  R.ripple(e.x, e.y, 2.2, 1.1)
  for (let i = 0; i < 3; i++) w.part({ x: e.x, y: e.y, life: 0.6 + i * 0.2, size: e.r, size1: 260 + i * 120, color: i === 1 ? PINK : c, alpha: 0.9, shape: Shape.Ring, glow: 1.4 })
  // the plates shed shards; later, motes rush to their keeper
  if (d.phase === 2) for (const pl of d.plates) w.spawnEnemy('shardling', pl.x, pl.y)
  else for (let i = 0; i < 8; i++) w.spawnEnemy('mote', e.x + Math.cos((i * TAU) / 8) * 220, e.y + Math.sin((i * TAU) / 8) * 220)
}

function updatePlates(e: Enemy, w: World, d: Data, dt: number) {
  const p = w.p, armed = d.orb > ARMED
  for (const pl of d.plates) {
    pl.t += dt
    if (pl.mode === ORB || pl.mode === BACK) {
      const a = d.orbA + (pl.slot * TAU) / PLATES, tx = e.x + Math.cos(a) * d.orb, ty = e.y + Math.sin(a) * d.orb
      if (pl.mode === ORB) {
        pl.x = damp(pl.x, tx, 12, dt)
        pl.y = damp(pl.y, ty, 12, dt)
        pl.rot = a + Math.PI / 2
      } else {
        // boomerang home, accelerating
        const dx = tx - pl.x, dy = ty - pl.y, dl = Math.hypot(dx, dy), step = (150 + pl.t * 1100) * dt
        if (dl <= step + 2) pl.mode = ORB
        else {
          pl.x += (dx / dl) * step
          pl.y += (dy / dl) * step
        }
        pl.rot += dt * 18
      }
    } else if (pl.mode === AIM) {
      pl.x = damp(pl.x, e.x + pl.dx * (ORBIT + 24), 10, dt)
      pl.y = damp(pl.y, e.y + pl.dy * (ORBIT + 24), 10, dt)
      pl.rot += dt * 25 * (pl.t / AIM_T)
      if (pl.t >= AIM_T) {
        Object.assign(pl, { mode: OUT, t: 0, sx: pl.x, sy: pl.y })
        w.sfx('shard', { x: pl.x })
      }
    } else {
      const k = Math.min(1, pl.t / OUT_T), f = ease.outCubic(k)
      pl.x = pl.sx + pl.dx * pl.len * f
      pl.y = pl.sy + pl.dy * pl.len * f
      pl.rot += dt * 18
      if (k >= 1) {
        pl.mode = BACK
        pl.t = 0
        w.burst(pl.x, pl.y, { n: 8, color: PINK, speed: 160, life: 0.35, size: 2.5 })
        if (d.phase === 3) gapRing(w, pl.x, pl.y, 10, 120, rand(0, TAU), 2, B_APEX)
      }
    }
    const live = pl.mode >= OUT || (armed && pl.mode === ORB)
    if (pl.mode >= OUT) w.part({ x: pl.x, y: pl.y, life: 0.25, size: 7, size1: 0, color: PINK, alpha: 0.6, glow: 1 })
    if (live && !p.dead) {
      const rr = 17 + p.r * 0.6
      if (dist2(pl.x, pl.y, p.x, p.y) < rr * rr) w.hurt(16)
    }
  }
}

export default {
  id: 'warden', name: l('The Hexwarden', '六角守卫'), title: l('Keeper of the Shallows', '浅滩守护者'),
  desc: l('Six plates, one law: nothing falls past it.', '六面护盾，一条铁律：任何光都休想从它身旁坠落。'),
  shape: Shape.Hex, color: BLUE, r: 58, hp: 60000, speed: 70, dmg: 22, xp: 0, mass: 60, boss: true, music: 'boss',

  spawn(e) {
    const plates: Plate[] = []
    for (let i = 0; i < PLATES; i++) plates.push({ x: e.x, y: e.y, slot: i, mode: ORB, t: 0, dx: 1, dy: 0, len: 0, sx: 0, sy: 0, rot: 0 })
    const d: Data = {
      phase: 1, trans: 0, t: -1, i: 0, n: 0, dir: 1, atk: rest, dmg: e.dmg, rot: 0, rotV: 0, spinTo: 0.35,
      orbA: 0, orbV: 0, orbVTo: 0.6, orb: 0, orbTo: ORBIT, ring: 0, plates, glow: 0, air: 0, landed: true, gap: 0, t0: 0, sx: 0, sy: 0, tx: 0, ty: 0,
    }
    e.data = d
  },

  ai(e, w, dt) {
    const d = e.data as Data
    d.glow = Math.max(0, d.glow - dt * 2)
    if (d.trans > 0) {
      d.trans -= dt
      d.spinTo = 4
      d.glow = 1
      brake(e, dt)
      if (d.trans <= 0) {
        e.invuln = false
        begin(d, rest)
      }
    } else if (d.phase < 3 && e.hp < e.maxHp * TH[d.phase]) phaseUp(e, w, d)
    else {
      d.t += dt
      if (d.atk(e, w, d, dt)) next(d)
    }
    d.rotV = damp(d.rotV, d.spinTo, 2.5, dt)
    d.rot += d.rotV * dt
    d.orbV = damp(d.orbV, d.orbVTo, 2, dt)
    d.orbA += d.orbV * dt
    d.orb = damp(d.orb, d.orbTo, 3, dt)
    e.rot = d.rot
    updatePlates(e, w, d, dt)
  },

  draw(e, w) {
    const d = e.data as Data, t = w.time, x = e.x, y = e.y
    const rim = RIM[d.phase], eye = e.flash > 0 ? WHITE : EYE[d.phase]
    const r = e.r * (1 + d.air * 0.45) * (1 + Math.sin(t * 3) * 0.025 + d.glow * 0.05)
    const blink = 0.55 + Math.sin(t * 30) * 0.15
    // telegraphs: carousel band & plate flight paths
    if (d.ring) {
      R.draw(Shape.Ring, x, y, d.ring + 18, d.ring + 18, 0, PINK, 0.14, 0, 36)
      R.draw(Shape.Ring, x, y, d.ring + 18, d.ring + 18, 0, PINK, blink, 0.6, 2)
      R.draw(Shape.Ring, x, y, d.ring - 18, d.ring - 18, 0, PINK, blink, 0.6, 2)
    }
    for (const pl of d.plates) {
      if (pl.mode !== AIM) continue
      const k = Math.min(1, pl.t / AIM_T), hl = pl.len / 2, ang = Math.atan2(pl.dy, pl.dx)
      const cx = x + pl.dx * (ORBIT + 24 + hl), cy = y + pl.dy * (ORBIT + 24 + hl)
      R.draw(Shape.Capsule, cx, cy, hl + 16, 16, ang, PINK, 0.1, 0, 0)
      R.draw(Shape.Capsule, cx, cy, hl + 16, 16 * k, ang, PINK, 0.2, 0, 0)
      R.draw(Shape.Capsule, cx, cy, hl + 16, 16, ang, PINK, blink, 0.5, 1.5)
    }
    if (d.air > 0) R.draw(Shape.Hex, x + d.air * 26, y + d.air * 38, e.r, e.r, d.rot, BLACK, 0.2 + d.air * 0.4, 0, 0, 0)
    // halo & body
    R.draw(Shape.Glow, x, y, r * 3.2, r * 3.2, 0, rim, 0.2 + d.glow * 0.25)
    for (let i = 0; i < 12; i++) {
      const a = -d.rot * 0.5 + (i * TAU) / 12, rr = r * 1.45
      R.draw(Shape.Box, x + Math.cos(a) * rr, y + Math.sin(a) * rr, 6, 1.5, a + Math.PI / 2, rim, 0.55, 0.6)
    }
    R.draw(Shape.Ring, x, y, r * 1.38, r * 1.38, 0, rim, 0.3, 0.4, 1.2)
    R.draw(Shape.Hex, x, y, r, r, d.rot, DARK, 0.95, 0, 0, 0)
    R.draw(Shape.Hex, x, y, r, r, d.rot, rim, 1, 1.3, 4.5)
    R.draw(Shape.Hex, x, y, r * 0.8, r * 0.8, d.rot, rim, 0.35, 0, 1.2)
    R.draw(Shape.Hex, x, y, r * 0.58, r * 0.58, -d.rot * 1.6, ICE, 0.8, 0.8, 2.2)
    for (let k = 0; k < 6; k++) {
      const a = d.rot + (k * TAU) / 6, c = Math.cos(a), s = Math.sin(a)
      R.line(x + c * r * 0.66, y + s * r * 0.66, x + c * r * 0.98, y + s * r * 0.98, 1.6, rim, 0.5, 0.4)
      R.draw(Shape.Diamond, x + c * r * 1.15, y + s * r * 1.15, 6, 6, a, d.glow > 0.3 ? PINK : ICE, 0.9, 1)
    }
    // the eye tracks the player and flashes on hit
    const la = w.angleToPlayer(e), ex = x + Math.cos(la) * r * 0.08, ey = y + Math.sin(la) * r * 0.08
    R.draw(Shape.Glow, x, y, r * 1.3, r * 1.3, 0, eye, 0.5 + d.glow * 0.5)
    R.draw(Shape.Circle, x, y, r * 0.3, r * 0.3, 0, DARK, 0.9, 0, 0, 0)
    R.draw(Shape.Ring, x, y, r * 0.36, r * 0.36, 0, eye, 0.9, 1, 2.5)
    R.draw(Shape.Circle, ex, ey, r * (0.17 + d.glow * 0.05), r * (0.17 + d.glow * 0.05), 0, eye, 1, 1.5)
    R.draw(Shape.Circle, ex, ey, r * 0.07, r * 0.07, 0, WHITE, 1, 0)
    if (e.invuln) R.draw(Shape.Hex, x, y, r * 1.25, r * 1.25, -d.rot, WHITE, 0.5 + Math.sin(t * 20) * 0.3, 1.2, 2)
    // shield plates (pink rim = dangerous)
    for (const pl of d.plates) {
      const live = pl.mode >= OUT || (d.orb > ARMED && pl.mode === ORB), c = live ? PINK : rim
      R.draw(Shape.Box, pl.x, pl.y, 22, 8, pl.rot, DARK, 0.95, 0, 0, 0)
      R.draw(Shape.Box, pl.x, pl.y, 22, 8, pl.rot, c, 1, live ? 1.5 : 0.9, 2.5)
      R.draw(Shape.Box, pl.x, pl.y, 12, 2, pl.rot, WHITE, 0.8, 0.5)
    }
  },

  death(e, w) {
    const d = e.data as Data
    for (const pl of d.plates) w.burst(pl.x, pl.y, { n: 10, color: PINK, speed: 320, life: 0.9, size: 4, shape: Shape.Box, spin: 12 })
    for (let i = 0; i < 3; i++) w.part({ x: e.x, y: e.y, life: 0.8 + i * 0.25, size: e.r, size1: 300 + i * 160, color: i === 1 ? PINK : BLUE, alpha: 0.9, shape: Shape.Ring, glow: 1.5 })
    for (const b of w.bullets) b.dead = true
  },
} satisfies EnemyDef
