import { renderer as R, Shape } from '../../core/gl'
import { l } from '../../core/i18n'
import { clamp, damp, dist2, hex, rand, scale, TAU, turnToward, type RGB } from '../../core/math'
import { COLOR } from '../../game/types'
import type { EnemyDef, Hazard } from '../../game/types'
import { body, brake, defuse, hover, onScreen, pin } from './shallows'

// ───────────────────────────── Crimson Expanse (stage 2 — red / orange heat) ─────────────────────────────
const EMBER: RGB = hex('#ffb347')

const cinder: EnemyDef = {
  id: 'cinder', name: l('Cinder', '余烬'), desc: l('A flake of live coal that will not hold a line — it jitters, feints, then closes.', '一片未熄的炭屑，从不走直线——忽左忽右、假动作，然后逼近。'),
  shape: Shape.Tri, color: hex('#ff5a3c'), r: 12, hp: 20, speed: 118, dmg: 9, xp: 3,
  ai(e, w, dt) {
    w.chase(e, dt)
    // erratic weave perpendicular to the chase so it dodges shots and reads as skittering flame
    const sway = Math.sin(e.t * 7 + e.id * 1.7) * e.speed * 0.85
    e.vx += Math.cos(e.rot) * sway * dt
    e.vy += Math.sin(e.rot) * sway * dt
  },
  draw(e) {
    body(e, Shape.Tri, e.r * 1.15, e.r * 0.9, e.rot)
    // licking embers trailing off the tip
    for (let i = 0; i < 3; i++) {
      const k = ((e.t * 2 + i * 0.33) % 1), a = e.rot + Math.PI + Math.sin(e.t * 9 + i) * 0.5
      R.draw(Shape.Circle, e.x + Math.cos(a) * e.r * (0.4 + k), e.y + Math.sin(a) * e.r * (0.4 + k), e.r * 0.22 * (1 - k), e.r * 0.22 * (1 - k), 0, EMBER, 0.7 * (1 - k))
    }
  },
}

// ───────────────────────────── telegraphed dash: the hazard IS the wind-up clock ─────────────────────────────
const DASH_LEN = 300, DASH_T = 0.22, LANCE_AIM = 0.65
const lancer: EnemyDef = {
  id: 'lancer', name: l('Lancer', '赤枪'), desc: l('It marks a lane with fire, then rides it down. Step out of the line.', '它先在道上烙下一道火痕，然后沿之杀来。踏出那条线。'),
  shape: Shape.Star, color: hex('#ff7a2d'), r: 13, hp: 26, speed: 95, dmg: 12, xp: 3,
  spawn: (e) => void (e.timer = rand(1.2, 2)),
  ai(e, w, dt) {
    const d = e.data, h = d.h as Hazard | undefined
    switch (e.state) {
      case 0: // approach until a clean shot opens
        w.chase(e, dt)
        if ((e.timer -= dt) <= 0 && dist2(e.x, e.y, w.p.x, w.p.y) < 340 * 340 && onScreen(e.x, e.y)) {
          e.state = 1
          e.timer = LANCE_AIM
          const a = (d.a = w.angleToPlayer(e)), r = e.r * 1.4
          // the telegraph defines the lane; onBoom rides it forward regardless of slow/freeze
          d.h = w.hazard({ kind: 'line', x: e.x, y: e.y, x2: e.x + Math.cos(a) * (r + DASH_LEN), y2: e.y + Math.sin(a) * (r + DASH_LEN), r: e.r * 0.8, delay: LANCE_AIM, active: DASH_T, dmg: e.dmg, color: e.color })
          w.sfx('charge', { vol: 0.3, pitch: 1.3, x: e.x }, 0.1)
        }
        break
      case 1: { // aim: creep toward the target line, lock aim near the end
        brake(e, dt, 9)
        if (!h || h.dead) { e.state = 0, e.timer = rand(1.4, 2.2); break }
        if (e.timer > 0.18) {
          d.a = turnToward(d.a, w.angleToPlayer(e), 6 * dt)
          const r = e.r * 1.4
          h.x2 = h.x + Math.cos(d.a) * (r + DASH_LEN)
          h.y2 = h.y + Math.sin(d.a) * (r + DASH_LEN)
        }
        e.rot = d.a
        if ((e.timer -= dt) <= 0) { // hand off to the hazard: it now owns the lunge
          e.state = 2
          e.timer = DASH_T
          w.sfx('dash', { vol: 0.28, pitch: 1.5, x: e.x }, 0.06)
        }
        break
      }
      case 2: // ride the lane — the lunge speed matches the hazard's own clock
        e.vx = Math.cos(d.a) * DASH_LEN * 3.1
        e.vy = Math.sin(d.a) * DASH_LEN * 3.1
        R.ripple(e.x, e.y, 0.15)
        if ((e.timer -= dt) <= 0) { e.state = 3, e.timer = 0.5 }
        break
      default: // recover
        brake(e, dt, 5)
        if ((e.timer -= dt) <= 0) {
          e.state = 0
          e.timer = rand(1.4, 2.4)
          d.h = undefined
        }
    }
  },
  draw(e) {
    const c = Math.cos(e.rot), s = Math.sin(e.rot)
    if (e.state === 1) {
      const k = 1 - e.timer / LANCE_AIM
      R.line(e.x + c * e.r, e.y + s * e.r, e.x + c * e.r * (1 + 6 * k), e.y + s * e.r * (1 + 6 * k), 2, e.color, 0.2 + 0.5 * k, 0.7)
    } else if (e.state === 2) R.line(e.x, e.y, e.x - c * e.r * 5, e.y - s * e.r * 5, e.r * 0.6, EMBER, 0.5, 0.9)
    body(e, Shape.Star, e.r, e.r, e.rot)
    R.draw(Shape.Tri, e.x + c * e.r * 0.5, e.y + s * e.r * 0.5, e.r * 0.4, e.r * 0.3, e.rot, COLOR.W, 0.9, 1)
  },
  death: (e) => defuse(e.data.h as Hazard | undefined),
}

