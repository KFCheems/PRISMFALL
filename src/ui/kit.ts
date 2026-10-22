import { l, loc, type L } from '../core/i18n'
import { Shape } from '../core/gl'
import { css } from '../core/math'
import { save, type SaveData } from '../core/save'
import type { Action } from '../core/input'
import { BASE_STATS, COLOR, PASSIVE_MAX, WEAPON_MAX, fuseParts } from '../game/types'
import type { AchievementDef, Fuse, Hue, PassiveDef, PassiveInst, Stats, WeaponDef, WeaponInst, WeaponLevel } from '../game/types'
import { ACHIEVEMENTS, charById, weaponById } from '../game/registry'
import { FUSE_NAME } from '../game/upgrades'
import { svgIcon } from './ui'

export type AnyHue = Hue | Fuse | 'W'
export const hueCss = (h: AnyHue) => css(COLOR[h])

export const HUE_NAME: Record<AnyHue, L> = { R: l('Crimson', '绯红'), G: l('Verdant', '翠绿'), B: l('Azure', '湛蓝'), ...FUSE_NAME, W: l('Prismatic', '棱彩') }

// ───────────────────────────── per-viewer UI memory ─────────────────────────────
export interface Memo {
  char?: string
  stage?: string
  asc?: Record<string, number>
  endless?: boolean
  tips?: number // runs that showed the tutorial hints
  best?: Record<string, number> // stage id → longest survival (s)
}
/** UI preferences stored alongside the save (extra key on SaveData) */
export const memo = (): Memo => ((save.data as SaveData & { ui?: Memo }).ui ??= {})

// ───────────────────────────── button glyphs ─────────────────────────────
export type Prompt = Action | 'move' | 'nav' | 'num'
const KEY: Record<Prompt, string> = {
  up: '↑', down: '↓', left: '←', right: '→', confirm: 'Enter', back: 'Esc', pause: 'Esc', dash: 'Space', overdrive: 'Q',
  reroll: 'R', banish: 'X', skip: 'F', tabL: 'Q', tabR: 'E', move: 'WASD', nav: '↑↓←→', num: '1–4',
}
const PAD: Record<Prompt, [string, string]> = {
  up: ['✛', 'sys'], down: ['✛', 'sys'], left: ['✛', 'sys'], right: ['✛', 'sys'], confirm: ['A', 'a'], back: ['B', 'b'], pause: ['☰', 'sys'],
  dash: ['A', 'a'], overdrive: ['Y', 'y'], reroll: ['X', 'x'], banish: ['Y', 'y'], skip: ['⧉', 'sys'], tabL: ['LB', 'sh'], tabR: ['RB', 'sh'],
  move: ['L', 'stk'], nav: ['✛', 'sys'], num: ['', 'none'],
}
/** key / gamepad button glyph; CSS shows the right one via body.pad */
export const glyph = (a: Prompt) => `<span class="glyph"><kbd>${KEY[a]}</kbd><i class="pb ${PAD[a][1]}">${PAD[a][0]}</i></span>`

/** footer bar of clickable button prompts */
export const prompts = (items: [Prompt, L][]) =>
  `<div class="prompts">${items.map(([a, t]) => `<span class="prompt" data-prompt="${a}">${glyph(a)}<span>${loc(t)}</span></span>`).join('')}</div>`

export const T = {
  select: l('Select', '选择'),
  back: l('Back', '返回'),
  confirm: l('Confirm', '确认'),
  cancel: l('Cancel', '取消'),
  tabs: l('Switch tab', '切换标签'),
  adjust: l('Adjust', '调整'),
  locked: l('Locked', '未解锁'),
  unknown: l('Undiscovered', '未发现'),
}

// ───────────────────────────── shapes as SVG ─────────────────────────────
const pts = (n: number, r: number, rot = 0, inner = 0) =>
  Array.from({ length: inner ? n * 2 : n }, (_, i) => {
    const k = inner ? n * 2 : n, a = rot + (i / k) * Math.PI * 2, rr = inner && i % 2 ? inner : r
    return `${(Math.cos(a) * rr).toFixed(1)},${(Math.sin(a) * rr).toFixed(1)}`
  }).join(' ')

const UP = -Math.PI / 2

