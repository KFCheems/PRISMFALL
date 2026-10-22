import { l } from '../core/i18n'
import type { ShopDef } from '../game/types'

/**
 * The Prism Forge: permanent upgrades bought with Lumens. Price = cost × (level+1) × (1 + 5% per level owned overall),
 * so a full Forge (58 levels) runs ≈ 54k◎ bought cheapest-first — roughly 30 hours of play. Fully refundable.
 */
export const SHOP: ShopDef[] = [
  // ── force ──
  {
    id: 'might', name: l('Might', '威能'), desc: l('+5% damage', '伤害 +5%'), max: 5, cost: 90,
    icon: '<path d="M32 4l7 10v26H25V14z" fill="currentColor"/><path d="M16 42h32" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path d="M32 46v12" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>',
    apply: (s, lv) => void (s.might *= 1 + 0.05 * lv),
  },
  {
    id: 'vitality', name: l('Vitality', '活力'), desc: l('+8% max HP', '最大生命 +8%'), max: 5, cost: 60,
    icon: '<path d="M32 54C10 38 6 28 12 18c6-9 16-7 20 2 4-9 14-11 20-2 6 10 2 20-20 36z" fill="none" stroke="currentColor" stroke-width="5" stroke-linejoin="round"/><path d="M32 22v16M24 30h16" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>',
    apply: (s, lv) => void (s.maxHp *= 1 + 0.08 * lv),
  },
  {
    id: 'armor', name: l('Armor', '坚甲'), desc: l('+1 armor (flat damage reduction per hit)', '护甲 +1（每次受击固定减伤）'), max: 3, cost: 180,
    icon: '<path d="M32 6l22 12v28L32 58 10 46V18z" fill="none" stroke="currentColor" stroke-width="5" stroke-linejoin="round"/><path d="M32 19l11 6.5v13L32 45l-11-6.5v-13z" fill="currentColor"/>',
    apply: (s, lv) => void (s.armor += lv),
  },
  {
    id: 'recovery', name: l('Recovery', '复原'), desc: l('+0.15 HP regenerated per second', '每秒回复生命 +0.15'), max: 5, cost: 70,
    icon: '<path d="M50 32a18 18 0 1 1-6-13.4" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path d="M47 8v12H35" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M32 25v14M25 32h14" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>',
    apply: (s, lv) => void (s.regen += 0.15 * lv),
  },
  // ── reach & tempo ──
  {
    id: 'haste', name: l('Haste', '急速'), desc: l('-3% weapon cooldown', '武器冷却 -3%'), max: 3, cost: 200,
    icon: '<circle cx="32" cy="36" r="20" fill="none" stroke="currentColor" stroke-width="5"/><path d="M32 36l9-11" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path d="M25 6h14M32 6v10M50 14l4 4" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>',
    apply: (s, lv) => void (s.cooldown *= 1 - 0.03 * lv),
  },
  {
    id: 'reach', name: l('Reach', '广域'), desc: l('+5% area', '范围 +5%'), max: 3, cost: 130,
    icon: '<circle cx="32" cy="32" r="7" fill="currentColor"/><circle cx="32" cy="32" r="16" fill="none" stroke="currentColor" stroke-width="4"/><path d="M6 18V6h12M46 6h12v12M58 46v12H46M18 58H6V46" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>',
    apply: (s, lv) => void (s.area *= 1 + 0.05 * lv),
  },
  {
    id: 'velocity', name: l('Velocity', '初速'), desc: l('+8% projectile speed', '弹速 +8%'), max: 2, cost: 70,
    icon: '<path d="M4 22h14M8 32h16M4 42h14" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M28 14l32 18-32 18 7-18z" fill="currentColor"/>',
    apply: (s, lv) => void (s.projSpeed *= 1 + 0.08 * lv),
  },
  {
    id: 'persistence', name: l('Persistence', '恒久'), desc: l('+8% effect duration', '持续时间 +8%'), max: 2, cost: 80,
    icon: '<path d="M32 32c-6-8-10-12-16-12a12 12 0 0 0 0 24c6 0 10-4 16-12s10-12 16-12a12 12 0 0 1 0 24c-6 0-10-4-16-12z" fill="none" stroke="currentColor" stroke-width="5" stroke-linejoin="round"/>',
    apply: (s, lv) => void (s.duration *= 1 + 0.08 * lv),
  },
  {
    id: 'swiftness', name: l('Swiftness', '轻捷'), desc: l('+5% move speed', '移动速度 +5%'), max: 2, cost: 70,
    icon: '<path d="M8 14l18 18L8 50M30 14l18 18-18 18" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="56" cy="32" r="4" fill="currentColor"/>',
    apply: (s, lv) => void (s.moveSpeed *= 1 + 0.05 * lv),
  },
  // ── fortune ──
  {
    id: 'magnetism', name: l('Magnetism', '磁引'), desc: l('+15% pickup radius', '拾取范围 +15%'), max: 3, cost: 40,
    icon: '<circle cx="32" cy="32" r="25" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="4 6"/><path d="M32 23l8 9-8 9-8-9z" fill="currentColor"/><path d="M4 32h12M11 27l5 5-5 5M60 32H48M53 27l-5 5 5 5M32 4v12M27 11l5 5 5-5M32 60V48M27 53l5-5 5 5" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>',
    apply: (s, lv) => void (s.magnet *= 1 + 0.15 * lv),
  },
  {
    id: 'fortune', name: l('Fortune', '气运'), desc: l('+8% luck', '幸运 +8%'), max: 3, cost: 110,
    icon: '<path d="M28 8c2.6 15 8.4 20.8 23.4 23.4C36.4 34 30.6 39.8 28 54.8 25.4 39.8 19.6 34 4.6 31.4 19.6 28.8 25.4 23 28 8z" fill="currentColor"/><path d="M50 4c1.2 6 3.6 8.4 9.6 9.6-6 1.2-8.4 3.6-9.6 9.6-1.2-6-3.6-8.4-9.6-9.6 6-1.2 8.4-3.6 9.6-9.6z" fill="currentColor"/>',
    apply: (s, lv) => void (s.luck += 0.08 * lv),
  },
  {
    id: 'insight', name: l('Insight', '洞悉'), desc: l('+4% experience gained', '获得经验 +4%'), max: 5, cost: 70,
    icon: '<path d="M4 32c8-14 18-20 28-20s20 6 28 20c-8 14-18 20-28 20S12 46 4 32z" fill="none" stroke="currentColor" stroke-width="5" stroke-linejoin="round"/><circle cx="32" cy="32" r="9" fill="currentColor"/>',
    apply: (s, lv) => void (s.growth += 0.04 * lv),
  },
  {
    id: 'avarice', name: l('Avarice', '贪婪'), desc: l('+8% Lumens collected', '获得流明 +8%'), max: 5, cost: 60,
    icon: '<path d="M18 10h28l12 14-26 32L6 24z" fill="none" stroke="currentColor" stroke-width="5" stroke-linejoin="round"/><path d="M6 24h52M24 10l-4 14 12 32 12-32-4-14" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>',
    apply: (s, lv) => void (s.greed += 0.08 * lv),
  },
  // ── run tools ──
  {
    id: 'reroll', name: l('Reroll', '重抽'), desc: l('+1 reroll each run', '每局重抽次数 +1'), max: 3, cost: 100,
    icon: '<g fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 26a21 21 0 0 1 38-6"/><path d="M52 38a21 21 0 0 1-38 6"/><path d="M52 8v12H40"/><path d="M12 56V44h12"/></g>',
    apply: (s, lv) => void (s.reroll += lv),
  },
  {
    id: 'skip', name: l('Skip', '跳过'), desc: l('+1 skip each run', '每局跳过次数 +1'), max: 3, cost: 50,
    icon: '<path d="M8 14l20 18-20 18zM28 14l20 18-20 18z" fill="currentColor"/><path d="M55 14v36" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>',
    apply: (s, lv) => void (s.skip += lv),
  },
  {
    id: 'banish', name: l('Banish', '放逐'), desc: l('+1 banish each run (removes a card from the run)', '每局放逐次数 +1（本局移除一张卡牌）'), max: 3, cost: 110,
    icon: '<rect x="21" y="14" width="22" height="36" rx="3" fill="none" stroke="currentColor" stroke-width="4"/><circle cx="32" cy="32" r="26" fill="none" stroke="currentColor" stroke-width="5"/><path d="M14 14l36 36" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>',
    apply: (s, lv) => void (s.banish += lv),
  },
  // ── prestige ──
  {
    id: 'second_light', name: l('Second Light', '复燃之光'), desc: l('+1 revival: rise once more at 50% HP', '复活 +1：以 50% 生命再度燃起'), max: 1, cost: 1100,
    icon: '<path d="M32 4c3 12 16 18 16 33a16 16 0 0 1-32 0c0-8 3-13 8-17 0 6 2 10 6 11-2-9 0-19 2-27z" fill="none" stroke="currentColor" stroke-width="5" stroke-linejoin="round"/><path d="M32 54V38M25 45l7-7 7 7" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>',
    apply: (s, lv) => void (s.revival += lv),
  },
  {
    id: 'multiplicity', name: l('Multiplicity', '多重'), desc: l('+1 projectile for every weapon', '所有武器弹体 +1'), max: 1, cost: 2000,
    icon: '<g fill="currentColor"><ellipse cx="42" cy="14" rx="14" ry="6"/><ellipse cx="46" cy="32" rx="14" ry="6"/><ellipse cx="42" cy="50" rx="14" ry="6"/></g><path d="M6 14h16M4 32h22M6 50h16" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>',
    apply: (s, lv) => void (s.amount += lv),
  },
  {
    id: 'choice', name: l('Wider Spectrum', '广谱'), desc: l('+1 card to choose from on level up', '升级时可选卡牌 +1'), max: 1, cost: 2800,
    icon: '<g fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"><rect x="21" y="10" width="22" height="32" rx="3" transform="rotate(-24 32 52)"/><rect x="21" y="10" width="22" height="32" rx="3" transform="rotate(24 32 52)"/></g><rect x="21" y="8" width="22" height="32" rx="3" fill="currentColor"/><path d="M32 46v14M25 53h14" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>',
    apply: (s, lv) => void (s.choices += lv),
  },
]
