import { renderer as R, Shape } from '../core/gl'
import { audio, type Sfx, type SfxOpts } from '../core/audio'
import { input } from '../core/input'
import { save } from '../core/save'
import { chance, clamp, damp, dist2, mix, rand, randi, scale, segDist2, TAU, type RGB, css } from '../core/math'
import { loc } from '../core/i18n'
import { COLOR, fuseParts } from './types'
import type { Bullet, CharacterDef, Enemy, EnemyDef, FloatText, Fuse, Hazard, Particle, Pickup, PickupKind, RunResult, Shot, StageDef, WeaponInst, WeaponLevel } from './types'
import { enemyById, ASCENSIONS } from './registry'
import { Player, xpForLevel } from './player'
import { SpatialHash } from './spatial'
import { Spawner } from './spawner'
import { makeWeapon, rollChest } from './upgrades'

export interface RunOpts {
  char: CharacterDef
  stage: StageDef
  asc: number
  endless: boolean
}

export interface ChestReward {
  kind: 'level' | 'fusion' | 'lumens' | 'heal'
  label: string
  color: RGB
}

/** Callbacks into the game shell / UI. */
export interface WorldHooks {
  levelUp(): void
  chest(rewards: ChestReward[]): void
  end(result: RunResult): void
  banner(title: string, sub?: string, color?: RGB): void
  boss(e: Enemy | null): void
}

interface Zap {
  pts: number[]
  life: number
  max: number
  color: RGB
  w: number
}

const WHITE: RGB = [1, 1, 1]
const XP_COLORS: [number, RGB][] = [
  [100, COLOR.M],
  [25, COLOR.Y],
  [8, COLOR.G],
  [0, COLOR.B],
]

let nextId = 1

export class World {
  p: Player
  time = 0
  real = 0
  enemies: Enemy[] = []
  shots: Shot[] = []
  bullets: Bullet[] = []
  hazards: Hazard[] = []
  pickups: Pickup[] = []
  parts: Particle[] = []
  texts: FloatText[] = []
  zaps: Zap[] = []
  grid = new SpatialHash(64)
  spawner: Spawner
  arena: { x: number; y: number; r: number; color: RGB } | null = null
  boss: Enemy | null = null
  modal = false
  ending = 0 // >0 while the end-of-run sequence plays
  hitStop = 0
  timeScale = 1
  trauma = 0
  flashA = 0
  flashC: RGB = WHITE
  hurtT = 0
  /** enemy-side modifiers from stage × ascension × curse */
  mods = { hp: 1, dmg: 1, speed: 1, rate: 1, lumens: 1, bulletSpeed: 1, heal: 1 }
  // run statistics
  kills = 0
  lumens = 0
  elites = 0
  bossKills = 0
  fusions = 0
  overdrives = 0
  chests = 0
  dmgTaken = 0
  lastHit = 0
  noHitBest = 0
  private xpCombo = 0
  private xpComboT = 0
  private sfxGate: Record<string, number> = {}
  private achT = 0
  onAchCheck?: (w: World) => void

  constructor(readonly opts: RunOpts, readonly hooks: WorldHooks) {
    const { stage, asc, char } = opts
    this.mods.hp = stage.hp
    this.mods.dmg = stage.dmg
    for (const a of ASCENSIONS) if (a.level <= asc) a.apply(this.mods)
    this.p = new Player(char)
    this.p.recalc()
    this.p.hp = this.p.stats.maxHp
    this.p.rerolls = this.p.stats.reroll
    this.p.banishes = this.p.stats.banish
    this.p.skips = this.p.stats.skip
    this.p.revivals = this.p.stats.revival
    this.mods.hp *= this.p.stats.curse
    this.mods.rate *= this.p.stats.curse
    this.spawner = new Spawner(this, stage)
    this.p.weapons.push(makeWeapon(char.weapon))
    save.see(char.weapon)
    R.bg.c0 = stage.palette.c0
    R.bg.c1 = stage.palette.c1
    R.bg.c2 = stage.palette.c2
    R.bg.grid = stage.palette.grid
    R.bg.style = stage.bgStyle
    R.bg.gridA = stage.gridA
    R.cam.x = R.cam.y = 0
  }

  get settings() {
    return save.data.settings
  }

  /** radius of a circle just enclosing the screen, in world units */
  get viewR() {
    return Math.hypot(R.W, R.H) / R.scale / 2 + 40
  }

  // ───────────────────────────── main update ─────────────────────────────
  update(rawDt: number) {
    this.real += rawDt
    let dt = rawDt * this.timeScale
    if (this.hitStop > 0) {
      this.hitStop -= rawDt
      dt *= 0.08
    }
    if (this.ending > 0) this.updateEnding(rawDt)
    this.time += dt
    const p = this.p
    if (!p.dead) p.update(this, dt)
    p.char.tick?.(this, dt)
    if (!this.ending) this.spawner.update(dt)
    if (!p.dead) this.updateWeapons(dt)
    this.grid.clear()
    for (const e of this.enemies) if (!e.dead) this.grid.insert(e)
    this.updateShots(dt)
    this.updateEnemies(dt)
    this.updateBullets(dt)
    this.updateHazards(dt)
    this.updatePickups(dt)
    this.updateFx(dt)
    this.cleanup()
    this.updateCamera(rawDt)
    this.noHitBest = Math.max(this.noHitBest, this.time - this.lastHit)
    audio.intensity(clamp(this.enemies.length / 260 + (this.boss ? 0.5 : 0), 0, 1))
    this.achT += rawDt
    if (this.achT > 2) {
      this.achT = 0
      this.onAchCheck?.(this)
    }
    if (p.pending > 0 && !this.modal && !this.ending && !p.dead) {
      this.modal = true
      this.hooks.levelUp()
    }
  }

  private updateWeapons(dt: number) {
    for (const wi of this.p.weapons) {
      wi.t += dt
      const s = this.weaponStats(wi)
      wi.def.tick?.(wi, this, dt, s)
      if (wi.def.fire) {
        wi.cd -= dt
        if (wi.cd <= 0) {
          wi.def.fire(wi, this, s)
          wi.cd += Math.max(0.05, s.cd)
          if (wi.cd < 0) wi.cd = 0
        }
      }
    }
  }

  /** Final stat block of a weapon after player modifiers & fusion bonus. */
  weaponStats(wi: WeaponInst): WeaponLevel {
    const st = this.p.stats
    const b = wi.def.stats(wi.level)
    const f = wi.fuse ? 1 : 0
    return {
      ...b,
      dmg: b.dmg * st.might * (1 + 0.4 * f),
      cd: b.cd * st.cooldown * (1 - 0.1 * f),
      area: b.area * st.area * (1 + 0.15 * f),
      speed: b.speed * st.projSpeed,
      amount: b.amount + st.amount + f,
      duration: b.duration * st.duration,
      pierce: b.pierce + st.pierce,
    }
  }

  /** Display color of a weapon (hue or fused hue). */
  color(wi: WeaponInst | null): RGB {
    return wi ? COLOR[wi.fuse ?? wi.def.hue] : WHITE
  }

