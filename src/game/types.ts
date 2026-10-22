import type { RGB } from '../core/math'
import { hex } from '../core/math'
import type { L } from '../core/i18n'
import type { Sfx, Music } from '../core/audio'
import type { World } from './world'

// ───────────────────────────── color language ─────────────────────────────
/** Primary hues of the spectrum. Every weapon & passive belongs to one. */
export type Hue = 'R' | 'G' | 'B'
/** Secondary hues created by fusing two primaries: Y = R+G (Solar), C = G+B (Glacial), M = R+B (Void). */
export type Fuse = 'Y' | 'C' | 'M'

export const COLOR: Record<Hue | Fuse | 'W', RGB> = {
  R: hex('#ff3b5c'),
  G: hex('#3dff8b'),
  B: hex('#3da5ff'),
  Y: hex('#ffd23d'),
  C: hex('#3dfff2'),
  M: hex('#ff4dff'),
  W: [1, 1, 1],
}

export const fuseOf = (a: Hue, b: Hue): Fuse | null =>
  a === b ? null : (({ RG: 'Y', GR: 'Y', GB: 'C', BG: 'C', RB: 'M', BR: 'M' }) as Record<string, Fuse>)[a + b]

export const fuseParts = (f: Fuse): [Hue, Hue] => (f === 'Y' ? ['R', 'G'] : f === 'C' ? ['G', 'B'] : ['R', 'B'])

// ───────────────────────────── player stats ─────────────────────────────
export interface Stats {
  maxHp: number
  regen: number // hp / second
  armor: number // flat damage reduction per hit
  moveSpeed: number // world units / second
  might: number // damage multiplier
  area: number // size multiplier
  cooldown: number // cooldown multiplier (lower = faster)
  projSpeed: number // projectile speed multiplier
  duration: number // effect duration multiplier
  amount: number // extra projectiles / instances
  pierce: number // extra pierce
  magnet: number // pickup radius (world units)
  luck: number // multiplier on rare drops / crit / extra choice chance
  growth: number // xp multiplier
  greed: number // lumen multiplier
  crit: number // crit chance 0..1
  critDmg: number // crit damage multiplier
  revival: number // extra lives
  curse: number // enemy count / hp multiplier (higher = harder, more rewards)
  dashCd: number // seconds
  knockback: number // multiplier
  reroll: number
  banish: number
  skip: number
  choices: number // cards offered on level up
}

export const BASE_STATS = (): Stats => ({
  maxHp: 100,
  regen: 0,
  armor: 0,
  moveSpeed: 200,
  might: 1,
  area: 1,
  cooldown: 1,
  projSpeed: 1,
  duration: 1,
  amount: 0,
  pierce: 0,
  magnet: 80,
  luck: 1,
  growth: 1,
  greed: 1,
  crit: 0.05,
  critDmg: 1.6,
  revival: 0,
  curse: 1,
  dashCd: 2.6,
  knockback: 1,
  reroll: 1,
  banish: 0,
  skip: 1,
  choices: 3,
})

// ───────────────────────────── weapons ─────────────────────────────
export const WEAPON_MAX = 7
export const PASSIVE_MAX = 5
export const WEAPON_SLOTS = 6
export const PASSIVE_SLOTS = 6

/** Raw per-level numbers a weapon defines. Extra custom keys are allowed. */
export interface WeaponLevel {
  dmg: number
  cd: number // seconds between fire() calls
  area: number // size multiplier / base radius — weapon-specific meaning
  speed: number // projectile speed (world units/s) — weapon-specific meaning
  amount: number // projectiles / instances per fire
  duration: number // seconds
  pierce: number // enemies a projectile can hit (Infinity = unlimited)
  [k: string]: number
}