function shapeEl(shape: number, r: number) {
  switch (shape) {
    case Shape.Tri:
      return `<polygon points="${pts(3, r * 1.2, UP)}" transform="translate(0 ${r * 0.18})"/>`
    case Shape.Box:
      return `<rect x="${-r * 0.82}" y="${-r * 0.82}" width="${r * 1.64}" height="${r * 1.64}" rx="${r * 0.18}"/>`
    case Shape.Diamond:
      return `<polygon points="0,${-r * 1.1} ${r * 0.85},0 0,${r * 1.1} ${-r * 0.85},0"/>`
    case Shape.Hex:
      return `<polygon points="${pts(6, r * 1.05)}"/>`
    case Shape.Star:
      return `<polygon points="${pts(5, r * 1.15, UP, r * 0.5)}"/>`
    case Shape.Cross: {
      const a = r * 0.32
      return `<path d="M${-a} ${-r}h${a * 2}v${r - a}h${r - a}v${a * 2}h${a - r}v${r - a}h${-a * 2}v${a - r}h${a - r}v${-a * 2}h${r - a}z"/>`
    }
    case Shape.Pent:
      return `<polygon points="${pts(5, r * 1.05, UP)}"/>`
    case Shape.Oct:
      return `<polygon points="${pts(8, r * 1.02, Math.PI / 8)}"/>`
    case Shape.Heart:
      return `<path d="M0 ${r * 0.9}C${-r * 1.3} 0 ${-r * 0.9} ${-r * 1.1} 0 ${-r * 0.45}C${r * 0.9} ${-r * 1.1} ${r * 1.3} 0 0 ${r * 0.9}z"/>`
    case Shape.Capsule:
      return `<rect x="${-r}" y="${-r * 0.45}" width="${r * 2}" height="${r * 0.9}" rx="${r * 0.45}"/>`
    default:
      return `<circle r="${r}"/>`
  }
}

/** neon portrait of an SDF shape: dark body, glowing outline, white core (matches the in-game look) */
export const shapeSvg = (shape: number, color: string, cls = 'shape', core = true) =>
  `<svg class="${cls}" viewBox="-50 -50 100 100" style="--c:${color}"><g class="sh-body">${shapeEl(shape, 30)}</g>${core ? `<g class="sh-core">${shapeEl(shape, 11)}</g>` : ''}</svg>`

export const LUMEN = `<svg class="lumen" viewBox="0 0 64 64"><path d="M32 4l7.5 20.5L60 26 43.5 39.5 49 60 32 48 15 60l5.5-20.5L4 26l20.5-1.5z"/></svg>`
export const LOCK = `<svg class="lock" viewBox="0 0 64 64"><rect x="14" y="28" width="36" height="28" rx="4" fill="currentColor"/><path d="M22 28v-8a10 10 0 0 1 20 0v8" fill="none" stroke="currentColor" stroke-width="6"/></svg>`
export const QMARK = '<text x="32" y="45" text-anchor="middle" font-size="40" font-weight="700" fill="currentColor" font-family="Orbitron, sans-serif">?</text>'

export const lumens = (n: number | string, cls = '') => `<span class="lm-amt ${cls}">${LUMEN}<b>${n}</b></span>`

// ───────────────────────────── build slots ─────────────────────────────
export const pips = (lv: number, max: number, hi = 0) =>
  `<span class="pips">${Array.from({ length: max }, (_, i) => `<i class="${i < lv ? (hi && i === lv - 1 ? 'n' : 'f') : ''}"></i>`).join('')}</span>`

const fuseVars = (f: Fuse | null) => (f ? `;--c1:${hueCss(fuseParts(f)[0])};--c2:${hueCss(fuseParts(f)[1])}` : '')

export function weaponSlot(wi: WeaponInst, cls = '') {
  const c = hueCss(wi.fuse ?? wi.def.hue)
  return `<div class="slot ${cls} ${wi.fuse ? 'fused' : ''} ${wi.level >= WEAPON_MAX ? 'max' : ''}" style="--c:${c}${fuseVars(wi.fuse)}">${svgIcon(wi.def.icon, c)}${pips(wi.level, WEAPON_MAX)}</div>`
}

export function passiveSlot(pi: PassiveInst) {
  const c = hueCss(pi.def.hue)
  return `<div class="slot ${pi.level >= PASSIVE_MAX ? 'max' : ''}" style="--c:${c}">${svgIcon(pi.def.icon, c)}${pips(pi.level, PASSIVE_MAX)}</div>`
}

