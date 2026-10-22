import { renderer as R, Shape } from '../../core/gl'
import { l } from '../../core/i18n'
import { clamp, dist2, hex, rand, scale, TAU, turnToward, type RGB } from '../../core/math'
import { COLOR } from '../../game/types'
import type { Enemy, EnemyDef, Hazard } from '../../game/types'
import type { World } from '../../game/world'
import { body, brake, dark, defuse, onScreen, pin } from './shallows'

// ───────────────────────────── Verdant Lattice (stage 3 — luminous green) ─────────────────────────────
const SPORE: RGB = hex('#b6ff5c')

const sporeling: EnemyDef = {
  id: 'sporeling', name: l('Sporeling', '孢子体'), desc: l('A drifting pod. Kill it and its last breath bursts into a cloud of spores.', '一颗飘荡的荚。杀死它，它最后的一口气会炸成一团孢子雾。'),
  shape: Shape.Circle, color: hex('#63dd6a'), r: 12, hp: 16, speed: 80, dmg: 8, xp: 2,
  ai(e, w, dt) {
    w.chase(e, dt)
    const wob = Math.cos(e.t * 2.4 + e.id) * 22 * dt
    e.x -= Math.sin(e.rot) * wob
    e.y += Math.cos(e.rot) * wob
  },
  death(e, w) {
    // lingering spore cloud — telegraphed, so the danger reads before it bites
    w.hazard({ kind: 'circle', x: e.x, y: e.y, r: 72, delay: 0.5, active: 2.2, dmg: e.dmg * 0.7, color: SPORE })
    w.ringFx(e.x, e.y, e.r * 2.2, SPORE)
    w.sfx('spore', { vol: 0.3, x: e.x }, 0.05)
  },
  draw(e) {
    body(e, Shape.Circle, e.r * 0.85, e.r * 0.85, e.rot)
    // spore dots packed inside the pod
    for (let i = 0; i < 4; i++) {
      const a = e.t * 1.2 + (i / 4) * TAU, o = e.r * 0.4
      R.draw(Shape.Circle, e.x + Math.cos(a) * o, e.y + Math.sin(a) * o, e.r * 0.16, e.r * 0.16, 0, SPORE, 0.85, 0.6)
    }
  },
}

const WEAVE_T = 2.6
const weaver: EnemyDef = {
  id: 'weaver', name: l('Weaver', '织网者'), desc: l('Circles you at a distance, threading the air with lattice rings.', '远距离环绕着你，用一圈圈晶格网线编织天空。'),
  shape: Shape.Hex, color: hex('#3df07a'), r: 16, hp: 30, speed: 105, dmg: 11, xp: 4,
  spawn: (e) => void (e.timer = rand(1.4, 2.4)),
  ai(e, w, dt) {
    // orbit at range, drifting the orbit direction slowly
    const dx = e.x - w.p.x, dy = e.y - w.p.y, d = Math.hypot(dx, dy) || 1, range = 220
    const k = clamp((range - d) / 90, -1, 1), dir = Math.sin(e.id) >= 0 ? 1 : -1
    e.vx = ((dx / d) * k - (dy / d) * dir * 0.9) * e.speed
    e.vy = ((dy / d) * k + (dx / d) * dir * 0.9) * e.speed
    e.rot += dt * 1.6
    if ((e.timer -= dt) <= 0 && onScreen(e.x, e.y)) {
      e.timer = WEAVE_T
      const n = 10, off = e.rot
      w.ringShot(e.x, e.y, n, 165, off, { r: 7, dmg: e.dmg * 0.8, color: e.color, shape: Shape.Diamond, life: 4 })
      w.ringFx(e.x, e.y, e.r * 2, e.color)
      w.sfx('enemyShoot', { vol: 0.24, pitch: 1.3, x: e.x }, 0.1)
    }
  },
  draw(e) {
    body(e, Shape.Hex, e.r, e.r, e.rot)
    // spokes of the weave
    for (let i = 0; i < 3; i++) {
      const a = e.rot + (i / 3) * TAU
      R.line(e.x + Math.cos(a) * e.r * 0.3, e.y + Math.sin(a) * e.r * 0.3, e.x + Math.cos(a) * e.r * 1.5, e.y + Math.sin(a) * e.r * 1.5, 1.5, e.color, 0.5, 0.8)
    }
    R.draw(Shape.Ring, e.x, e.y, e.r * 1.25, e.r * 1.25, -e.rot * 0.6, e.color, 0.5, 1, 1.5)
  },
}

