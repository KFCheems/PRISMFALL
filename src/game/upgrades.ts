import { chance, shuffle, weighted } from '../core/math'
import { loc, type L } from '../core/i18n'
import { save } from '../core/save'
import { COLOR, PASSIVE_MAX, PASSIVE_SLOTS, WEAPON_MAX, WEAPON_SLOTS, fuseOf } from './types'
import type { Fuse, Hue, PassiveDef, WeaponDef, WeaponInst } from './types'
import { PASSIVES, WEAPONS, weaponById } from './registry'
import type { World, ChestReward } from './world'

export const FUSE_NAME: Record<Fuse, L> = {
  Y: { en: 'Solar', zh: '日耀' },
  C: { en: 'Glacial', zh: '冰晶' },
  M: { en: 'Void', zh: '虚空' },
}

export const FUSE_DESC: Record<Fuse, L> = {
  Y: { en: 'Hits burn and may arc lightning to 3 nearby foes.', zh: '命中造成灼烧，并可能向附近 3 个敌人释放连锁闪电。' },
  C: { en: 'Hits chill and may freeze. Frozen foes take +25% damage and shatter into shards.', zh: '命中减速并可能冻结。冻结的敌人受到伤害 +25%，死亡时碎裂成冰片。' },
  M: { en: 'Projectiles seek targets. Kills may open a crushing singularity. Hits may restore HP.', zh: '弹体追踪目标。击杀可能生成吞噬奇点。命中可能回复生命。' },
}

export const weaponName = (wi: WeaponInst) => (wi.fuse ? `${loc(FUSE_NAME[wi.fuse])} ${loc(wi.def.name)}` : loc(wi.def.name))

export function makeWeapon(id: string): WeaponInst {
  const def = weaponById.get(id)!
  return { def, level: 1, fuse: null, cd: 0.3, dmg: 0, kills: 0, t: 0, state: {} }
}

/** An item is available when it has no gate, its achievement is earned, or it was granted a direct unlock (Forge/achievement reward). */
export const isUnlocked = (d: { id?: string; unlock?: string }) =>
  !d.unlock || save.data.achievements.includes(d.unlock) || (!!d.id && save.data.weapons.includes(d.id))

export interface Choice {
  kind: 'weapon' | 'passive' | 'fusion' | 'lumens' | 'heal'
  id: string
  level: number // level after taking it
  name: string
  desc: string
  hue: Hue | Fuse | 'W'
  icon: string
  isNew: boolean
  a?: WeaponInst
  b?: WeaponInst
}

/** pairs of max-level, unfused weapons of different hues (a = dominant: more damage dealt) */
export function fusionPairs(w: World): [WeaponInst, WeaponInst][] {
  const ready = w.p.weapons.filter((x) => x.level >= WEAPON_MAX && !x.fuse)
  const out: [WeaponInst, WeaponInst][] = []
  for (let i = 0; i < ready.length; i++)
    for (let j = i + 1; j < ready.length; j++) {
      const a = ready[i], b = ready[j]
      if (a.def.hue === b.def.hue) continue
      out.push(a.dmg >= b.dmg ? [a, b] : [b, a])
    }
  return out
}

const fusionChoice = ([a, b]: [WeaponInst, WeaponInst]): Choice => {
  const f = fuseOf(a.def.hue, b.def.hue)!
  return {
    kind: 'fusion', id: 'fuse:' + a.def.id + '+' + b.def.id, level: a.level,
    name: `${loc(FUSE_NAME[f])} ${loc(a.def.name)}`,
    desc: loc({ en: 'Fuse {a} with {b}. ', zh: '将{a}与{b}融合。' }, { a: loc(a.def.name), b: loc(b.def.name) }) + loc(FUSE_DESC[f]),
    hue: f, icon: a.def.icon, isNew: true, a, b,
  }
}

const weaponChoice = (d: WeaponDef, cur?: WeaponInst): Choice => ({
  kind: 'weapon', id: d.id, level: (cur?.level ?? 0) + 1, name: cur ? weaponName(cur) : loc(d.name),
  desc: cur ? loc(d.levels[cur.level - 1]) : loc(d.desc), hue: cur?.fuse ?? d.hue, icon: d.icon, isNew: !cur,
})

const passiveChoice = (d: PassiveDef, lv: number): Choice => ({
  kind: 'passive', id: d.id, level: lv + 1, name: loc(d.name), desc: loc(d.desc), hue: d.hue, icon: d.icon, isNew: lv === 0,
})

const FILLERS = (): Choice[] => [
  { kind: 'lumens', id: 'lumens', level: 0, name: loc({ en: 'Lumen Cache', zh: '流明储藏' }), desc: loc({ en: '+25 Lumens', zh: '+25 流明' }), hue: 'Y', icon: '<path d="M32 6l7 18 19 1-15 12 5 19-16-11-16 11 5-19L6 25l19-1z" fill="currentColor"/>', isNew: false },
  { kind: 'heal', id: 'heal', level: 0, name: loc({ en: 'Lightwell', zh: '光之泉' }), desc: loc({ en: 'Restore 30% HP', zh: '回复 30% 生命' }), hue: 'G', icon: '<path d="M32 54C10 38 6 28 12 18c6-9 16-7 20 2 4-9 14-11 20-2 6 10 2 20-20 36z" fill="currentColor"/>', isNew: false },
]

