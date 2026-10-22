import { l, loc } from '../core/i18n'
import { css, fmtNum, fmtTime } from '../core/math'
import { save } from '../core/save'
import { PASSIVE_SLOTS, WEAPON_SLOTS } from '../game/types'
import type { Enemy, Hue } from '../game/types'
import type { World } from '../game/world'
import { fusionPairs } from '../game/upgrades'
import { ui } from './ui'
import { LUMEN, RESONANCE, emptySlots, glyph, hueCss, memo, passiveSlot, weaponSlot, type Prompt } from './kit'

const HUES: Hue[] = ['R', 'G', 'B']
const SKULL = '<svg viewBox="0 0 64 64"><path d="M32 6C18 6 9 16 9 29c0 8 4 13 9 16v9h28v-9c5-3 9-8 9-16C55 16 46 6 32 6z" fill="currentColor"/><circle cx="23" cy="30" r="6" fill="#000"/><circle cx="41" cy="30" r="6" fill="#000"/></svg>'
const KILL = '<svg viewBox="0 0 64 64"><path d="M32 4l6 22 22 6-22 6-6 22-6-22-22-6 22-6z" fill="currentColor"/></svg>'

const TIPS: [Prompt, ReturnType<typeof l>][] = [
  ['move', l('Move — your weapons fire on their own', '移动 —— 武器会自动开火')],
  ['dash', l('Dash through danger — untouchable mid-dash', '冲刺穿越危险 —— 冲刺途中无敌')],
  ['overdrive', l('Kills charge Overdrive — unleash a Prism Burst when full', '击杀充能超载 —— 充满后释放棱镜爆发')],
]
const BURST: Record<Hue | 'W', ReturnType<typeof l>> = {
  R: l('Crimson · +60% damage', '绯红 · 伤害 +60%'),
  G: l('Verdant · heals 30%', '翠绿 · 回复 30%'),
  B: l('Azure · freezes all', '湛蓝 · 冻结全场'),
  W: l('Prismatic · everything', '棱彩 · 全效果'),
}

/** In-run heads-up display (DOM). Updated at ~20 Hz with cached nodes; only changed values touch the DOM. */
export class Hud {
  el: HTMLElement
  private boss: Enemy | null = null
  private t = 0
  private sig = ''
  private n: Record<string, HTMLElement> = {}
  private last: Record<string, number | string | boolean> = {}
  private tips: boolean
  private relabel = () => this.labels()

  constructor(readonly w: World) {
    this.el = document.createElement('div')
    this.el.className = 'hud'
    this.el.innerHTML = `
      <div class="hud-xp"><i class="fill"></i></div>
      <div class="hud-tl">
        <div class="hp">
          <div class="hp-bar"><i class="ghost"></i><i class="fill"></i></div>
          <div class="hp-txt"><b></b><span></span><em class="hp-warn"></em></div>
        </div>
        <div class="slots weapons"></div>
        <div class="slots passives"></div>
        <div class="res">${HUES.map((h) => `<div class="rrow" data-h="${h}" style="--c:${hueCss(h)}"><b>${h}</b><span class="segs">${'<i></i>'.repeat(6)}</span><em></em></div>`).join('')}</div>
      </div>
      <div class="hud-tc">
        <div class="timer"></div>
        <div class="prog"><i class="fill"></i><span class="skull">${SKULL}</span><small></small></div>
        <div class="boss"><div class="bname"><b></b><small></small></div><div class="bbar"><i class="ghost"></i><i class="fill"></i><span class="ticks"></span></div></div>
      </div>
      <div class="hud-tr">
        <div class="lv"><small>LV</small><b></b></div>
        <div class="stat kills">${KILL}<b></b></div>
        <div class="stat lumens">${LUMEN}<b></b></div>
      </div>
      <div class="hud-bc">
        <div class="dash"><span class="ring"></span><span class="dg"></span></div>
        <div class="od"><div class="od-bar"><i class="fill"></i></div><div class="od-lbl"></div></div>
      </div>
      <div class="tips"></div>`
    const q = (s: string) => this.el.querySelector(s) as HTMLElement
    Object.assign(this.n, {
      xp: q('.hud-xp .fill'), hp: q('.hp-bar .fill'), hpGhost: q('.hp-bar .ghost'), hpNum: q('.hp-txt b'), hpMax: q('.hp-txt span'), hpWarn: q('.hp-warn'),
      weapons: q('.weapons'), passives: q('.passives'), res: q('.res'), timer: q('.timer'), prog: q('.prog'), progFill: q('.prog .fill'), progLbl: q('.prog small'),
      lv: q('.lv b'), lvBox: q('.lv'), kills: q('.kills b'), lumens: q('.lumens b'),
      boss: q('.boss'), bossName: q('.bname'), bossFill: q('.bbar .fill'), bossGhost: q('.bbar .ghost'),
      dash: q('.dash'), dashG: q('.dash .dg'), od: q('.od'), odFill: q('.od .fill'), odLbl: q('.od-lbl'), tips: q('.tips'),
    })
    this.n.boss.querySelector('.ticks')!.innerHTML = '<i></i>'.repeat(9)
    const m = memo()
    this.tips = (m.tips ?? 0) < 3
    if (this.tips) {
      m.tips = (m.tips ?? 0) + 1
      save.write()
    }
    this.labels()
    ui.langHooks.add(this.relabel)
    ui.root.prepend(this.el)
  }