export const emptySlots = (n: number) => '<div class="slot empty"></div>'.repeat(Math.max(0, n))

export const fusedName = (def: WeaponDef, fuse: Fuse | null) => (fuse ? `${loc(FUSE_NAME[fuse])} ${loc(def.name)}` : loc(def.name))

// ───────────────────────────── resonance ─────────────────────────────
export const RESONANCE: Record<Hue, { short: [L, L]; long: [L, L] }> = {
  R: {
    short: [l('+15% Might', '力量 +15%'), l('Kills may explode', '击杀可能爆炸')],
    long: [l('+15% Might', '力量 +15%'), l('Kills have an 18% chance to explode', '击杀有 18% 几率引发爆炸')],
  },
  G: {
    short: [l('+1 Regen · +10% Area', '回复 +1 · 范围 +10%'), l('Healing pulse', '治愈脉冲')],
    long: [l('+1 HP/s regen, +10% area', '每秒回复 +1，范围 +10%'), l('Healing pulse every 12 s that also blasts nearby foes', '每 12 秒释放治愈脉冲，同时冲击周围敌人')],
  },
  B: {
    short: [l('−10% CD · +15% Speed', '冷却 −10% · 弹速 +15%'), l('+1 Projectile', '弹体 +1')],
    long: [l('−10% cooldown, +15% projectile speed', '冷却 −10%，弹速 +15%'), l('+1 projectile for every weapon', '所有武器弹体 +1')],
  },
}

// ───────────────────────────── stats ─────────────────────────────
/** pct: % relative to base · int: like pct but shown as a whole number · pts: percentage points · flat · sec */
type Kind = 'pct' | 'int' | 'pts' | 'flat' | 'sec'
export const STATS: [keyof Stats, L, Kind][] = [
  ['maxHp', l('Max HP', '最大生命'), 'int'],
  ['regen', l('Regen', '生命回复'), 'flat'],
  ['armor', l('Armor', '护甲'), 'flat'],
  ['moveSpeed', l('Move Speed', '移动速度'), 'int'],
  ['might', l('Might', '力量'), 'pct'],
  ['area', l('Area', '范围'), 'pct'],
  ['cooldown', l('Cooldown', '冷却'), 'pct'],
  ['projSpeed', l('Proj. Speed', '弹速'), 'pct'],
  ['duration', l('Duration', '持续时间'), 'pct'],
  ['amount', l('Amount', '弹体数量'), 'flat'],
  ['pierce', l('Pierce', '贯穿'), 'flat'],
  ['crit', l('Crit Chance', '暴击率'), 'pts'],
  ['critDmg', l('Crit Damage', '暴击伤害'), 'pts'],
  ['knockback', l('Knockback', '击退'), 'pct'],
  ['magnet', l('Magnet', '拾取范围'), 'int'],
  ['luck', l('Luck', '幸运'), 'pct'],
  ['growth', l('Growth', '成长'), 'pct'],
  ['greed', l('Greed', '贪婪'), 'pct'],
  ['curse', l('Curse', '诅咒'), 'pct'],
  ['dashCd', l('Dash Cooldown', '冲刺冷却'), 'sec'],
  ['revival', l('Revival', '复活'), 'flat'],
  ['reroll', l('Reroll', '重抽'), 'flat'],
  ['banish', l('Banish', '放逐'), 'flat'],
  ['skip', l('Skip', '跳过'), 'flat'],
  ['choices', l('Choices', '选项数'), 'flat'],
]
const LOWER_BETTER = new Set<keyof Stats>(['cooldown', 'dashCd', 'curse'])
const BASE = BASE_STATS()

const num = (v: number) => (Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1))
const signed = (v: number, unit = '') => (v >= 0 ? '+' : '−') + num(Math.abs(v)) + unit

/** absolute value for the stats sheet */
export function statValue(k: keyof Stats, v: number, kind: Kind) {
  if (kind === 'pct' || kind === 'pts') return `${Math.round(v * 100)}%`
  if (kind === 'sec') return `${v.toFixed(2)}s`
  return k === 'regen' ? `${v.toFixed(1)}/s` : num(v)
}

/** change relative to the base value, e.g. "+16%" */
export function statDelta(k: keyof Stats, v: number, kind: Kind) {
  const b = BASE[k]
  if (kind === 'pct' || kind === 'int') return signed(((v / b) - 1) * 100, '%')
  if (kind === 'pts') return signed((v - b) * 100, '%')
  if (kind === 'sec') return signed(v - b, 's')
  return signed(v - b, k === 'regen' ? '/s' : '')
}