const HEAL_R = 150, HEAL_CD = 2.4, HEAL_AMT = 0.12
const mender: EnemyDef = {
  id: 'mender', name: l('Mender', '愈疗者'), desc: l('A quiet bloom that pours life back into its kin. Cut it out first.', '一朵安静的花，把生命灌回同族体内。先把它摘掉。'),
  shape: Shape.Pent, color: hex('#7dffb0'), r: 14, hp: 28, speed: 72, dmg: 9, xp: 4,
  spawn: (e) => void (e.timer = HEAL_CD),
  ai(e, w, dt) {
    // hover near the player but behind its allies, seeking the thickest cluster
    const dx = e.x - w.p.x, dy = e.y - w.p.y, d = Math.hypot(dx, dy) || 1, target = 300
    const k = clamp((target - d) / 90, -0.6, 1)
    e.vx = (dx / d) * k * e.speed
    e.vy = (dy / d) * k * e.speed
    if ((e.timer -= dt) <= 0) {
      e.timer = HEAL_CD
      let healed = 0
      w.inRadius(e.x, e.y, HEAL_R, (o) => {
        if (o === e || o.hp >= o.maxHp) return
        o.hp = Math.min(o.maxHp, o.hp + o.maxHp * HEAL_AMT)
        w.part({ x: o.x, y: o.y - o.r, life: 0.5, size: 3, size1: 0, color: e.color, vy: -60, glow: 1 })
        healed++
      })
      if (healed) {
        w.ringFx(e.x, e.y, HEAL_R, e.color)
        w.sfx('heal', { vol: 0.18, pitch: 1.4, x: e.x }, 0.2)
      }
    }
  },
  draw(e) {
    R.draw(Shape.Glow, e.x, e.y, e.r * 2.4, e.r * 2.4, 0, e.color, 0.18 + Math.sin(e.t * 2.5) * 0.06)
    body(e, Shape.Pent, e.r, e.r, Math.sin(e.t) * 0.2)
    // a pulsing bloom of light at the core
    const p = 0.7 + Math.sin(e.t * 4) * 0.3
    R.draw(Shape.Cross, e.x, e.y, e.r * 0.5 * p, e.r * 0.5 * p, e.t, SPORE, 0.85, 1)
    R.draw(Shape.Circle, e.x, e.y, e.r * 0.22, e.r * 0.22, 0, COLOR.W, 0.9, 0)
  },
}