  // ───────────────────────────── shots ─────────────────────────────
  /** Spawn a player projectile. Unspecified fields get sensible defaults. */
  shot(o: Partial<Shot>, src: WeaponInst | null): Shot {
    const s: Shot = {
      x: this.p.x, y: this.p.y, vx: 0, vy: 0, r: 6, dmg: 10, pierce: 1, life: 2, maxLife: 0, hitCd: Infinity, hits: new Map(), kb: 60,
      color: this.color(src), shape: Shape.Circle, w: 0, h: 0, rot: 0, spin: 0, glow: 1, alpha: 1, src, fuse: src?.fuse ?? null,
      homing: 0, noCollide: false, dead: false, trail: 0, data: null,
      ...o,
    }
    if (!s.w) s.w = s.r
    if (!s.h) s.h = s.w
    if (!s.maxLife) s.maxLife = s.life
    if (s.fuse === 'M' && !s.homing && (s.vx || s.vy)) s.homing = 4
    this.shots.push(s)
    return s
  }

  private updateShots(dt: number) {
    for (const s of this.shots) {
      if (s.dead) continue
      s.life -= dt
      if (s.homing) {
        const t = this.nearest(s.x, s.y, 400)
        if (t) {
          const sp = Math.hypot(s.vx, s.vy), a = Math.atan2(s.vy, s.vx)
          const want = Math.atan2(t.y - s.y, t.x - s.x)
          let d = want - a
          d = Math.atan2(Math.sin(d), Math.cos(d))
          const na = a + clamp(d, -s.homing * dt, s.homing * dt)
          s.vx = Math.cos(na) * sp
          s.vy = Math.sin(na) * sp
        }
      }
      if (s.update) s.update(s, this, dt)
      else {
        s.x += s.vx * dt
        s.y += s.vy * dt
        if (s.vx || s.vy) s.rot = Math.atan2(s.vy, s.vx)
      }
      s.rot += s.spin * dt
      if (s.trail > 0 && Math.random() < s.trail * dt) this.part({ x: s.x, y: s.y, vx: rand(-15, 15), vy: rand(-15, 15), life: 0.3, size: s.r * 0.6, size1: 0, color: s.color, glow: 0.8 })
      if (!s.noCollide && !s.dead) this.collideShot(s)
      if (s.life <= 0 && !s.dead) {
        s.dead = true
        s.onExpire?.(s, this)
      }
    }
  }

  private collideShot(s: Shot) {
    this.grid.query(s.x, s.y, s.r, (e) => {
      const rr = s.r + e.r
      if (dist2(s.x, s.y, e.x, e.y) > rr * rr) return
      if (!this.canHit(s, e)) return
      this.hitWith(s, e)
      return s.dead
    })
  }

  /** true if `s` may damage `e` right now (respects hitCd); records the hit. */
  canHit(s: Shot, e: Enemy) {
    const next = s.hits.get(e.id)
    if (next !== undefined && this.time < next) return false
    s.hits.set(e.id, this.time + s.hitCd)
    return true
  }

  /** Apply a shot's damage & effects to an enemy (consumes pierce). */
  hitWith(s: Shot, e: Enemy) {
    const sp = Math.hypot(s.vx, s.vy)
    const dx = sp > 1 ? s.vx / sp : e.x - s.x, dy = sp > 1 ? s.vy / sp : e.y - s.y
    this.damage(e, s.dmg, s.src, { kb: s.kb, dirx: dx, diry: dy, fuse: s.fuse })
    s.onHit?.(s, e, this)
    if (s.pierce !== Infinity && --s.pierce <= 0) {
      s.dead = true
      s.onExpire?.(s, this)
    }
  }

  // ───────────────────────────── damage ─────────────────────────────
  /** Damage an enemy. Returns damage dealt. Handles crits, knockback, fusion procs, numbers, death. */
  damage(e: Enemy, base: number, src: WeaponInst | null, o: { kb?: number; dirx?: number; diry?: number; fuse?: Fuse | null; noCrit?: boolean; noText?: boolean } = {}) {
    if (e.dead || e.invuln) return 0
    const st = this.p.stats
    const crit = !o.noCrit && Math.random() < st.crit
    let dmg = base * (crit ? st.critDmg : 1) * (e.freeze > 0 ? 1.25 : 1)
    dmg = Math.max(1, dmg)
    e.hp -= dmg
    e.flash = 0.09
    if (src) src.dmg += dmg
    if (o.kb) {
      const l = Math.hypot(o.dirx ?? 0, o.diry ?? 0) || 1
      const k = (o.kb * st.knockback) / e.mass
      e.kbx += ((o.dirx ?? 0) / l) * k
      e.kby += ((o.diry ?? 0) / l) * k
    }
    if (!o.noText && this.settings.dmgNumbers && (crit || this.texts.length < 90)) {
      this.texts.push({ x: e.x + rand(-6, 6), y: e.y - e.r, text: String(Math.round(dmg)), life: crit ? 0.8 : 0.55, max: crit ? 0.8 : 0.55, size: crit ? 20 : 13, color: crit ? '#ffd23d' : '#ffffff', vy: crit ? -70 : -50 })
    }
    this.sfx(crit ? 'crit' : 'hit', { vol: 0.35 }, 0.045)
    const f = o.fuse === undefined ? src?.fuse : o.fuse
    if (f === 'Y') {
      e.burn = 3
      e.burnDps = Math.max(e.burnDps, base * 0.2)
      if (chance(0.22)) this.chain(e, base * 0.5, src, 3, COLOR.Y)
    } else if (f === 'C') {
      e.slow = Math.max(e.slow, 1.5)
      e.slowAmt = Math.max(e.slowAmt, 0.45)
      if (!e.boss && chance(0.12)) e.freeze = Math.max(e.freeze, 1.1)
    } else if (f === 'M') {
      if (chance(0.05)) this.heal(1, true)
    }
    if (e.hp <= 0) this.kill(e, src, f ?? null)
    return dmg
  }

  /** Chain lightning from `from` to up to n nearby enemies. */
  chain(from: Enemy, dmg: number, src: WeaponInst | null, n: number, color: RGB) {
    let cur = from
    const hit = new Set([from.id])
    for (let i = 0; i < n; i++) {
      let best: Enemy | null = null, bd = 170 * 170
      this.grid.query(cur.x, cur.y, 170, (e) => {
        if (hit.has(e.id)) return
        const d = dist2(cur.x, cur.y, e.x, e.y)
        if (d < bd) {
          bd = d
          best = e
        }
      })
      if (!best) break
      const b = best as Enemy
      hit.add(b.id)
      this.zap(cur.x, cur.y, b.x, b.y, color)
      this.damage(b, dmg, src, { fuse: null, noCrit: true })
      cur = b
    }
    if (hit.size > 1) this.sfx('zap', { vol: 0.5 }, 0.08)
  }