  /** static, language-dependent text */
  private labels() {
    this.n.hpWarn.textContent = loc(l('LOW LIGHT', '光芒微弱'))
    this.n.dashG.innerHTML = glyph('dash')
    this.n.tips.innerHTML = this.tips ? TIPS.map(([a, t]) => `<div class="tip">${glyph(a)}<span>${loc(t)}</span></div>`).join('') : ''
    this.sig = ''
    this.last = {}
    this.setBoss(this.boss)
  }

  setBoss(e: Enemy | null) {
    this.boss = e
    this.n.boss.classList.toggle('on', !!e)
    this.n.prog.classList.toggle('off', !!e)
    if (!e) return
    this.n.boss.style.setProperty('--c', css(e.color))
    this.n.bossName.innerHTML = `<b>${loc(e.def.name)}</b>${e.def.title ? `<small>${loc(e.def.title)}</small>` : ''}`
  }

  /** write a value only when it changed */
  private set(key: string, v: number | string | boolean, apply: () => void) {
    if (this.last[key] === v) return
    this.last[key] = v
    apply()
  }

  private bar(key: string, el: HTMLElement, k: number) {
    const v = Math.round(Math.min(1, Math.max(0, k)) * 500) / 500
    this.set(key, v, () => (el.style.transform = `scaleX(${v})`))
  }