const HIVE_CD = 3.2
const hive: EnemyDef = {
  id: 'hive', name: l('Hive', '蜂巢'), desc: l('Rooted and patient. It keeps seeding motes until you tear it out.', '扎根、蛰伏，源源不断地孕育微尘，直到你将它连根拔起。'),
  shape: Shape.Box, color: hex('#4fd67a'), r: 22, hp: 60, speed: 0, dmg: 12, xp: 6, mass: 6,
  spawn(e) {
    e.timer = rand(1.5, 3)
    e.data.base = { x: e.x, y: e.y }
  },
  ai(e, w, dt) {
    pin(e, e.data.base.x, e.data.base.y) // stationary: never drifts, never gets pushed
    if ((e.timer -= dt) <= 0 && w.enemies.length < 240) {
      e.timer = HIVE_CD
      const a = rand(0, TAU), r = e.r + 8
      const s = w.spawnEnemy('mote', e.x + Math.cos(a) * r, e.y + Math.sin(a) * r)
      s.kbx = Math.cos(a) * 90
      s.kby = Math.sin(a) * 90
      w.sfx('spawn', { vol: 0.2, pitch: 1.4, x: e.x }, 0.15)
    }
  },
  draw(e) {
    body(e, Shape.Box, e.r, e.r, 0)
    // honeycomb cells and a glowing birth sac
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + e.t * 0.3, o = e.r * 0.55
      R.draw(Shape.Hex, e.x + Math.cos(a) * o, e.y + Math.sin(a) * o, e.r * 0.2, e.r * 0.2, a, SPORE, 0.4 + Math.sin(e.t * 3 + i) * 0.2, 0.5)
    }
    const p = 0.6 + Math.sin(e.t * 3.4) * 0.4
    R.draw(Shape.Circle, e.x, e.y, e.r * 0.3 * p, e.r * 0.3 * p, 0, SPORE, 0.9, 1.2)
  },
}

const HOP_AIR = 0.55, HOP_LAND = 0.45
const leaper: EnemyDef = {
  id: 'leaper', name: l('Leaper', '跃藤'), desc: l('Crouches, marks the ground, then springs. Mind the shadow.', '蓄力、标记落点，然后弹射。小心那道影子。'),
  shape: Shape.Tri, color: hex('#8bff6e'), r: 13, hp: 24, speed: 90, dmg: 12, xp: 3,
  spawn(e) { e.timer = rand(0.8, 1.6); e.data.h = undefined },
  ai(e, w, dt) {
    const d = e.data
    switch (e.state) {
      case 0: // crouch / charge: stamp a landing ring at the player's feet, then leap
        brake(e, dt, 8)
        e.rot = w.angleToPlayer(e)
        if ((e.timer -= dt) <= 0) {
          e.state = 1
          e.timer = HOP_LAND + HOP_AIR
          const tx = w.p.x + rand(-30, 30), ty = w.p.y + rand(-30, 30)
          d.h = w.hazard({ kind: 'circle', x: tx, y: ty, r: 58, delay: HOP_LAND + HOP_AIR, active: 0.16, dmg: e.dmg, color: e.color })
          const dist = Math.hypot(tx - e.x, ty - e.y) || 1
          d.vx = ((tx - e.x) / dist) * (dist / HOP_AIR) // arc home over the airtime
          d.vy = ((ty - e.y) / dist) * (dist / HOP_AIR)
          w.sfx('dash', { vol: 0.22, pitch: 1.7, x: e.x }, 0.08)
        }
        break
      case 1: // in the air, arcing toward the marked landing
        e.x += d.vx * dt
        e.y += d.vy * dt
        e.vx = e.vy = 0
        if ((e.timer -= dt) <= 0) { e.state = 2, e.timer = 0.3 }
        break
      default: // land + brief recover
        brake(e, dt, 6)
        if ((e.timer -= dt) <= 0) { e.state = 0, e.timer = rand(1.2, 2) }
    }
  },
  draw(e) {
    const hop = e.state === 1 ? Math.sin((1 - e.timer / (HOP_LAND + HOP_AIR)) * Math.PI) : 0
    const s = 1 + hop * 0.5
    if (e.state === 0) { // squat down, coiled
      R.draw(Shape.Glow, e.x, e.y, e.r * 1.8, e.r * 0.8, 0, e.color, 0.15)
    }
    body(e, Shape.Tri, e.r * s, e.r * 0.8 * s, e.rot, 1, e.x, e.y - hop * e.r)
    if (e.state === 0) R.draw(Shape.Circle, e.x + Math.cos(e.rot) * e.r * 0.4, e.y + Math.sin(e.rot) * e.r * 0.4, e.r * 0.18, e.r * 0.18, 0, COLOR.W, 0.8, 1)
  },
  death: (e) => defuse(e.data.h as Hazard | undefined),
}

export default [sporeling, weaver, mender, hive, leaper]