export interface WeaponDef {
  id: string
  hue: Hue
  name: L
  desc: L
  /** SVG markup drawn on a 64×64 viewBox (no <svg> wrapper). Use `currentColor` for the hue tint. */
  icon: string
  /** level-up text for levels 2..WEAPON_MAX (length WEAPON_MAX-1) */
  levels: L[]
  /** raw stats at a level (1..WEAPON_MAX) */
  stats(level: number): WeaponLevel
  /** called every time the cooldown elapses; `s` is the final stat block after player modifiers */
  fire?(wi: WeaponInst, w: World, s: WeaponLevel): void
  /** called every frame (for persistent effects such as auras / orbitals) */
  tick?(wi: WeaponInst, w: World, dt: number, s: WeaponLevel): void
  /** id of an achievement that unlocks this weapon; absent = available from the start */
  unlock?: string
}

export interface WeaponInst {
  def: WeaponDef
  level: number
  fuse: Fuse | null
  cd: number // time until next fire()
  dmg: number // total damage dealt this run
  kills: number
  t: number // time owned
  state: any // free-form per-weapon state (orbitals, turrets, …)
}

// ───────────────────────────── passives ─────────────────────────────
export interface PassiveDef {
  id: string
  hue: Hue
  name: L
  desc: L // one line, e.g. "+8% damage per level"
  icon: string
  apply(s: Stats, level: number): void
  unlock?: string
}

export interface PassiveInst {
  def: PassiveDef
  level: number
}

// ───────────────────────────── enemies ─────────────────────────────
export interface EnemyDef {
  id: string
  name: L
  desc: L
  shape: number // Shape id (core/gl)
  color: RGB
  r: number // collision radius
  hp: number // base hp (scaled by stage & time)
  speed: number
  dmg: number // contact damage
  xp: number
  mass?: number // knockback resistance (default 1, bosses ~ 50)
  boss?: boolean
  /** behaviour; default = chase the player */
  ai?(e: Enemy, w: World, dt: number): void
  /** custom drawing; default = neon outline of `shape` */
  draw?(e: Enemy, w: World): void
  spawn?(e: Enemy, w: World): void
  death?(e: Enemy, w: World): void
  /** boss only: name plate under the HP bar */
  title?: L
  music?: Music
}

export interface Enemy {
  id: number
  def: EnemyDef
  x: number
  y: number
  vx: number
  vy: number
  r: number
  rot: number
  hp: number
  maxHp: number
  speed: number
  dmg: number
  xp: number
  mass: number
  color: RGB
  elite: boolean
  boss: boolean
  t: number // age (s)
  state: number // behaviour scratch
  timer: number // behaviour scratch
  data: any // behaviour scratch (per-def)
  flash: number
  slow: number // remaining slow time
  slowAmt: number // 0..1
  freeze: number // remaining freeze time
  burn: number // remaining burn time
  burnDps: number
  kbx: number
  kby: number
  dead: boolean
  invuln: boolean // ignore damage (e.g. boss phase transitions)
  noSep: boolean // skip crowd separation
  q: number // spatial query stamp (internal)
}

/** Projectile / damage source owned by the player. */
export interface Shot {
  x: number
  y: number
  vx: number
  vy: number
  r: number // collision radius
  dmg: number
  pierce: number // remaining enemy hits (Infinity = never consumed)
  life: number // remaining seconds
  maxLife: number
  hitCd: number // seconds before the same enemy can be hit again (Infinity = once)
  hits: Map<number, number>
  kb: number // knockback impulse
  color: RGB
  shape: number
  w: number // visual half width
  h: number // visual half height
  rot: number
  spin: number
  glow: number
  alpha: number
  src: WeaponInst | null
  fuse: Fuse | null
  homing: number // turn rate (rad/s), 0 = none
  noCollide: boolean // when true collisions are not auto-checked (custom logic)
  dead: boolean
  trail: number // particles per second
  data: any
  update?(s: Shot, w: World, dt: number): void
  onHit?(s: Shot, e: Enemy, w: World): void
  onExpire?(s: Shot, w: World): void
  draw?(s: Shot, w: World): void
}

/** Projectile owned by enemies; hurts the player. */
export interface Bullet {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  dmg: number
  life: number
  t: number
  color: RGB
  shape: number
  rot: number
  dead: boolean
  data: any
  update?(b: Bullet, w: World, dt: number): void
}