const spitter: EnemyDef = {
  id: 'spitter', name: l('Spitter', '喷吐者'), desc: l('Keeps its distance and spits globs of magma. Close the gap.', '与我保持距离，啐出一口口熔岩。冲上去。'),
  shape: Shape.Circle, color: hex('#ff9a3d'), r: 14, hp: 24, speed: 85, dmg: 10, xp: 3,
  spawn: (e) => void (e.timer = rand(1, 2)),
  ai(e, w, dt) {
    hover(e, w, dt, 260, Math.sin(e.t * 0.7 + e.id) * 0.6)
    if ((e.timer -= dt) <= 0 && onScreen(e.x, e.y) && dist2(e.x, e.y, w.p.x, w.p.y) < 480 * 480) {
      e.timer = rand(1.6, 2.4)
      const a = w.angleToPlayer(e)
      for (let i = -1; i <= 1; i++) w.enemyShot(e.x + Math.cos(a) * e.r, e.y + Math.sin(a) * e.r, a + i * 0.16, 240, { r: 9, dmg: 9, color: e.color, shape: Shape.Circle, life: 4 })
      w.sfx('enemyShoot', { vol: 0.25, pitch: 1.1, x: e.x }, 0.08)
    }
  },
  draw(e) {
    const pulse = 1 + Math.sin(e.t * 5) * 0.08
    R.draw(Shape.Glow, e.x, e.y, e.r * 1.8, e.r * 1.8, 0, e.color, 0.22)
    body(e, Shape.Circle, e.r * pulse, e.r * pulse, e.rot)
    // glowing maw
    const a = e.rot, m = e.r * 0.45
    R.draw(Shape.Circle, e.x + Math.cos(a) * m, e.y + Math.sin(a) * m, e.r * 0.34, e.r * 0.34, 0, EMBER, 0.9, 1.2)
    R.draw(Shape.Circle, e.x + Math.cos(a) * m, e.y + Math.sin(a) * m, e.r * 0.16, e.r * 0.16, 0, COLOR.W, 1, 0)
  },
}

