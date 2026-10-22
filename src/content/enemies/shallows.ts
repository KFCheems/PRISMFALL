import { renderer as R, Shape } from '../../core/gl'
import { l } from '../../core/i18n'
import { clamp, damp, dist2, hex, rand, scale, TAU, turnToward, type RGB } from '../../core/math'
import { COLOR } from '../../game/types'
import type { Enemy, EnemyDef, Hazard } from '../../game/types'
import type { World } from '../../game/world'

// ───────────────────────────── shared enemy kit (imported by every stage roster) ─────────────────────────────
// Attacks are hazard-driven: the telegraph's own clock (h.t) drives wind-up, dash and landing, so slow/freeze/knockback
// can never desync what the player sees from what hits them. Every attacker defuses its pending hazard when it dies.

const DARK = new Map<RGB, RGB>()
/** cached dark fill for a (stable) neon color */
export function dark(c: RGB) {
  let d = DARK.get(c)
  if (!d) DARK.set(c, (d = scale(c, 0.16)))
  return d
}

/** Neon body like World.drawEnemy (dark fill, glowing outline, hit flash, elite ring) with free size, rotation, alpha and position. */
export function body(e: Enemy, shape: number, w: number, h: number, rot: number, a = 1, x = e.x, y = e.y) {
  const sc = 1 + Math.max(0, e.flash) * 2.5
  R.draw(shape, x, y, w * sc, h * sc, rot, dark(e.color), 0.92 * a, 0, 0, 0)
  R.draw(shape, x, y, w * sc, h * sc, rot, e.flash > 0 ? COLOR.W : e.color, a, e.elite ? 1.4 : 0.8, Math.max(1.8, e.r * 0.14))
  if (e.elite) {
    const pr = Math.max(w, h) * sc + 7 + Math.sin(e.t * 5) * 2
    R.draw(Shape.Ring, x, y, pr, pr, 0, COLOR.Y, 0.8 * a, 1, 1.5)
  }
}

/** true when a point is comfortably inside the view — attackers only open fire from on-screen */
export function onScreen(x: number, y: number, m = 24) {
  const B = R.bounds
  return x > B.l + m && x < B.r - m && y > B.t + m && y < B.b - m
}

/** bleed off velocity (wind-ups, recoveries) */
export function brake(e: Enemy, dt: number, rate = 8) {
  e.vx = damp(e.vx, 0, rate, dt)
  e.vy = damp(e.vy, 0, rate, dt)
}

/** root an enemy at a point: no velocity, no knockback */
export function pin(e: Enemy, x: number, y: number) {
  e.x = x
  e.y = y
  e.vx = e.vy = e.kbx = e.kby = 0
}

/** hold `range` from the player while circling; strafe −1..1 (sign = direction) */
export function hover(e: Enemy, w: World, dt: number, range: number, strafe: number) {
  const dx = e.x - w.p.x, dy = e.y - w.p.y, d = Math.hypot(dx, dy) || 1
  const k = clamp((range - d) / 80, -1, 1)
  e.vx = damp(e.vx, ((dx * k - dy * strafe) / d) * e.speed, 4, dt)
  e.vy = damp(e.vy, ((dy * k + dx * strafe) / d) * e.speed, 4, dt)
}

/** cancel a telegraph (pending or live) — safe to call from its own onBoom and on already-expired hazards */
export function defuse(h: Hazard | undefined) {
  if (!h) return
  h.dead = true
  h.delay = Infinity
}

// ───────────────────────────── Nebula Shallows ─────────────────────────────
const mote: EnemyDef = {
  id: 'mote', name: l('Mote', '微尘'), desc: l('A speck of stray light. Harmless alone — never alone.', '一粒迷途的光尘。单个无害，可它们从不落单。'),
  shape: Shape.Circle, color: hex('#5ab8ff'), r: 9, hp: 8, speed: 70, dmg: 6, xp: 1,
  ai(e, w, dt) {
    w.chase(e, dt)
    // lazy sideways wobble so swarms shimmer instead of marching in lockstep
    const wob = Math.cos(e.t * 3 + e.id) * 26 * dt
    e.x -= Math.sin(e.rot) * wob
    e.y += Math.cos(e.rot) * wob
  },
  draw(e, w) {
    w.drawEnemy(e)
    R.draw(Shape.Circle, e.x, e.y, e.r * 0.32, e.r * 0.32, 0, e.color, 0.6 + Math.sin(e.t * 6 + e.id) * 0.3, 0.6)
  },
}

const drifter: EnemyDef = {
  id: 'drifter', name: l('Drifter', '漂流体'), desc: l('A hollow shape tumbling toward the warmth of your light.', '一具空壳，翻滚着扑向你的光与热。'),
  shape: Shape.Pent, color: hex('#7a8cff'), r: 12, hp: 18, speed: 85, dmg: 10, xp: 2,
  draw(e) {
    body(e, Shape.Pent, e.r, e.r, e.t * 0.9 + e.id)
    // a single cold eye, always on you
    const o = e.r * 0.35
    R.draw(Shape.Circle, e.x + Math.cos(e.rot) * o, e.y + Math.sin(e.rot) * o, e.r * 0.2, e.r * 0.2, 0, COLOR.W, 0.9, 1)
  },
}