/** -1 worse than base, 0 equal, 1 better */
export function statTrend(k: keyof Stats, v: number) {
  const d = v - BASE[k]
  if (Math.abs(d) < 1e-6) return 0
  return (d > 0) !== LOWER_BETTER.has(k) ? 1 : -1
}

/** stats that differ between two stat blocks */
export const statDiff = (a: Stats, b: Stats) => STATS.filter(([k]) => Math.abs(a[k] - b[k]) > 1e-6)

const applied = (f: (s: Stats) => void) => {
  const s = BASE_STATS()
  f(s)
  return s
}

/** "Might +8% → +16%" lines for taking a passive to `lv` */
export function passiveDelta(d: PassiveDef, lv: number) {
  const a = applied((s) => lv > 1 && d.apply(s, lv - 1)), b = applied((s) => d.apply(s, lv))
  return statDiff(a, b).map(([k, name, kind]) => [loc(name), lv > 1 ? `${statDelta(k, a[k], kind)} → ${statDelta(k, b[k], kind)}` : statDelta(k, b[k], kind)] as [string, string])
}

/** chips summarising a character's stat changes */
export const charChips = (mods: (s: Stats, lv: number) => void) => {
  const s = applied((x) => mods(x, 1))
  return statDiff(BASE, s).map(([k, name, kind]) => `<span class="chip ${statTrend(k, s[k]) > 0 ? 'good' : 'bad'}">${loc(name)} ${statDelta(k, s[k], kind)}</span>`).join('')
}

const W_STATS: [keyof WeaponLevel, L, (v: number) => string][] = [
  ['dmg', l('Damage', '伤害'), (v) => num(v)],
  ['cd', l('Cooldown', '冷却'), (v) => `${v.toFixed(2)}s`],
  ['amount', l('Amount', '数量'), (v) => num(v)],
  ['pierce', l('Pierce', '贯穿'), (v) => (v === Infinity ? '∞' : num(v))],
  ['area', l('Area', '范围'), (v) => `${Math.round(v * 100)}%`],
  ['duration', l('Duration', '持续'), (v) => `${num(v)}s`],
  ['speed', l('Speed', '速度'), (v) => num(v)],
]

/** "Damage 11 → 15" lines between two weapon levels (or the key stats of a new weapon) */
export function weaponDelta(d: WeaponDef, lv: number, limit = 3): [string, string][] {
  const b = d.stats(lv)
  if (lv <= 1) return W_STATS.slice(0, limit).map(([k, n, f]) => [loc(n), f(b[k])])
  const a = d.stats(lv - 1)
  return W_STATS.filter(([k]) => a[k] !== b[k]).slice(0, limit).map(([k, n, f]) => [loc(n), `${f(a[k])} → ${f(b[k])}`])
}

export const deltaList = (rows: [string, string][]) => (rows.length ? `<ul class="delta">${rows.map(([k, v]) => `<li><span>${k}</span><b>${v}</b></li>`).join('')}</ul>` : '')

// ───────────────────────────── achievements ─────────────────────────────
/** achievements may optionally expose numeric progress */
export type Ach = AchievementDef & { progress?: (s: SaveData) => [number, number] }
const KNOWN: Record<string, (s: SaveData) => [number, number]> = {
  kills_10k: (s) => [s.stats.kills, 10000],
}
export const achProgress = (a: Ach) => (a.progress ?? KNOWN[a.id])?.(save.data)
export const achById = (id: string) => ACHIEVEMENTS.find((a) => a.id === id) as Ach | undefined
export const achDone = (id: string) => save.data.achievements.includes(id)

export function rewardText(a: AchievementDef) {
  const r = a.reward
  if (!r) return ''
  const out: string[] = []
  if (r.char) out.push(loc(l('Character: {n}', '角色：{n}'), { n: loc(charById.get(r.char)?.name ?? r.char) }))
  if (r.weapon) out.push(loc(l('Weapon: {n}', '武器：{n}'), { n: loc(weaponById.get(r.weapon)?.name ?? r.weapon) }))
  if (r.lumens) out.push(`+${r.lumens} ${loc(l('Lumens', '流明'))}`)
  return out.join(' · ')
}