export function rollChoices(w: World, n = w.p.stats.choices + (chance((w.p.stats.luck - 1) * 0.6) ? 1 : 0)): Choice[] {
  const p = w.p
  const pool: { c: Choice; wt: number }[] = []
  // Upgrading what you already own is the strong play, and the offers must reflect that: a run that keeps
  // being handed brand-new level-1 weapons spreads itself thin and dies. Existing items outrank new ones by
  // a wide margin, and a weapon already at a high level is even more attractive.
  for (const wi of p.weapons) if (wi.level < WEAPON_MAX) pool.push({ c: weaponChoice(wi.def, wi), wt: 6 + wi.level })
  if (p.weapons.length < WEAPON_SLOTS)
    for (const d of WEAPONS)
      if (isUnlocked(d) && !p.banished.has(d.id) && !p.weapons.some((x) => x.def.id === d.id)) pool.push({ c: weaponChoice(d), wt: 1.2 })
  for (const pi of p.passives) if (pi.level < PASSIVE_MAX) pool.push({ c: passiveChoice(pi.def, pi.level), wt: 4 + pi.level })
  if (p.passives.length < PASSIVE_SLOTS)
    for (const d of PASSIVES)
      if (isUnlocked(d) && !p.banished.has(d.id) && !p.passives.some((x) => x.def.id === d.id)) pool.push({ c: passiveChoice(d, 0), wt: 1.1 })

  const out: Choice[] = []
  const fusions = fusionPairs(w)
  if (fusions.length) out.push(fusionChoice(fusions[Math.floor(Math.random() * fusions.length)]))
  while (out.length < n && pool.length) {
    const it = weighted(pool, (x) => x.wt)!
    pool.splice(pool.indexOf(it), 1)
    out.push(it.c)
  }
  const fill = FILLERS()
  while (out.length < Math.min(n, 2) && fill.length) out.push(fill.shift()!)
  return out
}

export function applyChoice(w: World, c: Choice) {
  const p = w.p
  switch (c.kind) {
    case 'weapon': {
      const cur = p.weapons.find((x) => x.def.id === c.id)
      if (cur) cur.level++
      else p.weapons.push(makeWeapon(c.id))
      save.see(c.id)
      break
    }
    case 'passive': {
      const cur = p.passives.find((x) => x.def.id === c.id)
      if (cur) cur.level++
      else p.passives.push({ def: PASSIVES.find((d) => d.id === c.id)!, level: 1 })
      save.see(c.id)
      break
    }
    case 'fusion': {
      const a = c.a!, b = c.b!
      a.fuse = fuseOf(a.def.hue, b.def.hue)
      a.dmg += b.dmg
      a.kills += b.kills
      b.def.tick && b.state.cleanup?.(w)
      p.weapons.splice(p.weapons.indexOf(b), 1)
      w.fusions++
      w.sfx('fusion')
      w.flash(COLOR[a.fuse!], 0.35)
      w.ringFx(p.x, p.y, 220, COLOR[a.fuse!])
      w.hooks.banner(loc({ en: 'SPECTRAL FUSION', zh: '光谱融合' }), weaponName(a), COLOR[a.fuse!])
      if (p.prismatic) {
        w.hooks.banner(loc({ en: 'PRISMATIC RESONANCE', zh: '棱彩共鸣' }), loc({ en: 'All light is one.', zh: '万光归一。' }), COLOR.W)
        save.data.stats.prismatic++
      }
      break
    }
    case 'lumens':
      w.lumens += 25
      break
    case 'heal':
      w.heal(p.stats.maxHp * 0.3)
      break
  }
  p.recalc()
}

/** Chest: applies `tier` upgrades immediately and returns what happened for the reveal screen. */
export function rollChest(w: World, tier: number): ChestReward[] {
  const p = w.p
  const out: ChestReward[] = []
  const n = tier >= 3 ? (chance(0.25 * p.stats.luck) ? 5 : 3) : chance(0.08 * p.stats.luck) ? 3 : 1
  for (let i = 0; i < n; i++) {
    const fusions = fusionPairs(w)
    if (fusions.length) {
      const c = fusionChoice(fusions[0])
      applyChoice(w, c)
      out.push({ kind: 'fusion', label: c.name, color: COLOR[c.hue as Fuse] })
      continue
    }
    const owned = shuffle([...p.weapons.filter((x) => x.level < WEAPON_MAX), ...p.passives.filter((x) => x.level < PASSIVE_MAX)])
    const it = owned[0]
    if (it) {
      it.level++
      const name = 'fuse' in it ? weaponName(it) : loc(it.def.name)
      out.push({ kind: 'level', label: `${name} · Lv ${it.level}`, color: COLOR[('fuse' in it && it.fuse) || it.def.hue] })
      p.recalc()
    } else if (chance(0.5)) {
      w.lumens += 30
      out.push({ kind: 'lumens', label: loc({ en: '+30 Lumens', zh: '+30 流明' }), color: COLOR.Y })
    } else {
      w.heal(p.stats.maxHp * 0.25, true)
      out.push({ kind: 'heal', label: loc({ en: 'Restored 25% HP', zh: '回复 25% 生命' }), color: COLOR.G })
    }
  }
  return out
}