  update(dt: number) {
    this.t += dt
    if (this.t < 0.05) return
    this.t = 0
    // hide the in-run HUD whenever a modal (level-up, chest, pause, results) covers the screen
    this.el.classList.toggle('hide', ui.blocking)
    const w = this.w, p = w.p, n = this.n, st = p.stats
    this.bar('xp', n.xp, p.xp / p.xpNext)
    const hpK = Math.max(0, p.hp) / st.maxHp
    this.bar('hp', n.hp, hpK)
    this.bar('hpG', n.hpGhost, hpK)
    this.set('hpN', Math.ceil(Math.max(0, p.hp)), () => (n.hpNum.textContent = String(Math.ceil(Math.max(0, p.hp)))))
    this.set('hpM', Math.round(st.maxHp), () => (n.hpMax.textContent = `/ ${Math.round(st.maxHp)}`))
    this.set('low', hpK < 0.3 && !p.dead, () => this.el.classList.toggle('low', hpK < 0.3 && !p.dead))
    this.set('time', Math.floor(w.time), () => (n.timer.textContent = fmtTime(w.time)))
    this.set('lv', p.level, () => {
      n.lv.textContent = String(p.level)
      if (p.level > 1) n.lvBox.animate([{ transform: 'scale(1.5)', filter: 'brightness(2.5)' }, { transform: 'none', filter: 'none' }], { duration: 450, easing: 'cubic-bezier(.2,.8,.2,1)' })
    })
    this.set('kills', w.kills, () => (n.kills.textContent = fmtNum(w.kills)))
    this.set('lumens', w.lumens, () => (n.lumens.textContent = fmtNum(w.lumens)))

    // time until the boss (endless: until the next one)
    if (!this.boss) {
      const due = w.spawner.bossDue, left = due - w.time
      if (due === Infinity) this.set('prog', 'inf', () => (n.progLbl.textContent = loc(l('ENDLESS', '无尽'))))
      else {
        const span = w.opts.endless && w.bossKills ? 300 : w.opts.stage.duration
        this.bar('progF', n.progFill, 1 - left / span)
        this.set('prog', Math.ceil(left), () => (n.progLbl.textContent = left <= 30 ? loc(l('BOSS IN {t}', '首领 {t} 后降临'), { t: Math.ceil(Math.max(0, left)) }) : ''))
        this.set('near', left <= 30, () => n.prog.classList.toggle('near', left <= 30))
      }
    } else {
      const k = Math.max(0, this.boss.hp) / this.boss.maxHp
      this.bar('boss', n.bossFill, k)
      this.bar('bossG', n.bossGhost, k)
    }

    // overdrive & prism burst flavour
    this.bar('od', n.odFill, p.overdrive / 100)
    const res = p.resonance()
    const top: Hue | 'W' = p.prismatic ? 'W' : res.R >= res.G && res.R >= res.B ? 'R' : res.G >= res.B ? 'G' : 'B'
    this.set('odR', p.odReady + top, () => {
      n.od.classList.toggle('ready', p.odReady)
      n.od.style.setProperty('--c', hueCss(top))
      n.odLbl.innerHTML = p.odReady
        ? `${glyph('overdrive')}<b>${loc(l('PRISM BURST', '棱镜爆发'))}</b><span>${loc(BURST[top])}</span>`
        : `<span>${loc(l('OVERDRIVE', '超载'))}</span>`
    })
    const dk = p.dashCd <= 0 ? 1 : 1 - p.dashCd / st.dashCd
    this.set('dash', Math.round(dk * 40), () => {
      n.dash.style.setProperty('--k', String(dk))
      n.dash.classList.toggle('ready', dk >= 1)
    })

    if (this.tips) this.set('tip', Math.min(4, Math.floor(w.time / 4.6)), () => {
      const i = Math.floor(w.time / 4.6)
      this.n.tips.querySelectorAll('.tip').forEach((t, j) => t.classList.toggle('on', i === j))
      if (i > 2) this.tips = false
    })

    // rebuild slot icons only when the build changes
    const sig = p.weapons.map((x) => x.def.id + x.level + x.fuse).join() + '|' + p.passives.map((x) => x.def.id + x.level).join()
    if (sig !== this.sig) {
      this.sig = sig
      const ready = new Set(fusionPairs(w).flat())
      n.weapons.innerHTML = p.weapons.map((x) => weaponSlot(x, ready.has(x) ? 'fuse-ready' : '')).join('') + emptySlots(WEAPON_SLOTS - p.weapons.length)
      n.passives.innerHTML = p.passives.map(passiveSlot).join('') + emptySlots(PASSIVE_SLOTS - p.passives.length)
      for (const row of n.res.children as HTMLCollectionOf<HTMLElement>) {
        const h = row.dataset.h as Hue, c = res[h], r = RESONANCE[h]
        row.className = `rrow ${c >= 6 ? 'max' : c >= 3 ? 'on' : ''}`
        row.querySelectorAll('i').forEach((s, i) => s.classList.toggle('f', i < c))
        row.querySelector('em')!.textContent = c >= 6 ? `${loc(r.short[0])} · ${loc(r.short[1])}` : c >= 3 ? `${loc(r.short[0])}  ·  ${c}/6` : `${c}/3 → ${loc(r.short[0])}`
      }
    }
  }

  destroy() {
    ui.langHooks.delete(this.relabel)
    this.el.remove()
  }
}
