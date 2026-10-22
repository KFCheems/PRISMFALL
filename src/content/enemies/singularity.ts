import { renderer as R, Shape } from '../../core/gl'
import { l } from '../../core/i18n'
import { hex, rand, TAU, turnToward, type RGB } from '../../core/math'
import type { EnemyDef, Hazard } from '../../game/types'
import { body, brake, dark, defuse, onScreen, pin } from './shallows'

// ───────────────────────────── The Singularity (stage 4 — violet / white) ─────────────────────────────
const WRITE: RGB = hex('#e8e6ff')

const FLICK_T = 0.45, BLINK_DIST = 90
const phantom: EnemyDef = {
  id: 'phantom', name: l('Phantom', '虚影'), desc: l('Flickers out of phase, then reappears at your shoulder. Watch the shimmer.', '相位闪烁后，出现在你肩侧。留意那道微光。'),
  shape: Shape.Diamond, color: hex('#a06bff'), r: 13, hp: 34, speed: 110, dmg: 13, xp: 5,
  spawn(e) { e.timer = rand(1.2, 2); e.data.vanish = false },
  ai(e, w, dt) {
    const d = e.data
    switch (e.state) {
      case 0: // drift toward the player until the cooldown pops
        w.chase(e, dt)
        if ((e.timer -= dt) <= 0 && onScreen(w.p.x, w.p.y)) { e.state = 1, e.timer = FLICK_T, d.vanish = true, w.sfx('teleport', { vol: 0.22, pitch: 1.5, x: e.x }, 0.1) }
        break
      case 1: // flickering wind-up: fade out in place
        brake(e, dt, 10)
        if ((e.timer -= dt) <= 0) {
          e.state = 2 // blink next to the player
          e.timer = 0.35
          d.vanish = false
          const a = rand(0, TAU), rr = w.p.r + e.r + BLINK_DIST * 0.3
          e.x = w.p.x + Math.cos(a) * rr
          e.y = w.p.y + Math.sin(a) * rr
          e.vx = e.vy = 0
          w.ringFx(e.x, e.y, e.r * 1.8, e.color)
          w.sfx('teleport', { vol: 0.3, pitch: 0.9, x: e.x }, 0.1)
        }
        break
      default: // strike: a quick lunge out of the blink, then reset
        brake(e, dt, 4)
        if ((e.timer -= dt) <= 0) { e.state = 0, e.timer = rand(1.6, 2.6) }
    }
  },
  draw(e) {
    const a = e.data.vanish ? 0.35 + Math.sin(e.t * 40) * 0.3 : 1
    body(e, Shape.Diamond, e.r * 0.8, e.r * 1.4, e.rot, a)
    if (e.state === 1) { // after-images left behind as it shimmers
      for (let i = 1; i <= 2; i++) body(e, Shape.Diamond, e.r * 0.8, e.r * 1.4, e.rot, 0.2 / i, e.x + i * 8, e.y - i * 6)
    }
  },
}

const SPIRAL_CD = 0.16
const sentry: EnemyDef = {
  id: 'sentry', name: l('Sentry', '哨塔'), desc: l('Anchored in the dark, painting the air with a slow spiral of light.', '钉在黑暗里，用缓慢旋转的螺旋光把空气填满。'),
  shape: Shape.Oct, color: hex('#7a5cff'), r: 20, hp: 55, speed: 0, dmg: 12, xp: 6, mass: 5,
  spawn(e) { e.timer = 0; e.data.ang = rand(0, TAU); e.data.base = { x: e.x, y: e.y } },
  ai(e, w, dt) {
    pin(e, e.data.base.x, e.data.base.y)
    if ((e.timer -= dt) <= 0 && onScreen(e.x, e.y)) {
      e.timer = SPIRAL_CD
      const arms = 3
      for (let i = 0; i < arms; i++) w.enemyShot(e.x, e.y, e.data.ang + (i / arms) * TAU, 150, { r: 6, dmg: e.dmg * 0.65, color: e.color, shape: Shape.Circle, life: 5 })
      e.data.ang += 0.42
    }
  },
  draw(e) {
    body(e, Shape.Oct, e.r, e.r, e.t * 0.6)
    R.draw(Shape.Ring, e.x, e.y, e.r * 1.35, e.r * 1.35, -e.t * 1.2, e.color, 0.5, 1, 2)
    for (let i = 0; i < 3; i++) {
      const a = e.data.ang + (i / 3) * TAU
      R.draw(Shape.Circle, e.x + Math.cos(a) * e.r * 0.85, e.y + Math.sin(a) * e.r * 0.85, e.r * 0.16, e.r * 0.16, 0, WRITE, 0.9, 1)
    }
    R.draw(Shape.Oct, e.x, e.y, e.r * 0.3, e.r * 0.3, 0, WRITE, 0.8, 1)
  },
}

