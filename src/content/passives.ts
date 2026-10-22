import { l } from '../core/i18n'
import type { PassiveDef } from '../game/types'

/** 15 passives, 5 per hue. Each counts toward its hue's Resonance. */
export const PASSIVES: PassiveDef[] = [
  // ── Crimson: raw force ──
  {
    id: 'crimson_lens', hue: 'R', name: l('Crimson Lens', '绯红透镜'), desc: l('+8% damage', '伤害 +8%'),
    icon: '<circle cx="32" cy="32" r="20" fill="none" stroke="currentColor" stroke-width="5"/><circle cx="32" cy="32" r="8" fill="currentColor"/>',
    apply: (s, lv) => void (s.might *= 1 + 0.08 * lv),
  },
  {
    id: 'fracture_prism', hue: 'R', name: l('Fracture Prism', '裂光棱镜'), desc: l('+4% crit chance, +12% crit damage', '暴击率 +4%，暴击伤害 +12%'),
    icon: '<path d="M32 6L56 50H8z" fill="none" stroke="currentColor" stroke-width="5" stroke-linejoin="round"/><path d="M32 20l-6 14h8l-4 12" fill="none" stroke="currentColor" stroke-width="4"/>',
    apply: (s, lv) => {
      s.crit += 0.04 * lv
      s.critDmg += 0.12 * lv
    },
  },
  {
    id: 'ember_plating', hue: 'R', name: l('Ember Plating', '余烬装甲'), desc: l('+1 armor', '护甲 +1'),
    icon: '<path d="M32 6l22 8v16c0 14-10 24-22 28C20 54 10 44 10 30V14z" fill="none" stroke="currentColor" stroke-width="5"/><path d="M22 30h20" stroke="currentColor" stroke-width="5"/>',
    apply: (s, lv) => void (s.armor += lv),
  },
  {
    id: 'piercing_ray', hue: 'R', name: l('Piercing Ray', '贯穿射线'), desc: l('Projectiles pierce +1 enemy (every 2 levels)', '弹体额外贯穿 +1（每 2 级）'),
    icon: '<path d="M6 32h44" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path d="M42 20l14 12-14 12" fill="none" stroke="currentColor" stroke-width="5"/><circle cx="24" cy="32" r="7" fill="none" stroke="currentColor" stroke-width="3"/>',
    apply: (s, lv) => void (s.pierce += Math.ceil(lv / 2)),
  },
  {
    id: 'gilded_shard', hue: 'R', name: l('Gilded Shard', '鎏金碎片'), desc: l('+10% luck, +10% lumens', '幸运 +10%，流明 +10%'),
    icon: '<path d="M32 6l18 26-18 26-18-26z" fill="none" stroke="currentColor" stroke-width="5"/><path d="M14 32h36" stroke="currentColor" stroke-width="3"/>',
    apply: (s, lv) => {
      s.luck += 0.1 * lv
      s.greed += 0.1 * lv
    },
  },
  // ── Verdant: life & reach ──
  {
    id: 'verdant_heart', hue: 'G', name: l('Verdant Heart', '翠绿之心'), desc: l('+12% max HP', '最大生命 +12%'),
    icon: '<path d="M32 54C10 38 6 28 12 18c6-9 16-7 20 2 4-9 14-11 20-2 6 10 2 20-20 36z" fill="none" stroke="currentColor" stroke-width="5"/>',
    apply: (s, lv) => void (s.maxHp *= 1 + 0.12 * lv),
  },
  {
    id: 'lifebloom', hue: 'G', name: l('Lifebloom', '生命绽放'), desc: l('+0.3 HP regenerated per second', '每秒回复生命 +0.3'),
    icon: '<circle cx="32" cy="32" r="6" fill="currentColor"/><g fill="none" stroke="currentColor" stroke-width="4"><ellipse cx="32" cy="16" rx="7" ry="10"/><ellipse cx="32" cy="48" rx="7" ry="10"/><ellipse cx="16" cy="32" rx="10" ry="7"/><ellipse cx="48" cy="32" rx="10" ry="7"/></g>',
    apply: (s, lv) => void (s.regen += 0.3 * lv),
  },
  {
    id: 'wide_lens', hue: 'G', name: l('Wide Lens', '广角透镜'), desc: l('+8% area', '范围 +8%'),
    icon: '<circle cx="32" cy="32" r="24" fill="none" stroke="currentColor" stroke-width="4" stroke-dasharray="6 5"/><circle cx="32" cy="32" r="12" fill="none" stroke="currentColor" stroke-width="5"/>',
    apply: (s, lv) => void (s.area *= 1 + 0.08 * lv),
  },
  {
    id: 'lingering_light', hue: 'G', name: l('Lingering Light', '残光'), desc: l('+10% effect duration', '持续时间 +10%'),
    icon: '<circle cx="32" cy="32" r="22" fill="none" stroke="currentColor" stroke-width="5"/><path d="M32 18v15l10 6" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>',
    apply: (s, lv) => void (s.duration *= 1 + 0.1 * lv),
  },
  {
    id: 'growth_spiral', hue: 'G', name: l('Growth Spiral', '生长螺旋'), desc: l('+7% experience gained', '获得经验 +7%'),
    icon: '<path d="M32 32c0-4 6-4 6 0 0 8-12 8-12 0 0-12 18-12 18 0 0 16-24 16-24 0 0-20 30-20 30 0" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>',
    apply: (s, lv) => void (s.growth += 0.07 * lv),
  },
  // ── Azure: tempo & motion ──
  {
    id: 'quickening', hue: 'B', name: l('Quickening', '急速回路'), desc: l('-6% weapon cooldown', '武器冷却 -6%'),
    icon: '<path d="M36 4L14 36h16l-4 24 24-34H34z" fill="none" stroke="currentColor" stroke-width="5" stroke-linejoin="round"/>',
    apply: (s, lv) => void (s.cooldown *= 1 - 0.06 * lv),
  },
  {
    id: 'velocity_coil', hue: 'B', name: l('Velocity Coil', '加速线圈'), desc: l('+12% projectile speed, +8% knockback', '弹速 +12%，击退 +8%'),
    icon: '<g fill="none" stroke="currentColor" stroke-width="4"><ellipse cx="20" cy="32" rx="6" ry="16"/><ellipse cx="32" cy="32" rx="6" ry="16"/><ellipse cx="44" cy="32" rx="6" ry="16"/></g><path d="M4 32h56" stroke="currentColor" stroke-width="3"/>',
    apply: (s, lv) => {
      s.projSpeed *= 1 + 0.12 * lv
      s.knockback *= 1 + 0.08 * lv
    },
  },
  {
    id: 'splitter_prism', hue: 'B', name: l('Splitter Prism', '分光棱镜'), desc: l('+1 projectile (levels 1 and 4)', '弹体数量 +1（第 1、4 级）'),
    icon: '<path d="M6 32h20" stroke="currentColor" stroke-width="5"/><path d="M26 32l28-18M26 32h30M26 32l28 18" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M22 22l10 10-10 10z" fill="currentColor"/>',
    apply: (s, lv) => void (s.amount += lv >= 4 ? 2 : 1),
  },
  {
    id: 'swift_current', hue: 'B', name: l('Swift Current', '迅捷流'), desc: l('+7% move speed, -6% dash cooldown', '移动速度 +7%，冲刺冷却 -6%'),
    icon: '<path d="M8 22h30M14 32h36M8 42h30" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path d="M44 14l14 18-14 18" fill="none" stroke="currentColor" stroke-width="5"/>',
    apply: (s, lv) => {
      s.moveSpeed *= 1 + 0.07 * lv
      s.dashCd *= 1 - 0.06 * lv
    },
  },
  {
    id: 'attractor', hue: 'B', name: l('Attractor', '引力核'), desc: l('+30% pickup radius', '拾取范围 +30%'),
    icon: '<path d="M16 10v22a16 16 0 0032 0V10" fill="none" stroke="currentColor" stroke-width="7"/><path d="M10 10h12M42 10h12" stroke="currentColor" stroke-width="7"/>',
    apply: (s, lv) => void (s.magnet *= 1 + 0.3 * lv),
  },
]
