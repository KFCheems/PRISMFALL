import { l } from '../core/i18n'
import { Shape } from '../core/gl'
import { chance, hex } from '../core/math'
import type { CharacterDef } from '../game/types'

/**
 * Six playable lights. Starters are all-rounders; bought/unlocked ones trade raw safety for a sharper identity.
 * `mods` is re-applied on every recalc, so level-scaling traits read `level`.
 */
export const CHARACTERS: CharacterDef[] = [
  {
    id: 'vex', name: l('Vex', '维克丝'), title: l('the Wayfarer', '远行者'),
    desc: l('A courier of light who never stops moving.', '永不停歇的光之信使。'),
    color: hex('#7fe7ff'), shape: Shape.Diamond, weapon: 'pulse_bolt',
    trait: l('+10% move speed, +10% projectile speed. +1 projectile at levels 20 and 40.', '移动速度 +10%，弹速 +10%。第 20、40 级时弹体 +1。'),
    mods: (s, level) => {
      s.moveSpeed *= 1.1
      s.projSpeed *= 1.1
      s.amount += Math.min(2, Math.floor(level / 20))
    },
  },
  {
    id: 'ember', name: l('Ember', '余烬'), title: l('the Kindled', '燃火者'),
    desc: l('Burns twice as bright, and half as long.', '燃烧得加倍明亮，却只有一半长久。'),
    color: hex('#ff6a4d'), shape: Shape.Tri, weapon: 'flame_arc',
    trait: l('+25% damage, -20% max HP. Every kill has a 3% chance to restore 2 HP.', '伤害 +25%，最大生命 -20%。每次击杀有 3% 几率回复 2 生命。'),
    mods: (s) => {
      s.might *= 1.25
      s.maxHp *= 0.8
    },
    onKill: (w) => {
      if (chance(0.03)) w.heal(2, true)
    },
  },
  {
    id: 'moss', name: l('Moss', '苔'), title: l('the Rooted', '扎根者'),
    desc: l('Patient as a forest. Twice as stubborn.', '如森林般耐心，比森林更固执。'),
    color: hex('#7dff9a'), shape: Shape.Hex, weapon: 'spore_field', cost: 400,
    trait: l('+30% max HP, +0.6 HP/s regen, +10% area, -8% move speed.', '最大生命 +30%，每秒回复 +0.6，范围 +10%，移动速度 -8%。'),
    mods: (s) => {
      s.maxHp *= 1.3
      s.regen += 0.6
      s.area *= 1.1
      s.moveSpeed *= 0.92
    },
  },
  {
    id: 'quill', name: l('Quill', '翎'), title: l('the Needle', '针芒'),
    desc: l('Every beam finds the weak point.', '每一道光都能找到弱点。'),
    color: hex('#a98bff'), shape: Shape.Star, weapon: 'prism_lance', cost: 900,
    trait: l('+10% crit chance, +50% crit damage. Every 5 levels: +2% crit chance.', '暴击率 +10%，暴击伤害 +50%。每 5 级：暴击率 +2%。'),
    mods: (s, level) => {
      s.crit += 0.1 + 0.02 * Math.floor(level / 5)
      s.critDmg += 0.5
    },
  },
  {
    id: 'halo', name: l('Halo', '光环'), title: l('the Orbiting', '环行者'),
    desc: l('A small star with many moons.', '一颗拥有众多卫星的小星。'),
    color: hex('#ffd36b'), shape: Shape.Circle, weapon: 'blade_ring', unlock: 'clear_shallows',
    trait: l('+15% area, +15% duration, -8% cooldown.', '范围 +15%，持续时间 +15%，冷却 -8%。'),
    mods: (s) => {
      s.area *= 1.15
      s.duration *= 1.15
      s.cooldown *= 0.92
    },
  },
  {
    id: 'null', name: l('Null', '虚无'), title: l('the Hollow', '空洞者'),
    desc: l('What remains when the light is gone.', '光散尽后残留之物。'),
    color: hex('#e0e0ff'), shape: Shape.Oct, weapon: 'arc_drone', unlock: 'clear_singularity',
    trait: l('Curse +40%: more and tougher enemies. +40% XP, +50% Lumens, +1 revival.', '诅咒 +40%：敌人更多、更强。经验 +40%，流明 +50%，复活 +1。'),
    mods: (s) => {
      s.curse *= 1.4
      s.growth += 0.4
      s.greed += 0.5
      s.revival += 1
    },
  },
]
