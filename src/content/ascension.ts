import { l, type L } from '../core/i18n'
import type { AscensionDef } from '../game/types'

type Mods = Parameters<AscensionDef['apply']>[0]

/** every level also pays +10% Lumens (additive: Ascension 10 = ×2) */
const asc = (level: number, name: L, desc: L, f: (m: Mods) => void): AscensionDef => ({
  level, name,
  desc: l(`${desc.en} +10% Lumens.`, `${desc.zh}流明 +10%。`),
  apply: (m) => {
    f(m)
    m.lumens += 0.1
  },
})

/**
 * Ascension (difficulty) levels, cumulative like Heat: Ascension N applies levels 1..N. Clearing a stage at N unlocks N+1 there.
 * Totals at 10: enemy HP ×1.98, damage ×1.5, speed ×1.17, spawns ×1.39, bullet speed ×1.27, healing ×0.6, Lumens ×2.
 */
export const ASCENSIONS: AscensionDef[] = [
  asc(1, l('Dimmer Stars', '星光黯淡'), l('Enemies have +20% HP.', '敌人生命 +20%。'), (m) => void (m.hp *= 1.2)),
  asc(2, l('Blueshift', '蓝移'), l('Enemies close in 8% faster.', '敌人移动速度 +8%。'), (m) => void (m.speed *= 1.08)),
  asc(3, l('Red Shift', '红移'), l('Enemies deal +20% damage.', '敌人伤害 +20%。'), (m) => void (m.dmg *= 1.2)),
  asc(4, l('Dense Nebula', '浓密星云'), l('15% more enemies spawn.', '敌人生成数量 +15%。'), (m) => void (m.rate *= 1.15)),
  asc(5, l('Cold Light', '冷光'), l('Healing -25% (regeneration unaffected).', '治疗效果 -25%（生命回复不受影响）。'), (m) => void (m.heal *= 0.75)),
  asc(6, l('Hard Light', '硬光'), l('Enemy projectiles fly 15% faster. Enemies have +10% HP.', '敌方弹幕速度 +15%，敌人生命 +10%。'), (m) => {
    m.bulletSpeed *= 1.15
    m.hp *= 1.1
  }),
  asc(7, l('Gravity Well', '引力井'), l('Enemies move 8% faster and 10% more spawn.', '敌人移动速度 +8%，生成数量 +10%。'), (m) => {
    m.speed *= 1.08
    m.rate *= 1.1
  }),
  asc(8, l('Burning Dark', '灼暗'), l('Enemies deal +25% damage.', '敌人伤害 +25%。'), (m) => void (m.dmg *= 1.25)),
  asc(9, l('Entropy', '熵增'), l('Enemies have +25% HP. Healing reduced by a further 20%.', '敌人生命 +25%，治疗效果再 -20%。'), (m) => {
    m.hp *= 1.25
    m.heal *= 0.8
  }),
  asc(10, l('Heat Death', '热寂'), l('The last light. Enemies have +20% HP, 10% more spawn, 10% faster projectiles.', '最后的光。敌人生命 +20%，生成 +10%，弹幕速度 +10%。'), (m) => {
    m.hp *= 1.2
    m.rate *= 1.1
    m.bulletSpeed *= 1.1
  }),
]