  kill(e: Enemy, src: WeaponInst | null, fuse: Fuse | null = null) {
    if (e.dead) return
    e.dead = true
    this.kills++
    if (src) src.kills++
    const p = this.p
    if (!p.odReady) p.overdrive = Math.min(100, p.overdrive + (e.boss ? 0 : e.elite ? 10 : 0.45 + e.xp * 0.2))
    e.def.death?.(e, this)
    p.char.onKill?.(this, e)
    const luck = p.stats.luck
    this.dropXp(e.x, e.y, e.xp)
    if (e.elite) {
      this.elites++
      this.drop('chest', e.x, e.y, 1)
      for (let i = 0; i < 5; i++) this.drop('lumen', e.x + rand(-20, 20), e.y + rand(-20, 20), randi(1, 3))
      this.hitstop(0.06)
      this.shake(0.35)
      this.ringFx(e.x, e.y, 120, e.color)
      this.sfx('eliteDie')
    } else if (!e.boss) {
      if (chance(0.01 * luck)) this.drop('lumen', e.x, e.y, randi(1, 2))
      if (chance(0.0035 * luck)) this.drop('heal', e.x, e.y, 25)
      else if (chance(0.0009 * luck)) this.drop('magnet', e.x, e.y, 1)
      else if (chance(0.0006 * luck)) this.drop(chance(0.5) ? 'bomb' : 'freeze', e.x, e.y, 1)
      this.sfx('enemyDie', { vol: 0.4, pitch: rand(0.85, 1.2) }, 0.04)
    }
    // death fx: fragments + flash
    const n = e.boss ? 60 : e.elite ? 24 : 6
    this.burst(e.x, e.y, { n, color: e.color, speed: 160 + e.r * 4, life: 0.5, size: Math.max(2, e.r * 0.3), shape: e.def.shape, spin: 8 })
    this.part({ x: e.x, y: e.y, life: 0.18, size: e.r * 2.2, size1: e.r * 0.5, color: mix(e.color, WHITE, 0.5), alpha: 0.7, shape: Shape.Glow })
    // fusion death effects
    if (fuse === 'C' && e.freeze > 0) {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + rand(0, 0.5)
        this.shot({ x: e.x, y: e.y, vx: Math.cos(a) * 380, vy: Math.sin(a) * 380, r: 5, w: 7, h: 2.5, shape: Shape.Diamond, dmg: (src ? this.weaponStats(src).dmg : 10) * 0.5, life: 0.45, pierce: 2, fuse: null }, src)
      }
      this.sfx('shatter', { vol: 0.5 }, 0.06)
    } else if (fuse === 'M' && chance(0.08)) this.voidWell(e.x, e.y, src)
    if (p.resonance().R >= 6 && chance(0.18)) this.explode(e.x, e.y, 70 * p.stats.area, 18 * p.stats.might, null, COLOR.R)
    if (e.boss) this.bossDown(e)
  }

  /** Radial explosion that damages enemies. */
  explode(x: number, y: number, r: number, dmg: number, src: WeaponInst | null, color: RGB, fuse: Fuse | null = null) {
    this.inRadius(x, y, r, (e) => void this.damage(e, dmg, src, { kb: 140, dirx: e.x - x, diry: e.y - y, fuse }))
    this.part({ x, y, life: 0.3, size: r * 1.1, size1: r * 0.2, color, alpha: 0.8, shape: Shape.Glow })
    this.part({ x, y, life: 0.35, size: r * 0.2, size1: r, color, alpha: 0.9, shape: Shape.Ring, glow: 1 })
    this.burst(x, y, { n: 10, color, speed: r * 3, life: 0.4, size: 2.5 })
    this.sfx('explode', { vol: 0.45 }, 0.05)
  }

  /** Magenta fusion: a small singularity that drags enemies in and crushes them. */
  voidWell(x: number, y: number, src: WeaponInst | null) {
    const dmg = src ? this.weaponStats(src).dmg * 0.25 : 8
    this.shot({
      x, y, r: 70, life: 1.6, pierce: Infinity, hitCd: 0.25, dmg, kb: 0, glow: 1, color: COLOR.M, shape: Shape.Ring,
      update: (s, w, dt) => {
        w.inRadius(s.x, s.y, s.r * 1.6, (e) => {
          if (e.boss) return
          const dx = s.x - e.x, dy = s.y - e.y, l = Math.hypot(dx, dy) || 1
          e.x += (dx / l) * 140 * dt
          e.y += (dy / l) * 140 * dt
        })
      },
      draw: (s) => {
        const k = s.life / s.maxLife
        R.draw(Shape.Circle, s.x, s.y, 16, 16, 0, [0, 0, 0], 0.9, 0, 0, 0)
        R.draw(Shape.Ring, s.x, s.y, 18 + 50 * k, 18 + 50 * k, 0, COLOR.M, 0.6 * k, 1, 2)
        R.draw(Shape.Ring, s.x, s.y, 18, 18, 0, COLOR.M, 1, 1.5, 3)
      },
    }, src).fuse = null
    this.sfx('void', { vol: 0.5 }, 0.15)
  }

  private bossDown(e: Enemy) {
    this.bossKills++
    this.boss = null
    this.hooks.boss(null)
    this.arena = null
    this.hitstop(0.25)
    this.shake(1)
    this.flash(WHITE, 0.6)
    R.ripple(e.x, e.y, 2.5, 1.2, 0.9)
    this.sfx('bossDie')
    for (let i = 0; i < 40; i++) this.drop('lumen', e.x + rand(-80, 80), e.y + rand(-80, 80), randi(2, 5))
    this.drop('chest', e.x, e.y, 3)
    if (this.opts.endless) {
      this.hooks.banner(loc({ en: 'BOSS DEFEATED', zh: '首领已击败' }), loc({ en: 'The fall continues…', zh: '坠落仍在继续……' }), e.color)
      audio.music(this.opts.stage.music)
    } else {
      this.timeScale = 0.35
      this.ending = 3.2
      this.win = true
    }
  }

  win = false

  /** give up the run (counts as a loss) */
  abandon() {
    this.win = false
    this.p.dead = true
    this.ending = 0.01
    this.modal = false
  }

  private updateEnding(dt: number) {
    this.ending -= dt
    this.timeScale = damp(this.timeScale, 1, 1.5, dt)
    if (this.win) for (const pk of this.pickups) if (pk.kind !== 'chest') pk.pull = true
    if (this.ending <= 0) {
      this.ending = 0
      this.hooks.end(this.result())
      this.modal = true
    }
  }

  // ───────────────────────────── player ─────────────────────────────
  hurt(dmg: number) {
    const p = this.p
    if (p.iframes > 0 || p.dead || this.ending) return
    dmg = Math.max(1, dmg * this.mods.dmg - p.stats.armor)
    p.hp -= dmg
    // Longer invulnerability the more hurt you already are: a burst that lands while you are low must not
    // chain into an instant death, which is what makes a crowded screen feel unfair rather than hard.
    p.iframes = p.hp < p.stats.maxHp * 0.35 ? 0.9 : 0.6
    this.dmgTaken += dmg
    this.lastHit = this.time
    this.shake(0.45)
    this.hurtT = 0.5
    this.sfx('hurt')
    input.rumble(0.6, 140)
    this.hitstop(0.04)
    if (p.hp <= 0) {
      if (p.revivals > 0) {
        p.revivals--
        p.hp = p.stats.maxHp * 0.5
        p.iframes = 2.5
        this.sfx('revive')
        this.flash(WHITE, 0.7)
        this.inRadius(p.x, p.y, 500, (e) => void this.damage(e, e.boss ? 200 : 99999, null, { kb: 600, dirx: e.x - p.x, diry: e.y - p.y, noText: true }))
        this.bullets.forEach((b) => (b.dead = true))
        R.ripple(p.x, p.y, 2)
        this.hooks.banner(loc({ en: 'REVIVED', zh: '复苏' }), '', COLOR.W)
      } else {
        p.dead = true
        p.hp = 0
        this.sfx('death')
        this.flash(COLOR.R, 0.5)
        this.burst(p.x, p.y, { n: 60, color: p.char.color, speed: 400, life: 1.2, size: 4, shape: p.char.shape })
        R.ripple(p.x, p.y, 2.5, 1.2)
        this.timeScale = 0.3
        this.ending = 2.2
        this.win = false
        audio.music(null)
      }
    }
  }

  heal(n: number, silent = false) {
    const p = this.p
    if (p.dead) return
    n *= this.mods.heal
    p.hp = Math.min(p.stats.maxHp, p.hp + n)
    if (!silent) {
      this.texts.push({ x: p.x, y: p.y - 20, text: '+' + Math.round(n), life: 0.8, max: 0.8, size: 15, color: '#3dff8b', vy: -40 })
      this.burst(p.x, p.y, { n: 12, color: COLOR.G, speed: 120, life: 0.6, size: 2.5 })
    }
  }

  /** Prism Burst — the player's ultimate. */
  overdrive() {
    const p = this.p
    p.overdrive = 0
    p.odReady = false
    this.overdrives++
    const res = p.resonance()
    const prism = p.prismatic
    const top: 'R' | 'G' | 'B' = res.R >= res.G && res.R >= res.B ? 'R' : res.G >= res.B ? 'G' : 'B'
    const color = prism ? WHITE : COLOR[top]
    const dmg = (60 + p.level * 6) * p.stats.might * (prism || top === 'R' ? 1.6 : 1)
    this.inRadius(p.x, p.y, this.viewR, (e) => {
      this.damage(e, e.boss ? dmg * 0.6 : dmg, null, { kb: 500, dirx: e.x - p.x, diry: e.y - p.y, fuse: prism ? 'Y' : null })
      if (prism || top === 'B') {
        e.freeze = Math.max(e.freeze, e.boss ? 0.8 : 3)
      }
    })
    if (prism || top === 'G') this.heal(p.stats.maxHp * 0.3)
    this.bullets.forEach((b) => (b.dead = true))
    p.iframes = Math.max(p.iframes, 1)
    R.ripple(p.x, p.y, 3, 1, 1.4)
    this.flash(color, 0.45)
    this.shake(0.8)
    this.hitstop(0.08)
    this.sfx('overdrive')
    input.rumble(1, 300)
    for (let i = 0; i < 3; i++) this.part({ x: p.x, y: p.y, life: 0.6 + i * 0.15, size: 20, size1: this.viewR * (0.6 + i * 0.25), color: prism ? [COLOR.R, COLOR.G, COLOR.B][i] : color, alpha: 0.9, shape: Shape.Ring, glow: 1.5 })
  }

  gainXp(v: number) {
    const p = this.p
    p.xp += v * p.stats.growth
    while (p.xp >= p.xpNext) {
      p.xp -= p.xpNext
      p.level++
      p.pending++
      p.xpNext = xpForLevel(p.level)
      // a small heal on every level keeps a good run from dying to accumulated chip damage; it is also
      // what makes "keep killing" a survivable strategy rather than a pure DPS race
      if (p.hp < p.stats.maxHp) this.heal(p.stats.maxHp * 0.06, true)
      p.char.onLevel?.(this)
    }
  }

  // ───────────────────────────── enemies ─────────────────────────────
  spawnEnemy(def: EnemyDef | string, x: number, y: number, o: { elite?: boolean; hpMul?: number } = {}): Enemy {
    const d = typeof def === 'string' ? enemyById.get(def)! : def
    const tScale = 1 + (this.time / 60) * 0.28
    const elite = !!o.elite
    const hp = d.hp * this.mods.hp * (d.boss ? 1 : tScale) * (elite ? 14 : 1) * (o.hpMul ?? 1)
    const e: Enemy = {
      id: nextId++, def: d, x, y, vx: 0, vy: 0, r: d.r * (elite ? 1.6 : 1), rot: 0, hp, maxHp: hp,
      speed: d.speed * this.mods.speed * (elite ? 0.9 : 1), dmg: d.dmg * (elite ? 1.5 : 1), xp: d.xp * (elite ? 10 : 1),
      mass: (d.mass ?? 1) * (elite ? 5 : 1), color: d.color, elite, boss: !!d.boss, t: 0, state: 0, timer: 0, data: {},
      flash: 0, slow: 0, slowAmt: 0, freeze: 0, burn: 0, burnDps: 0, kbx: 0, kby: 0, dead: false, invuln: false, noSep: !!d.boss, q: 0,
    }
    d.spawn?.(e, this)
    this.enemies.push(e)
    save.see(d.id)
    if (e.boss) {
      this.boss = e
      this.arena = { x: this.p.x, y: this.p.y, r: 620, color: d.color }
      this.hooks.boss(e)
      audio.music(d.music ?? 'boss')
      this.sfx('bossRoar')
      this.shake(0.6)
    }
    return e
  }

  /** default movement: steer toward the player */
  chase(e: Enemy, dt: number, mult = 1) {
    const dx = this.p.x - e.x, dy = this.p.y - e.y, l = Math.hypot(dx, dy) || 1
    const sp = e.speed * mult
    e.vx = damp(e.vx, (dx / l) * sp, 6, dt)
    e.vy = damp(e.vy, (dy / l) * sp, 6, dt)
    e.rot = Math.atan2(e.vy, e.vx)
  }

  angleToPlayer(e: { x: number; y: number }) {
    return Math.atan2(this.p.y - e.y, this.p.x - e.x)
  }

  private updateEnemies(dt: number) {
    const p = this.p
    const despawn = this.viewR * 1.7
    for (const e of this.enemies) {
      if (e.dead) continue
      e.t += dt
      e.flash -= dt
      if (e.burn > 0) {
        e.burn -= dt
        e.hp -= e.burnDps * dt
        if (Math.random() < dt * 8) this.part({ x: e.x + rand(-e.r, e.r), y: e.y + rand(-e.r, e.r), vy: -40, life: 0.4, size: 2.5, color: COLOR.Y, glow: 1 })
        if (e.hp <= 0) {
          this.kill(e, null)
          continue
        }
      } else e.burnDps = 0
      let mult = 1
      if (e.slow > 0) {
        e.slow -= dt
        mult *= 1 - e.slowAmt
      } else e.slowAmt = 0
      if (e.freeze > 0) {
        e.freeze -= dt
        mult = 0
      }
      const edt = dt * (e.boss ? Math.max(mult, 0.35) : mult)
      if (edt > 0) {
        if (e.def.ai) e.def.ai(e, this, edt)
        else this.chase(e, edt)
        e.x += e.vx * edt
        e.y += e.vy * edt
      }
      e.x += e.kbx * dt
      e.y += e.kby * dt
      const kd = Math.exp(-10 * dt)
      e.kbx *= kd
      e.kby *= kd
      // crowd separation
      if (!e.noSep) {
        this.grid.query(e.x, e.y, e.r, (o) => {
          if (o === e || o.noSep) return
          const dx = e.x - o.x, dy = e.y - o.y, rr = e.r + o.r, d2 = dx * dx + dy * dy
          if (d2 >= rr * rr || d2 < 1e-6) return
          const d = Math.sqrt(d2), push = ((rr - d) / d) * 0.25
          const k = o.mass / (e.mass + o.mass)
          e.x += dx * push * k * 2
          e.y += dy * push * k * 2
        })
      }
      if (e.boss && this.arena) {
        const a = this.arena, dx = e.x - a.x, dy = e.y - a.y, d = Math.hypot(dx, dy), max = a.r - e.r * 0.5
        if (d > max) {
          e.x = a.x + (dx / d) * max
          e.y = a.y + (dy / d) * max
        }
      }
      // contact damage — the touching body is shoved back, so a swarm cannot pin the player in place.
      // The shove is small: standing in a crowd is still lethal, it just does not instantly trap you.
      if (!p.dead) {
        const rr = e.r + p.r * 0.8
        if (dist2(e.x, e.y, p.x, p.y) < rr * rr && e.dmg > 0 && e.freeze <= 0) {
          const before = p.iframes
          this.hurt(e.dmg)
          if (p.iframes > before) {
            const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1
            const shove = 70 / Math.max(1, e.mass)
            e.kbx += (dx / d) * shove
            e.kby += (dy / d) * shove
          }
        }
      }
      // recycle stragglers in front of the player
      if (!e.boss && dist2(e.x, e.y, p.x, p.y) > despawn * despawn) {
        const [x, y] = this.spawnPoint()
        e.x = x
        e.y = y
        e.kbx = e.kby = 0
      }
    }
  }

  /** a point on the ring just off-screen, biased toward the player's movement */
  spawnPoint(): [number, number] {
    const p = this.p
    let a = rand(0, TAU)
    if (p.moving && chance(0.45)) a = Math.atan2(p.face.y, p.face.x) + rand(-0.9, 0.9)
    const r = this.viewR + rand(10, 80)
    return [p.x + Math.cos(a) * r, p.y + Math.sin(a) * r]
  }

  nearest(x: number, y: number, maxR: number, skip?: (e: Enemy) => boolean): Enemy | null {
    let best: Enemy | null = null, bd = maxR * maxR
    for (const e of this.enemies) {
      if (e.dead || (skip && skip(e))) continue
      const d = dist2(x, y, e.x, e.y)
      if (d < bd) {
        bd = d
        best = e
      }
    }
    return best
  }

  /** visit every live enemy whose body intersects the circle */
  inRadius(x: number, y: number, r: number, cb: (e: Enemy) => void) {
    const hits: Enemy[] = []
    this.grid.query(x, y, r, (e) => {
      const rr = r + e.r
      if (dist2(x, y, e.x, e.y) < rr * rr) hits.push(e)
    })
    for (const e of hits) if (!e.dead) cb(e)
  }

  /** visit every live enemy whose body intersects the thick segment */
  inLine(x1: number, y1: number, x2: number, y2: number, halfW: number, cb: (e: Enemy) => void) {
    const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2, r = Math.hypot(x2 - x1, y2 - y1) / 2 + halfW
    const hits: Enemy[] = []
    this.grid.query(cx, cy, r, (e) => {
      const rr = halfW + e.r
      if (segDist2(e.x, e.y, x1, y1, x2, y2) < rr * rr) hits.push(e)
    })
    for (const e of hits) if (!e.dead) cb(e)
  }

  /** random live enemy, preferring ones on screen */
  randomEnemy(onScreen = true): Enemy | null {
    const B = R.bounds
    const list = onScreen ? this.enemies.filter((e) => !e.dead && e.x > B.l && e.x < B.r && e.y > B.t && e.y < B.b) : this.enemies.filter((e) => !e.dead)
    return list.length ? list[Math.floor(Math.random() * list.length)] : null
  }

  // ───────────────────────────── enemy bullets & hazards ─────────────────────────────
  enemyShot(x: number, y: number, ang: number, speed: number, o: Partial<Bullet> = {}): Bullet {
    const sp = speed * this.mods.bulletSpeed
    const b: Bullet = { x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, r: 7, dmg: 10, life: 6, t: 0, color: [1, 0.25, 0.55], shape: Shape.Circle, rot: ang, dead: false, data: null, ...o }
    this.bullets.push(b)
    return b
  }

  /** n bullets evenly spread around a circle */
  ringShot(x: number, y: number, n: number, speed: number, offset = 0, o: Partial<Bullet> = {}) {
    for (let i = 0; i < n; i++) this.enemyShot(x, y, offset + (i / n) * TAU, speed, o)
  }

  private updateBullets(dt: number) {
    const p = this.p
    const far = this.viewR * 1.6
    for (const b of this.bullets) {
      if (b.dead) continue
      b.t += dt
      b.life -= dt
      if (b.update) b.update(b, this, dt)
      else {
        b.x += b.vx * dt
        b.y += b.vy * dt
      }
      if (b.life <= 0 || dist2(b.x, b.y, p.x, p.y) > far * far) b.dead = true
      const rr = b.r + p.r * 0.6
      if (!p.dead && !b.dead && dist2(b.x, b.y, p.x, p.y) < rr * rr && p.iframes <= 0) {
        this.hurt(b.dmg)
        b.dead = true
        this.burst(b.x, b.y, { n: 6, color: b.color, speed: 120, life: 0.3, size: 2 })
      }
    }
  }

  /** Telegraphed danger zone (circle or line) that damages the player when it goes off. */
  hazard(o: Partial<Hazard> & { x: number; y: number }): Hazard {
    const h: Hazard = { kind: 'circle', r: 80, x2: o.x, y2: o.y, delay: 1, active: 0.12, t: 0, dmg: 20, color: [1, 0.3, 0.3], dead: false, ...o }
    this.hazards.push(h)
    return h
  }

  private updateHazards(dt: number) {
    const p = this.p
    for (const h of this.hazards) {
      const was = h.t
      h.t += dt
      if (was < h.delay && h.t >= h.delay) {
        h.onBoom?.(h, this)
        if (h.kind === 'circle') {
          this.part({ x: h.x, y: h.y, life: 0.3, size: h.r, size1: h.r * 1.15, color: h.color, alpha: 0.7, shape: Shape.Glow })
          this.burst(h.x, h.y, { n: 14, color: h.color, speed: h.r * 3, life: 0.4, size: 3 })
        }
        this.shake(0.15)
      }
      if (h.t >= h.delay && h.t < h.delay + h.active && !p.dead) {
        const rr = h.r + p.r * 0.5
        const inside = h.kind === 'circle' ? dist2(p.x, p.y, h.x, h.y) < rr * rr : segDist2(p.x, p.y, h.x, h.y, h.x2, h.y2) < rr * rr
        if (inside) this.hurt(h.dmg)
      }
      if (h.t >= h.delay + h.active) h.dead = true
    }
  }

  // ───────────────────────────── pickups ─────────────────────────────
  dropXp(x: number, y: number, v: number) {
    if (v <= 0) return
    if (this.pickups.length > 420) {
      // merge into an existing distant photon to cap entity count
      for (let i = 0; i < 8; i++) {
        const pk = this.pickups[Math.floor(Math.random() * this.pickups.length)]
        if (pk.kind === 'xp' && !pk.pull) {
          pk.value += v
          return
        }
      }
    }
    this.drop('xp', x, y, v)
  }

  drop(kind: PickupKind, x: number, y: number, value: number) {
    const a = rand(0, TAU), s = kind === 'xp' ? rand(20, 60) : rand(60, 120)
    this.pickups.push({ kind, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, value, t: 0, pull: false, dead: false })
  }

  private updatePickups(dt: number) {
    const p = this.p
    const mag = p.stats.magnet
    for (const pk of this.pickups) {
      if (pk.dead) continue
      pk.t += dt
      // recompute every frame: orbs and the player both move, and collecting must use the CURRENT distance
      const dx = p.x - pk.x, dy = p.y - pk.y, d2 = dx * dx + dy * dy
      if (!pk.pull && pk.kind !== 'chest' && d2 < mag * mag && pk.t > 0.25) pk.pull = true
      // Long-lived XP slowly drifts in, so a kiting player is never permanently starved of the progression
      // that dropped behind them. This is the genre-standard affordance; it does not apply to chests.
      if (!pk.pull && pk.kind === 'xp' && pk.t > 2.5) {
        const d = Math.sqrt(d2) || 1
        const sp = Math.min(150, 26 + (pk.t - 2.5) * 45)
        pk.vx += ((dx / d) * sp - pk.vx) * Math.min(1, dt * 3)
        pk.vy += ((dy / d) * sp - pk.vy) * Math.min(1, dt * 3)
      }
      if (pk.pull && !p.dead) {
        const d = Math.sqrt(d2) || 1, sp = 250 + pk.t * 120 + (pk.kind === 'xp' ? 200 : 0)
        pk.vx = damp(pk.vx, (dx / d) * sp, 9, dt)
        pk.vy = damp(pk.vy, (dy / d) * sp, 9, dt)
      } else if (!pk.vx && !pk.vy) {
        // nothing to do — keeps the damp branch below from zeroing the drift above
      } else if (!(pk.kind === 'xp' && pk.t > 2.5)) {
        const k = Math.exp(-4 * dt)
        pk.vx *= k
        pk.vy *= k
      }
      pk.x += pk.vx * dt
      pk.y += pk.vy * dt
      // collect against the post-move positions, not the stale pre-move distance
      const cx = p.x - pk.x, cy = p.y - pk.y, rr = p.r + 16
      if (cx * cx + cy * cy < rr * rr && !p.dead) this.collect(pk)
    }
    this.xpComboT -= dt
    if (this.xpComboT <= 0) this.xpCombo = 0
  }

  private collect(pk: Pickup) {
    pk.dead = true
    const p = this.p
    switch (pk.kind) {
      case 'xp':
        this.gainXp(pk.value)
        this.xpCombo = Math.min(this.xpCombo + 1, 30)
        this.xpComboT = 0.6
        this.sfx('xp', { vol: 0.3, pitch: 1 + this.xpCombo * 0.035 }, 0.025)
        break
      case 'lumen': {
        const v = Math.max(1, Math.round(pk.value * p.stats.greed * this.mods.lumens))
        this.lumens += v
        this.sfx('lumen', { vol: 0.4 }, 0.03)
        break
      }
      case 'heal':
        this.heal(pk.value)
        this.sfx('heal')
        break
      case 'magnet':
        for (const o of this.pickups) if (o.kind === 'xp' || o.kind === 'lumen') o.pull = true
        this.sfx('magnet')
        this.ringFx(p.x, p.y, 200, COLOR.B)
        break
      case 'bomb':
        this.inRadius(p.x, p.y, this.viewR, (e) => void this.damage(e, e.boss ? 150 : 99999, null, { noText: true }))
        this.flash(WHITE, 0.4)
        R.ripple(p.x, p.y, 2)
        this.shake(0.7)
        this.sfx('bomb')
        break
      case 'freeze':
        for (const e of this.enemies) e.freeze = Math.max(e.freeze, e.boss ? 1 : 5)
        this.flash(COLOR.C, 0.3)
        this.sfx('freeze')
        break
      case 'chest':
        this.chests++
        this.sfx('chest')
        this.openChest(pk.value)
        break
    }
  }

  /** chest tier: 1 = single upgrade, 3 = boss chest (three upgrades) */
  openChest(tier: number) {
    this.modal = true
    this.hooks.chest(rollChest(this, tier))
  }

  // ───────────────────────────── fx ─────────────────────────────
  part(o: Partial<Particle> & { x: number; y: number }) {
    if (this.parts.length > 3500) return
    this.parts.push({ vx: 0, vy: 0, life: 0.5, size: 3, size1: -1, color: WHITE, alpha: 1, shape: Shape.Circle, rot: 0, spin: 0, drag: 2, glow: 0, stretch: 0, ...o, max: o.max ?? o.life ?? 0.5 })
  }

  burst(x: number, y: number, o: { n: number; color: RGB; speed: number; life: number; size: number; shape?: number; spin?: number; stretch?: number }) {
    for (let i = 0; i < o.n; i++) {
      const a = rand(0, TAU), s = o.speed * rand(0.3, 1)
      this.part({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: o.life * rand(0.6, 1.2), size: o.size * rand(0.7, 1.3), size1: 0, color: o.color, shape: o.shape ?? Shape.Circle, rot: a, spin: (o.spin ?? 0) * rand(-1, 1), glow: 0.8, drag: 3, stretch: o.stretch ?? 0 })
    }
  }

  ringFx(x: number, y: number, r: number, color: RGB) {
    this.part({ x, y, life: 0.45, size: r * 0.25, size1: r, color, alpha: 0.9, shape: Shape.Ring, glow: 1.2 })
  }

  zap(x1: number, y1: number, x2: number, y2: number, color: RGB, w = 2.2) {
    const pts = [x1, y1]
    const n = Math.max(2, Math.floor(Math.hypot(x2 - x1, y2 - y1) / 22))
    const nx = -(y2 - y1), ny = x2 - x1, nl = Math.hypot(nx, ny) || 1
    for (let i = 1; i < n; i++) {
      const t = i / n, j = rand(-12, 12)
      pts.push(x1 + (x2 - x1) * t + (nx / nl) * j, y1 + (y2 - y1) * t + (ny / nl) * j)
    }
    pts.push(x2, y2)
    this.zaps.push({ pts, life: 0.16, max: 0.16, color, w })
  }

  text(x: number, y: number, text: string, color = '#ffffff', size = 16) {
    this.texts.push({ x, y, text, life: 1, max: 1, size, color, vy: -40 })
  }

  shake(t: number) {
    this.trauma = Math.min(1, this.trauma + t)
  }
  hitstop(s: number) {
    this.hitStop = Math.max(this.hitStop, s)
  }
  flash(c: RGB, a: number) {
    if (!this.settings.flashes) a *= 0.25
    this.flashC = c
    this.flashA = Math.max(this.flashA, a)
  }

  /** play a sound panned by world x; `gate` = min seconds between plays of this name */
  sfx(name: Sfx, o: SfxOpts & { x?: number } = {}, gate = 0) {
    if (gate) {
      if (this.real - (this.sfxGate[name] ?? -1) < gate) return
      this.sfxGate[name] = this.real
    }
    const pan = o.x !== undefined ? clamp((o.x - this.p.x) / 500, -0.8, 0.8) : o.pan
    audio.sfx(name, { ...o, pan })
  }

  private updateFx(dt: number) {
    for (const q of this.parts) {
      q.life -= dt
      const k = Math.exp(-q.drag * dt)
      q.vx *= k
      q.vy *= k
      q.x += q.vx * dt
      q.y += q.vy * dt
      q.rot += q.spin * dt
    }
    for (const t of this.texts) {
      t.life -= dt
      t.y += t.vy * dt
      t.vy *= Math.exp(-3 * dt)
    }
    for (const z of this.zaps) z.life -= dt
    this.trauma = Math.max(0, this.trauma - dt * 1.6)
    this.flashA = Math.max(0, this.flashA - dt * 2.2)
    this.hurtT = Math.max(0, this.hurtT - dt)
  }

  private cleanup() {
    const alive = <T extends { dead: boolean }>(a: T[]) => {
      let j = 0
      for (let i = 0; i < a.length; i++) if (!a[i].dead) a[j++] = a[i]
      a.length = j
    }
    alive(this.enemies)
    alive(this.shots)
    alive(this.bullets)
    alive(this.hazards)
    alive(this.pickups)
    this.parts = this.parts.filter((q) => q.life > 0)
    this.texts = this.texts.filter((t) => t.life > 0)
    this.zaps = this.zaps.filter((z) => z.life > 0)
  }

  private updateCamera(dt: number) {
    const p = this.p
    R.cam.x = damp(R.cam.x, p.x + p.vx * 0.1, 7, dt)
    R.cam.y = damp(R.cam.y, p.y + p.vy * 0.1, 7, dt)
    const sh = this.trauma * this.trauma * 16 * this.settings.shake
    R.cam.ox = (Math.random() * 2 - 1) * sh
    R.cam.oy = (Math.random() * 2 - 1) * sh
    R.bg.focusX = p.x
    R.bg.focusY = p.y
    R.bg.pulse = audio.beat()
    R.post.flash = [...this.flashC, this.flashA]
    R.post.tint = [0.9, 0.05, 0.15, this.hurtT * 0.7 + (p.hp / p.stats.maxHp < 0.3 && !p.dead ? 0.18 + Math.sin(this.real * 6) * 0.08 : 0)]
    R.post.ca = this.hurtT * 2 + this.trauma * 0.8
  }

  // ───────────────────────────── render ─────────────────────────────
  render() {
    const t = this.time
    // arena
    if (this.arena) {
      const a = this.arena
      const n = 72
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * TAU + t * 0.1
        R.draw(Shape.Hex, a.x + Math.cos(ang) * a.r, a.y + Math.sin(ang) * a.r, 9, 9, ang, a.color, 0.8 + Math.sin(t * 4 + i) * 0.2, 1, 2)
      }
      R.draw(Shape.Ring, a.x, a.y, a.r + 4, a.r + 4, 0, a.color, 0.5, 1.2, 2)
    }
    // hazards (under everything)
    for (const h of this.hazards) {
      const k = clamp(h.t / h.delay, 0, 1), live = h.t >= h.delay
      const c = h.color, blink = 0.55 + Math.sin(t * 30) * 0.15
      if (h.kind === 'circle') {
        R.draw(Shape.Circle, h.x, h.y, h.r, h.r, 0, c, live ? 0.5 : 0.08, 0, 0, 1)
        R.draw(Shape.Circle, h.x, h.y, h.r * k, h.r * k, 0, c, live ? 0.6 : 0.16, 0, 0, 1)
        R.draw(Shape.Ring, h.x, h.y, h.r, h.r, 0, c, live ? 1 : blink, 0.8, 2)
      } else {
        const len = Math.hypot(h.x2 - h.x, h.y2 - h.y) / 2, ang = Math.atan2(h.y2 - h.y, h.x2 - h.x)
        const cx = (h.x + h.x2) / 2, cy = (h.y + h.y2) / 2
        if (live) {
          R.draw(Shape.Capsule, cx, cy, len + h.r, h.r, ang, c, 0.9, 1.5)
          R.draw(Shape.Capsule, cx, cy, len + h.r * 0.4, h.r * 0.4, ang, WHITE, 1, 0.5)
        } else {
          R.draw(Shape.Capsule, cx, cy, len + h.r, h.r, ang, c, 0.1, 0, 0)
          R.draw(Shape.Capsule, cx, cy, len + h.r, h.r * k, ang, c, 0.18, 0, 0)
          R.draw(Shape.Capsule, cx, cy, len + h.r, h.r, ang, c, blink, 0.5, 1.5)
        }
      }
    }
    // pickups
    for (const pk of this.pickups) this.drawPickup(pk)
    // enemies
    for (const e of this.enemies) {
      if (e.def.draw) e.def.draw(e, this)
      else this.drawEnemy(e)
      if (e.freeze > 0) R.draw(e.def.shape, e.x, e.y, e.r * 1.1, e.r * 1.1, e.rot, COLOR.C, 0.35, 0.6, 0, 1)
      if ((e.elite || (e.boss && !this.boss)) && e.hp < e.maxHp) {
        const f = clamp(e.hp / e.maxHp, 0, 1), bw = e.r
        R.draw(Shape.Box, e.x, e.y - e.r - 10, bw, 2, 0, [0.1, 0.02, 0.04], 0.85, 0, 0, 0)
        R.draw(Shape.Box, e.x - bw + bw * f, e.y - e.r - 10, bw * f, 2, 0, COLOR.Y, 1, 0.6)
      }
    }
    // shots
    for (const s of this.shots) {
      if (s.draw) s.draw(s, this)
      else {
        R.draw(s.shape, s.x, s.y, s.w, s.h, s.rot, s.color, s.alpha, s.glow)
        R.draw(s.shape, s.x, s.y, s.w * 0.5, s.h * 0.5, s.rot, WHITE, s.alpha * 0.9, 0)
      }
    }
    // zaps
    for (const z of this.zaps) {
      const a = z.life / z.max
      for (let i = 0; i + 3 < z.pts.length; i += 2) {
        R.line(z.pts[i], z.pts[i + 1], z.pts[i + 2], z.pts[i + 3], z.w, z.color, a, 1.2)
        R.line(z.pts[i], z.pts[i + 1], z.pts[i + 2], z.pts[i + 3], z.w * 0.4, WHITE, a, 0)
      }
    }
    if (!this.p.dead) this.p.draw(this)
    // particles
    for (const q of this.parts) {
      const k = q.life / q.max
      const size = q.size1 < 0 ? q.size * k : q.size1 + (q.size - q.size1) * k
      if (q.stretch > 0) {
        const sp = Math.hypot(q.vx, q.vy)
        R.draw(Shape.Capsule, q.x, q.y, size + sp * q.stretch, size, Math.atan2(q.vy, q.vx), q.color, q.alpha * k, q.glow)
      } else if (q.shape === Shape.Ring) R.draw(Shape.Ring, q.x, q.y, size, size, q.rot, q.color, q.alpha * k, q.glow, Math.max(1.5, size * 0.05))
      else R.draw(q.shape, q.x, q.y, size, size, q.rot, q.color, q.alpha * Math.min(1, k * 1.5), q.glow)
    }
    // enemy bullets on top for readability
    for (const b of this.bullets) {
      const pulse = 1 + Math.sin(b.t * 18) * 0.12
      R.draw(b.shape, b.x, b.y, b.r * 1.25 * pulse, b.r * 1.25 * pulse, b.rot, b.color, 1, 1.4)
      R.draw(b.shape, b.x, b.y, b.r * 0.6, b.r * 0.6, b.rot, WHITE, 1, 0)
    }
  }

  drawEnemy(e: Enemy) {
    const sc = 1 + Math.max(0, e.flash) * 2.5
    const c = e.flash > 0 ? WHITE : e.color
    const r = e.r * sc
    R.draw(e.def.shape, e.x, e.y, r, r, e.rot, scale(e.color, 0.16), 0.92, 0, 0, 0)
    R.draw(e.def.shape, e.x, e.y, r, r, e.rot, c, 1, e.elite ? 1.4 : 0.8, Math.max(1.8, e.r * 0.14))
    if (e.elite) {
      const pr = r + 7 + Math.sin(e.t * 5) * 2
      R.draw(Shape.Ring, e.x, e.y, pr, pr, 0, COLOR.Y, 0.8, 1, 1.5)
    }
  }

  private drawPickup(pk: Pickup) {
    const t = this.time + pk.x * 0.01
    const bob = Math.sin(t * 4) * 1.5
    switch (pk.kind) {
      case 'xp': {
        const c = XP_COLORS.find(([v]) => pk.value >= v)![1]
        const s = 3.2 + Math.min(6, Math.log2(1 + pk.value) * 1.3)
        R.draw(Shape.Diamond, pk.x, pk.y + bob, s * 0.75, s * 1.15, 0, c, 1, 0.9)
        R.draw(Shape.Diamond, pk.x, pk.y + bob, s * 0.3, s * 0.5, 0, WHITE, 0.9, 0)
        break
      }
      case 'lumen':
        R.draw(Shape.Star, pk.x, pk.y + bob, 6, 6, t * 2, COLOR.Y, 1, 1)
        break
      case 'heal':
        R.draw(Shape.Heart, pk.x, pk.y + bob, 9, 9, 0, COLOR.G, 1, 1.2)
        break
      case 'magnet':
        R.draw(Shape.Ring, pk.x, pk.y + bob, 10, 10, 0, COLOR.B, 1, 1.2, 3)
        R.draw(Shape.Circle, pk.x, pk.y + bob, 4, 4, 0, WHITE, 1, 0.8)
        break
      case 'bomb':
        R.draw(Shape.Star, pk.x, pk.y + bob, 11, 11, t, COLOR.R, 1, 1.2, 2.5)
        R.draw(Shape.Circle, pk.x, pk.y + bob, 4, 4, 0, WHITE, 1, 0.8)
        break
      case 'freeze':
        R.draw(Shape.Hex, pk.x, pk.y + bob, 10, 10, t, COLOR.C, 1, 1.2, 2.5)
        R.draw(Shape.Cross, pk.x, pk.y + bob, 5, 5, t, WHITE, 1, 0.5)
        break
      case 'chest': {
        const s = 14 + Math.sin(t * 3) * 1.5
        R.draw(Shape.Glow, pk.x, pk.y, 60, 60, 0, COLOR.Y, 0.35)
        R.draw(Shape.Box, pk.x, pk.y + bob, s, s * 0.75, 0, scale(COLOR.Y, 0.2), 1, 0, 0, 0)
        R.draw(Shape.Box, pk.x, pk.y + bob, s, s * 0.75, 0, COLOR.Y, 1, 1.4, 2.5)
        R.draw(Shape.Diamond, pk.x, pk.y + bob, 5, 7, 0, WHITE, 1, 1)
        for (let i = 0; i < 3; i++) {
          const a = t * 1.5 + (i * TAU) / 3
          R.draw(Shape.Diamond, pk.x + Math.cos(a) * 26, pk.y + Math.sin(a) * 26, 2.5, 4, a, [COLOR.R, COLOR.G, COLOR.B][i], 1, 1)
        }
        break
      }
    }
  }

  /** 2D overlay: damage numbers & off-screen indicators. */
  overlay(c: CanvasRenderingContext2D) {
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    const k = R.k
    for (const t of this.texts) {
      const [x, y] = R.toScreen(t.x, t.y)
      const a = clamp(t.life / t.max, 0, 1)
      const pop = 1 + Math.max(0, (t.life - t.max + 0.12) / 0.12) * 0.5
      c.globalAlpha = Math.min(1, a * 2)
      c.font = `800 ${Math.round(t.size * pop * Math.max(0.75, k))}px Rajdhani, "Noto Sans SC", sans-serif`
      c.lineWidth = 3
      c.strokeStyle = 'rgba(0,0,0,0.7)'
      c.strokeText(t.text, x, y)
      c.fillStyle = t.color
      c.fillText(t.text, x, y)
    }
    c.globalAlpha = 1
    // off-screen chest / boss arrows
    const marks: [number, number, RGB][] = []
    if (this.boss) marks.push([this.boss.x, this.boss.y, this.boss.color])
    for (const pk of this.pickups) if (pk.kind === 'chest') marks.push([pk.x, pk.y, COLOR.Y])
    for (const [wx, wy, col] of marks) {
      const [sx, sy] = R.toScreen(wx, wy)
      const m = 40
      if (sx > m && sx < R.cssW - m && sy > m && sy < R.cssH - m) continue
      const cx = R.cssW / 2, cy = R.cssH / 2, a = Math.atan2(sy - cy, sx - cx)
      const ex = clamp(sx, m, R.cssW - m), ey = clamp(sy, m, R.cssH - m)
      c.save()
      c.translate(ex, ey)
      c.rotate(a)
      c.fillStyle = css(col)
      c.shadowColor = css(col)
      c.shadowBlur = 12
      c.beginPath()
      c.moveTo(14, 0)
      c.lineTo(-8, -9)
      c.lineTo(-4, 0)
      c.lineTo(-8, 9)
      c.closePath()
      c.fill()
      c.restore()
    }
  }

  result(): RunResult {
    const p = this.p
    return {
      win: this.win,
      char: p.char.id,
      stage: this.opts.stage.id,
      asc: this.opts.asc,
      endless: this.opts.endless,
      time: this.time,
      kills: this.kills,
      level: p.level,
      lumens: this.lumens,
      elites: this.elites,
      bosses: this.bossKills,
      fusions: this.fusions,
      prismatic: p.prismatic,
      overdrives: this.overdrives,
      chests: this.chests,
      dmgTaken: this.dmgTaken,
      noHitTime: this.noHitBest,
      weapons: p.weapons.map((w) => ({ id: w.def.id, level: w.level, fuse: w.fuse, dmg: w.dmg, kills: w.kills })),
      passives: p.passives.map((q) => ({ id: q.def.id, level: q.level })),
    }
  }

  /** fused color pair helper for UI */
  static fuseColors(f: Fuse): [RGB, RGB] {
    const [a, b] = fuseParts(f)
    return [COLOR[a], COLOR[b]]
  }
}