const BLAST_DELAY = 0.75
const bomber: EnemyDef = {
  id: 'bomber', name: l('Bomber', '自爆虫'), desc: l('Runs at you swollen with heat, then bursts. Its own red halo is the countdown.', '鼓胀着高热朝你奔来，然后炸开。那圈红光就是倒计时。'),
  shape: Shape.Diamond, color: hex('#ff4d2e'), r: 15, hp: 22, speed: 135, dmg: 10, xp: 3,
  spawn: (e) => void (e.data.h = undefined as Hazard | undefined),
  ai(e, w, dt) {
    const d = e.data
    if (e.state === 0) {
      w.chase(e, dt)
      const near = dist2(e.x, e.y, w.p.x, w.p.y) < 95 * 95
      if (near || e.t > 9) { // arm: plant a blast telegraph and root
        e.state = 1
        e.timer = BLAST_DELAY
        const h = (d.h = w.hazard({ kind: 'circle', x: e.x, y: e.y, r: 95, delay: BLAST_DELAY, active: 0.16, dmg: e.dmg, color: e.color }))
        h.onBoom = (z, ww) => {
          ww.explode(z.x, z.y, z.r * 1.1, z.dmg * 0.4, null, e.color)
          ww.shake(0.25)
          e.hp = 0 // the blast consumes it; world.kill fires the normal death handling
        }
      }
    } else {
      pin(e, e.x, e.y) // rooted while fused — knockback cannot drag the countdown off-target
      if (!d.h || d.h.dead) e.hp = 0
    }
  },
  draw(e) {
    const arming = e.state === 1, k = arming ? 1 - e.timer / BLAST_DELAY : 0
    if (arming) R.draw(Shape.Glow, e.x, e.y, e.r * (2 + 2 * k), e.r * (2 + 2 * k), 0, e.color, 0.35 + 0.4 * k)
    body(e, Shape.Diamond, e.r * (1 + k * 0.25), e.r * (1 + k * 0.25), e.t * 2)
    if (arming) {
      const blink = 0.4 + Math.abs(Math.sin(e.t * 30)) * 0.6
      R.draw(Shape.Ring, e.x, e.y, e.r * 1.6, e.r * 1.6, 0, COLOR.W, blink, 1, 2)
    } else R.draw(Shape.Circle, e.x, e.y, e.r * 0.3, e.r * 0.3, 0, EMBER, 0.8 + Math.sin(e.t * 8) * 0.2)
  },
  death(e, w) {
    const h = e.data.h as Hazard | undefined
    if (h && !h.dead) { // died before arming completed → its own blast still lands cleanly
      defuse(h)
      w.explode(h.x, h.y, h.r, h.dmg * 0.5, null, e.color)
    }
    w.ringFx(e.x, e.y, e.r * 2.4, e.color)
    w.sfx('explode', { vol: 0.35, x: e.x }, 0.05)
  },
}

const brute: EnemyDef = {
  id: 'brute', name: l('Brute', '熔岩巨像'), desc: l('A walking furnace. Immovable, unhurried, and utterly unimpressed by your knockback.', '一座行走的熔炉。纹丝不动、不急不缓，对你的击退毫无兴趣。'),
  shape: Shape.Oct, color: hex('#e0381f'), r: 30, hp: 150, speed: 42, dmg: 22, xp: 14, mass: 9,
  ai(e, w, dt) {
    w.chase(e, dt)
    // heavy footfalls: shake a little on each step cadence
    if (Math.floor(e.t * 1.6) !== Math.floor((e.t - dt) * 1.6)) { w.shake(0.05); w.sfx('hit', { vol: 0.1, pitch: 0.6, x: e.x }, 0.2) }
  },
  draw(e) {
    const roll = e.t * 0.35
    R.draw(Shape.Glow, e.x, e.y, e.r * 2.2, e.r * 2.2, 0, e.color, 0.2 + Math.sin(e.t * 2) * 0.06)
    body(e, Shape.Oct, e.r, e.r, roll)
    // crusted cracks glowing with inner heat
    for (let i = 0; i < 4; i++) {
      const a = roll + (i / 4) * TAU, o = e.r * 0.55
      R.line(e.x + Math.cos(a) * e.r * 0.2, e.y + Math.sin(a) * e.r * 0.2, e.x + Math.cos(a) * o, e.y + Math.sin(a) * o, 2, EMBER, 0.5 + Math.sin(e.t * 3 + i) * 0.25, 1)
    }
    R.draw(Shape.Oct, e.x, e.y, e.r * 0.3, e.r * 0.3, -roll, EMBER, 0.7, 1.1)
  },
  death(e, w) {
    w.ringFx(e.x, e.y, e.r * 2.6, e.color)
    w.explode(e.x, e.y, e.r * 1.6, 20, null, e.color)
    w.shake(0.3)
  },
}

export default [cinder, lancer, spitter, bomber, brute]