const LASER_AIM = 1.0, LASER_T = 0.18
const void_eye: EnemyDef = {
  id: 'void_eye', name: l('Void Eye', '虚空之眼'), desc: l('It fixes a line on you, holds it, and then the line becomes light.', '它在你身上锁定一条线，静持片刻——然后那条线化作光。'),
  shape: Shape.Circle, color: hex('#b17cff'), r: 18, hp: 48, speed: 55, dmg: 14, xp: 6,
  spawn(e) { e.timer = rand(1.5, 2.5); e.data.h = undefined },
  ai(e, w, dt) {
    const d = e.data, h = d.h as Hazard | undefined
    if (e.state === 0) {
      w.chase(e, dt)
      if ((e.timer -= dt) <= 0 && onScreen(e.x, e.y)) {
        e.state = 1
        e.timer = LASER_AIM
        const a = (d.a = w.angleToPlayer(e)), len = 900
        d.h = w.hazard({ kind: 'line', x: e.x, y: e.y, x2: e.x + Math.cos(a) * len, y2: e.y + Math.sin(a) * len, r: 13, delay: LASER_AIM, active: LASER_T, dmg: e.dmg, color: e.color })
        w.sfx('charge', { vol: 0.28, pitch: 0.9, x: e.x }, 0.12)
      }
    } else if (e.state === 1) { // wind-up: track, then lock the beam for the final 0.25 s
      brake(e, dt, 8)
      if (!h || h.dead) { e.state = 0, e.timer = rand(2, 3), d.h = undefined; return }
      if (e.timer > 0.25) {
        d.a = turnToward(d.a, w.angleToPlayer(e), 2.4 * dt)
        h.x2 = h.x + Math.cos(d.a) * 900
        h.y2 = h.y + Math.sin(d.a) * 900
      }
      e.rot = d.a
      if ((e.timer -= dt) <= 0) { e.state = 2, e.timer = 0.6 }
    } else { // recover after the beam fires
      brake(e, dt, 6)
      if ((e.timer -= dt) <= 0) { e.state = 0, e.timer = rand(2.2, 3.2), d.h = undefined }
    }
  },
  draw(e) {
    body(e, Shape.Circle, e.r, e.r * 0.82, 0)
    const c = Math.cos(e.rot), s = Math.sin(e.rot)
    // iris + pupil biased toward its aim
    R.draw(Shape.Circle, e.x + c * e.r * 0.2, e.y + s * e.r * 0.2, e.r * 0.46, e.r * 0.46, 0, WRITE, 0.9, 1)
    R.draw(Shape.Circle, e.x + c * e.r * 0.32, e.y + s * e.r * 0.32, e.r * 0.2, e.r * 0.2, 0, dark(e.color), 1, 0, 0, 0)
    if (e.state === 1) R.draw(Shape.Glow, e.x + c * e.r * 0.32, e.y + s * e.r * 0.32, e.r * 1.2, e.r * 1.2, 0, e.color, 1 - e.timer / LASER_AIM)
  },
  death: (e) => defuse(e.data.h as Hazard | undefined),
}

const swarmer: EnemyDef = {
  id: 'swarmer', name: l('Swarmer', '群刺'), desc: l('Tiny, fast, and never alone. They arrive as a glinting pack.', '微小、迅捷，从不独行。它们成群结队、闪着寒光扑来。'),
  shape: Shape.Tri, color: hex('#8f7bff'), r: 7, hp: 10, speed: 165, dmg: 7, xp: 2,
  ai(e, w, dt) {
    w.chase(e, dt)
    // slight jitter so a pack fans out instead of overlapping in a single line
    const j = Math.sin(e.t * 11 + e.id * 2.3) * 40 * dt
    e.x -= Math.sin(e.rot) * j
    e.y += Math.cos(e.rot) * j
  },
  draw: (e) => body(e, Shape.Tri, e.r * 1.3, e.r * 0.85, e.rot),
}

const COLOSSUS_HEAL = 0.004
const colossus: EnemyDef = {
  id: 'colossus', name: l('Colossus', '虚空巨像'), desc: l('A cathedral of violet angles. Every wound it takes births another pest.', '一座紫晶棱角的巨殿。每受一次伤，便孕育出又一只害虫。'),
  shape: Shape.Oct, color: hex('#8a5cff'), r: 42, hp: 190, speed: 38, dmg: 24, xp: 20, mass: 12,
  spawn(e) { e.data.spawned = 0; e.data.lastHp = e.hp },
  ai(e, w, dt) {
    w.chase(e, dt)
    // when its health crosses a threshold, it spits out a mote and heals a sliver back
    const d = e.data
    if (e.hp < d.lastHp - e.maxHp * 0.12) {
      d.lastHp = e.hp
      e.hp = Math.min(e.maxHp, e.hp + e.maxHp * COLOSSUS_HEAL)
      d.spawned++
      const a = rand(0, TAU), r = e.r + 10
      const s = w.spawnEnemy('mote', e.x + Math.cos(a) * r, e.y + Math.sin(a) * r)
      s.kbx = Math.cos(a) * 160
      s.kby = Math.sin(a) * 160
      w.part({ x: e.x, y: e.y, life: 0.4, size: e.r, size1: e.r * 1.3, color: e.color, alpha: 0.5, shape: Shape.Glow })
      w.sfx('spawn', { vol: 0.18, pitch: 0.8, x: e.x }, 0.2)
    }
  },
  draw(e) {
    const roll = e.t * 0.3
    R.draw(Shape.Glow, e.x, e.y, e.r * 2.4, e.r * 2.4, 0, e.color, 0.22 + Math.sin(e.t * 1.7) * 0.06)
    body(e, Shape.Oct, e.r, e.r, roll)
    // inner rotating octagon + void core
    R.draw(Shape.Oct, e.x, e.y, e.r * 0.6, e.r * 0.6, -roll * 2, e.color, 0.7, 0.9, 1.8)
    R.draw(Shape.Circle, e.x, e.y, e.r * 0.26, e.r * 0.26, 0, dark(e.color), 1, 0, 0, 0)
    R.draw(Shape.Ring, e.x, e.y, e.r * 0.34, e.r * 0.34, e.t * 2, WRITE, 0.8, 1, 2)
  },
  death(e, w) {
    w.explode(e.x, e.y, e.r * 2, 26, null, e.color)
    w.ringFx(e.x, e.y, e.r * 3, e.color)
    w.shake(0.4)
  },
}

export default [phantom, sentry, void_eye, swarmer, colossus]