const LUNGE = 5.5 // × speed
const LUNGE_T = 0.3
const DART_AIM = 0.6
const dart: EnemyDef = {
  id: 'dart', name: l('Dart', '飞矢'), desc: l('Stops. Aims. Strikes. Sidestep the line.', '急停、瞄准、突刺——看准轨迹，侧身闪开。'),
  shape: Shape.Tri, color: hex('#3de4ff'), r: 11, hp: 14, speed: 90, dmg: 10, xp: 2,
  spawn: (e) => void (e.timer = rand(0.8, 1.6)),
  ai(e, w, dt) {
    const d = e.data
    switch (e.state) {
      case 0: // approach
        w.chase(e, dt)
        if ((e.timer -= dt) <= 0 && dist2(e.x, e.y, w.p.x, w.p.y) < 250 * 250 && onScreen(e.x, e.y)) {
          e.state = 1
          e.timer = DART_AIM
          d.a = w.angleToPlayer(e)
        }
        break
      case 1: // aim: track the player, then lock for the last 0.2 s
        brake(e, dt, 10)
        if (e.timer > 0.2) d.a = turnToward(d.a, w.angleToPlayer(e), 7 * dt)
        e.rot = d.a
        if ((e.timer -= dt) <= 0) {
          e.state = 2
          e.timer = LUNGE_T
          e.vx = Math.cos(d.a) * e.speed * LUNGE
          e.vy = Math.sin(d.a) * e.speed * LUNGE
          w.sfx('dash', { vol: 0.25, pitch: 1.6, x: e.x }, 0.06)
        }
        break
      case 2: // lunge
        if ((e.timer -= dt) <= 0) {
          e.state = 3
          e.timer = 0.45
          e.vx *= 0.2
          e.vy *= 0.2
        }
        break
      default: // recover
        brake(e, dt, 5)
        if ((e.timer -= dt) <= 0) {
          e.state = 0
          e.timer = rand(1.4, 2.2)
        }
    }
  },
  draw(e, w) {
    const c = Math.cos(e.rot), s = Math.sin(e.rot)
    if (e.state === 1) {
      // aim glow: a sight line that stretches out to the full lunge length
      const k = 1 - e.timer / DART_AIM, len = e.r + e.speed * LUNGE * LUNGE_T * k
      R.line(e.x + c * e.r, e.y + s * e.r, e.x + c * len, e.y + s * len, 1.5, e.color, 0.15 + 0.45 * k, 0.6)
      R.draw(Shape.Glow, e.x + c * e.r, e.y + s * e.r, 8 + 18 * k, 8 + 18 * k, 0, e.color, k)
    } else if (e.state === 2) R.line(e.x, e.y, e.x - c * e.r * 3.5, e.y - s * e.r * 3.5, e.r * 0.7, e.color, 0.35, 0.8)
    w.drawEnemy(e)
  },
}

const block: EnemyDef = {
  id: 'block', name: l('Bulwark', '方垒'), desc: l('A slab of solid light. Slow, stubborn, nearly immovable.', '一块凝固的光。缓慢、顽固，几乎推不动。'),
  shape: Shape.Box, color: hex('#3f52ff'), r: 20, hp: 80, speed: 40, dmg: 18, xp: 6, mass: 8,
  draw(e) {
    const roll = e.t * 0.6 + e.id
    R.draw(Shape.Glow, e.x, e.y, e.r * 2, e.r * 2, 0, e.color, 0.25 + Math.sin(e.t * 2) * 0.08)
    body(e, Shape.Box, e.r, e.r, roll)
    R.draw(Shape.Box, e.x, e.y, e.r * 0.45, e.r * 0.45, -roll * 2, e.color, 0.75, 0.6, 1.6)
  },
  death(e, w) {
    w.ringFx(e.x, e.y, e.r * 2.5, e.color)
    w.shake(0.08)
  },
}

const SHARD = hex('#b5f0ff')
const shardling: EnemyDef = {
  id: 'shardling', name: l('Shardling', '碎晶'), desc: l('A splinter of a broken Splitter — still sharp, still angry.', '裂变体崩落的碎片，依旧锋利，依旧暴躁。'),
  shape: Shape.Diamond, color: SHARD, r: 8, hp: 7, speed: 125, dmg: 5, xp: 1,
  draw: (e) => body(e, Shape.Diamond, e.r * 1.35, e.r * 0.7, e.rot),
}

const splitter: EnemyDef = {
  id: 'splitter', name: l('Splitter', '裂变体'), desc: l('Crack the shell and its shards keep coming.', '击碎外壳，碎片仍会扑来。'),
  shape: Shape.Hex, color: hex('#8c7aff'), r: 16, hp: 30, speed: 62, dmg: 11, xp: 3,
  draw(e) {
    body(e, Shape.Hex, e.r, e.r, e.t * 1.4)
    // the shards it carries, orbiting inside
    for (let i = 0; i < 2; i++) {
      const a = -e.t * 2.5 + i * Math.PI, o = e.r * 0.4
      R.draw(Shape.Diamond, e.x + Math.cos(a) * o, e.y + Math.sin(a) * o, e.r * 0.3, e.r * 0.16, a, SHARD, 0.9, 0.8)
    }
  },
  death(e, w) {
    const n = e.elite ? 4 : 2
    for (let i = 0; i < n; i++) {
      const a = e.rot + Math.PI / 2 + (i / n) * TAU
      const s = w.spawnEnemy(shardling, e.x + Math.cos(a) * e.r * 0.5, e.y + Math.sin(a) * e.r * 0.5)
      s.kbx = Math.cos(a) * 260
      s.kby = Math.sin(a) * 260
    }
    w.ringFx(e.x, e.y, e.r * 2.2, e.color)
    w.sfx('shatter', { vol: 0.4, x: e.x }, 0.06)
  },
}

export default [mote, drifter, dart, block, splitter, shardling]
