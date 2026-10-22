import type { WeaponDef, EnemyDef, StageDef } from './types'
import { PASSIVES } from '../content/passives'
import { CHARACTERS } from '../content/characters'
import { ACHIEVEMENTS } from '../content/achievements'
import { SHOP } from '../content/shop'
import { ASCENSIONS } from '../content/ascension'

/** Content modules export `default` either a single def or an array of defs. */
const collect = <T>(mods: Record<string, unknown>): T[] =>
  Object.keys(mods)
    .sort()
    .flatMap((k) => {
      const d = (mods[k] as { default?: T | T[] }).default
      return d === undefined ? [] : Array.isArray(d) ? d : [d]
    })

const HUE_ORDER = { R: 0, G: 1, B: 2 }

export const WEAPONS = collect<WeaponDef>(import.meta.glob('../content/weapons/*.ts', { eager: true })).sort((a, b) => HUE_ORDER[a.hue] - HUE_ORDER[b.hue])
export const ENEMIES = collect<EnemyDef>(import.meta.glob(['../content/enemies/*.ts', '../content/bosses/*.ts'], { eager: true }))
export const STAGES = collect<StageDef>(import.meta.glob('../content/stages/*.ts', { eager: true })).sort((a, b) => a.order - b.order)
export { PASSIVES, CHARACTERS, ACHIEVEMENTS, SHOP, ASCENSIONS }

const index = <T extends { id: string }>(arr: T[]) => new Map(arr.map((x) => [x.id, x]))
export const weaponById = index(WEAPONS)
export const enemyById = index(ENEMIES)
export const stageById = index(STAGES)
export const passiveById = index(PASSIVES)
export const charById = index(CHARACTERS)