/** Telegraphed danger zone. Warns for `delay`, then is lethal for `active` seconds. */
export interface Hazard {
  kind: 'circle' | 'line'
  x: number
  y: number
  r: number // circle radius / line half width
  x2: number
  y2: number
  delay: number
  active: number
  t: number
  dmg: number
  color: RGB
  dead: boolean
  onBoom?(h: Hazard, w: World): void
}

export type PickupKind = 'xp' | 'heal' | 'magnet' | 'bomb' | 'chest' | 'lumen' | 'freeze'
export interface Pickup {
  kind: PickupKind
  x: number
  y: number
  vx: number
  vy: number
  value: number
  t: number
  pull: boolean
  dead: boolean
}

export interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  size: number
  size1: number
  color: RGB
  alpha: number
  shape: number
  rot: number
  spin: number
  drag: number
  glow: number
  stretch: number // >0: elongate along velocity (sparks)
}

export interface FloatText {
  x: number
  y: number
  text: string
  life: number
  max: number
  size: number
  color: string
  vy: number
}

// ───────────────────────────── characters ─────────────────────────────
export interface CharacterDef {
  id: string
  name: L
  title: L // short epithet
  desc: L
  color: RGB
  shape: number // body shape
  weapon: string // starting weapon id
  trait: L // passive trait description
  /** stat modifiers; re-applied on every recalc (level = current player level) */
  mods(s: Stats, level: number): void
  /** optional trait hooks */
  onKill?(w: World, e: Enemy): void
  onLevel?(w: World): void
  tick?(w: World, dt: number): void
  /** achievement id required (absent = unlocked) */
  unlock?: string
  /** alternatively purchasable with lumens */
  cost?: number
}

// ───────────────────────────── stages ─────────────────────────────
export interface Wave {
  from: number // seconds
  to: number
  rate: [number, number] // spawns / second at `from` → at `to`
  pool: [string, number][] // [enemy id, weight]
  cap?: number // max alive enemies while this wave runs
}

export interface StageEvent {
  at: number
  kind: 'ring' | 'swarm' | 'elite' | 'wall' | 'burst' | 'custom'
  enemy?: string
  n?: number
  run?(w: World): void
}

export interface StageDef {
  id: string
  order: number
  name: L
  desc: L
  palette: { c0: RGB; c1: RGB; c2: RGB; grid: RGB }
  bgStyle: number // 0 square grid, 1 hex grid, 2 dots, 3 polar
  gridA: number
  music: Music
  duration: number // seconds until the boss appears
  hp: number // enemy hp multiplier
  dmg: number // enemy damage multiplier
  waves: Wave[]
  events: StageEvent[]
  boss: string // enemy def id
  unlockAfter?: string // stage id that must be cleared first
}

// ───────────────────────────── meta ─────────────────────────────
export interface RunResult {
  win: boolean
  char: string
  stage: string
  asc: number
  endless: boolean
  time: number
  kills: number
  level: number
  lumens: number
  elites: number
  bosses: number
  fusions: number
  prismatic: boolean
  overdrives: number
  chests: number
  dmgTaken: number
  noHitTime: number // longest stretch without taking damage
  weapons: { id: string; level: number; fuse: Fuse | null; dmg: number; kills: number }[]
  passives: { id: string; level: number }[]
}

export interface AchievementDef {
  id: string // also the Steam API name
  name: L
  desc: L
  hidden?: boolean
  /** evaluated at the end of every run (run is set) and periodically during runs (w is set) */
  check(c: { run?: RunResult; w?: World; save: import('../core/save').SaveData }): boolean
  reward?: { char?: string; weapon?: string; lumens?: number }
}

export interface ShopDef {
  id: string
  name: L
  desc: L // per level, e.g. "+5% damage"
  icon: string
  max: number
  cost: number // base cost; price = cost * (level+1)
  apply(s: Stats, level: number): void
}

export interface AscensionDef {
  level: number
  name: L
  desc: L
  apply(m: { hp: number; dmg: number; speed: number; rate: number; lumens: number; bulletSpeed: number; heal: number }): void
}

export type { Sfx, Music }
