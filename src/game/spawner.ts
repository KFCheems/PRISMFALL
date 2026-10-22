import { rand, TAU, lerp, pick, weighted } from '../core/math'
import { loc } from '../core/i18n'
import { audio } from '../core/audio'
import type { StageDef, StageEvent, Wave } from './types'
import { enemyById } from './registry'
import type { World } from './world'

/** Drives the stage timeline: continuous waves, timed events and the boss. */
export class Spawner {
  private acc = 0
  private ev = 0
  private events: StageEvent[]
  bossDue: number
  private warned = false

  constructor(readonly w: World, readonly stage: StageDef) {
    this.events = [...stage.events].sort((a, b) => a.at - b.at)
    this.bossDue = stage.duration
  }

  /** wave active at time t (endless mode extends the final wave forever) */
  private wave(t: number): { wave: Wave; k: number; boost: number } | null {
    const ws = this.stage.waves
    for (const wave of ws) if (t >= wave.from && t < wave.to) return { wave, k: (t - wave.from) / (wave.to - wave.from), boost: 1 }
    const last = ws[ws.length - 1]
    if (this.w.opts.endless && t >= last.to) return { wave: last, k: 1, boost: 1 + (t - last.to) / 240 }
    return null
  }

  update(dt: number) {
    const w = this.w, t = w.time
    while (this.ev < this.events.length && this.events[this.ev].at <= t) this.run(this.events[this.ev++])

    const fighting = !!w.boss
    const cur = this.wave(t)
    if (cur && (!fighting || w.opts.endless)) {
      const { wave, k, boost } = cur
      const rate = lerp(wave.rate[0], wave.rate[1], k) * w.mods.rate * boost * (fighting ? 0.4 : 1)
      const cap = (wave.cap ?? 380) * (fighting ? 0.5 : 1)
      this.acc += rate * dt
      while (this.acc >= 1) {
        this.acc--
        if (w.enemies.length >= cap) continue
        const id = weighted(wave.pool, ([, wt]) => wt)![0]
        const [x, y] = w.spawnPoint()
        w.spawnEnemy(id, x, y)
      }
    }

    if (!fighting && !this.warned && t >= this.bossDue - 4) {
      this.warned = true
      const b = enemyById.get(this.stage.boss)!
      w.hooks.banner(loc({ en: 'WARNING', zh: '警告' }), loc(b.title ?? b.name), b.color)
      w.sfx('bossWarn')
      audio.music(null)
    }
    if (!fighting && t >= this.bossDue) {
      this.bossDue = w.opts.endless ? t + 300 : Infinity
      this.warned = false
      const p = w.p
      // sweep the field so the duel reads clearly
      for (const e of w.enemies) {
        if (e.elite) continue
        e.dead = true
        w.part({ x: e.x, y: e.y, life: 0.4, size: e.r * 1.5, size1: 0, color: e.color, alpha: 0.6, shape: e.def.shape, glow: 1 })
      }
      w.bullets.forEach((b) => (b.dead = true))
      const a = rand(0, TAU)
      w.spawnEnemy(this.stage.boss, p.x + Math.cos(a) * 320, p.y + Math.sin(a) * 320, { hpMul: 1 + w.bossKills * 0.8 })
    }
  }

  private run(ev: StageEvent) {
    const w = this.w, p = w.p
    const id = ev.enemy ?? pick(this.stage.waves[0].pool)[0]
    const n = ev.n ?? 12
    switch (ev.kind) {
      case 'ring': {
        const r = w.viewR * 0.85
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU
          w.spawnEnemy(id, p.x + Math.cos(a) * r, p.y + Math.sin(a) * r)
        }
        break
      }
      case 'swarm': {
        const [x, y] = w.spawnPoint()
        for (let i = 0; i < n; i++) w.spawnEnemy(id, x + rand(-60, 60), y + rand(-60, 60))
        break
      }
      case 'wall': {
        const a = rand(0, TAU), r = w.viewR
        const cx = p.x + Math.cos(a) * r, cy = p.y + Math.sin(a) * r
        const tx = -Math.sin(a), ty = Math.cos(a)
        for (let i = 0; i < n; i++) {
          const o = (i / (n - 1) - 0.5) * r * 1.8
          w.spawnEnemy(id, cx + tx * o, cy + ty * o)
        }
        break
      }
      case 'burst':
        for (let i = 0; i < n; i++) {
          const [x, y] = w.spawnPoint()
          w.spawnEnemy(id, x, y)
        }
        break
      case 'elite': {
        const [x, y] = w.spawnPoint()
        w.spawnEnemy(id, x, y, { elite: true })
        break
      }
      case 'custom':
        ev.run?.(w)
        break
    }
  }
}
