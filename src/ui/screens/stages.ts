import { l, loc, type L } from '../../core/i18n'
import { audio } from '../../core/audio'
import { css, fmtTime } from '../../core/math'
import { save } from '../../core/save'
import type { CharacterDef, StageDef } from '../../game/types'
import { ASCENSIONS, STAGES, enemyById, stageById } from '../../game/registry'
import { isStageUnlocked, maxAscension } from '../../game/meta'
import { game } from '../../game/game'
import { Screen, ui } from '../ui'
import { LOCK, T, glyph, memo, prompts, shapeSvg } from '../kit'
import type { Action } from '../../core/input'

const ASC_MAX = Math.max(0, ...ASCENSIONS.map((a) => a.level))
type Mods = Parameters<(typeof ASCENSIONS)[number]['apply']>[0]
const MOD_NAME: [keyof Mods, L, boolean][] = [
  ['hp', l('Enemy HP', '敌人生命'), false],
  ['dmg', l('Enemy damage', '敌人伤害'), false],
  ['speed', l('Enemy speed', '敌人速度'), false],
  ['rate', l('Spawn rate', '刷怪速度'), false],
  ['bulletSpeed', l('Bullet speed', '弹幕速度'), false],
  ['heal', l('Healing', '治疗效果'), true],
  ['lumens', l('Lumens', '流明'), true],
]

/** longest survival on a stage (UI memo + run history) */
export const bestTime = (id: string) => Math.max(memo().best?.[id] ?? 0, ...save.data.history.filter((h) => h.stage === id).map((h) => h.time))
const maxAsc = (s: StageDef) => Math.min(maxAscension(s.id), ASC_MAX)
const cleared = (s: StageDef) => save.data.cleared[s.id] !== undefined

/** Stage select: stage cards, ascension selector and endless toggle. */
export class StageSelectScreen extends Screen {
  private st: StageDef
  private asc: number
  private endless: boolean

  constructor(readonly char: CharacterDef) {
    super('stages menu')
    const m = memo(), open = STAGES.filter((s) => isStageUnlocked(s.id))
    this.st = open.find((s) => s.id === m.stage) ?? open.find((s) => !cleared(s)) ?? open[open.length - 1]
    this.asc = Math.min(m.asc?.[this.st.id] ?? 0, maxAsc(this.st))
    this.endless = !!m.endless && cleared(this.st)
    this.render()
    this.el.addEventListener('focusin-nav', (e) => {
      const t = e.target as HTMLElement, s = stageById.get(t.dataset.id ?? '')
      if (s && !(e as CustomEvent).detail.pointer && isStageUnlocked(s.id)) this.select(s)
    })
  }

  render() {
    const c = this.char
    this.el.innerHTML = `
      <header class="hdr st">
        <div class="hdr-t"><small>02 / 02</small><h1>${loc(l('Choose Your Descent', '选择坠落之地'))}</h1></div>
        <div class="hdr-r ss-char" style="--c:${css(c.color)}">${shapeSvg(c.shape, css(c.color), 'shape sm')}<div><b>${loc(c.name)}</b><small>${loc(c.title)}</small></div></div>
      </header>
      <div class="ss-cards">${STAGES.map((s, i) => this.card(s, i)).join('')}</div>
      <div class="ss-cfg panel st" style="--i:5"></div>
      ${prompts([['confirm', l('Start', '出发')], ['back', T.back]])}`
    this.on('.sc', (b) => {
      const s = stageById.get(b.dataset.id!)!
      if (!isStageUnlocked(s.id)) return audio.sfx('uiDeny')
      if (s === this.st) this.start()
      else {
        audio.sfx('uiMove')
        this.select(s)
      }
    })
    this.cfg()
  }

  private card(s: StageDef, i: number) {
    const open = isStageUnlocked(s.id), p = s.palette, boss = enemyById.get(s.boss), best = bestTime(s.id)
    const prev = s.unlockAfter && stageById.get(s.unlockAfter)
    const status = !open
      ? `<div class="sc-lock">${LOCK}<span>${loc(l('Clear {s} to unlock', '通关{s}后解锁'), { s: prev ? loc(prev.name) : '' })}</span></div>`
      : `<div class="sc-stat">
          ${cleared(s) ? `<span class="ok">✓ ${loc(l('Cleared', '已通关'))}${save.data.cleared[s.id] ? ` · A${save.data.cleared[s.id]}` : ''}</span>` : `<span>${loc(l('Uncleared', '未通关'))}</span>`}
          ${best ? `<span>${loc(l('Best', '最佳'))} ${fmtTime(best)}</span>` : ''}
        </div>
        <div class="sc-boss">${loc(l('Guardian', '守护者'))} · <b>${boss && save.data.seen.includes(boss.id) ? loc(boss.name) : '???'}</b></div>`
    return `<button class="sc st ${open ? '' : 'locked'} ${s === this.st ? 'sel default' : ''}" data-nav data-id="${s.id}"
      style="--i:${i + 1};--c0:${css(p.c0)};--c1:${css(p.c1)};--c2:${css(p.c2)};--c:${css(p.grid)}">
      <span class="sc-bg bg${s.bgStyle}"></span>
      <span class="sc-n">${String(s.order).padStart(2, '0')}</span>
      <h3>${loc(s.name)}</h3>
      <p>${loc(s.desc)}</p>
      ${status}
    </button>`
  }

  private select(s: StageDef) {
    if (s === this.st) return
    this.st = s
    this.asc = Math.min(memo().asc?.[s.id] ?? 0, maxAsc(s))
    this.endless = this.endless && cleared(s)
    for (const b of this.$$('.sc')) b.classList.toggle('sel', b.dataset.id === s.id)
    this.cfg()
  }

  /** ascension / endless / start panel for the selected stage */
  private cfg() {
    const s = this.st, max = maxAsc(s), can = cleared(s)
    const mods: Mods = { hp: 1, dmg: 1, speed: 1, rate: 1, lumens: 1, bulletSpeed: 1, heal: 1 }
    const list = ASCENSIONS.filter((a) => a.level <= this.asc).sort((a, b) => a.level - b.level)
    for (const a of list) a.apply(mods)
    const chips = MOD_NAME.filter(([k]) => Math.abs(mods[k] - 1) > 1e-3)
      .map(([k, n, up]) => `<span class="chip ${(mods[k] > 1) === up ? 'good' : 'bad'}">${loc(n)} ${mods[k] > 1 ? '+' : '−'}${Math.round(Math.abs(mods[k] - 1) * 100)}%</span>`).join('')
    const box = this.$('.ss-cfg')
    box.style.setProperty('--c', css(s.palette.grid))
    box.innerHTML = `
      <div class="ss-opts">
        <div class="opt ${max ? '' : 'na'}" data-nav data-o="asc" ${max ? '' : 'disabled'}>
          <span class="opt-l">${loc(l('Ascension', '晋升'))}</span>
          <span class="cyc"><i data-d="-1">◂</i><b>${this.asc}</b><small>/ ${max}</small><i data-d="1">▸</i></span>
        </div>
        <div class="opt ${can ? '' : 'na'}" data-nav data-o="endless" ${can ? '' : 'disabled'}>
          <span class="opt-l">${loc(l('Endless', '无尽模式'))}</span>
          <span class="tog ${this.endless ? 'on' : ''}"><i></i></span>
        </div>
        <button class="btn prime start" data-nav data-a="start">${glyph('confirm')} ${loc(l('Begin the fall', '开始坠落'))}</button>
      </div>
      <div class="ss-asc">
        <h4>${this.asc ? `${loc(l('Ascension', '晋升'))} ${this.asc}` : loc(l('Standard', '标准'))}</h4>
        ${list.length ? `<ol class="scroll">${list.map((a) => `<li class="${a.level === this.asc ? 'new' : ''}"><b>A${a.level}</b><span><em>${loc(a.name)}</em> — ${loc(a.desc)}</span></li>`).join('')}</ol><div class="chips">${chips}</div>`
          : `<p>${max ? loc(l('The fall as intended. Raise Ascension for tougher runs and richer rewards.', '原汁原味的坠落。提升晋升等级，挑战更难、奖励更丰厚。')) : loc(l('Clear this stage to unlock Ascension.', '通关此关卡以解锁晋升。'))}</p>`}
        ${can ? '' : `<p class="note">${loc(l('Endless unlocks after clearing this stage.', '通关此关卡后解锁无尽模式。'))}</p>`}
      </div>`
    box.querySelectorAll<HTMLElement>('.cyc i').forEach((i) => i.addEventListener('click', (e) => {
      e.stopPropagation()
      this.setAsc(this.asc + +i.dataset.d!)
    }))
    box.querySelector('[data-o=endless]')!.addEventListener('click', () => this.toggleEndless())
    box.querySelector('[data-a=start]')!.addEventListener('click', () => this.start())
  }

  private setAsc(v: number) {
    const n = Math.max(0, Math.min(maxAsc(this.st), v))
    if (n === this.asc) return audio.sfx('uiDeny')
    this.asc = n
    audio.sfx('uiMove')
    this.refocus('asc')
  }

  private toggleEndless() {
    if (!cleared(this.st)) return audio.sfx('uiDeny')
    this.endless = !this.endless
    audio.sfx('uiSelect')
    this.refocus('endless')
  }

  /** rebuild the config panel and keep focus on the same option */
  private refocus(o: string) {
    this.cfg()
    ui.setFocus(this.$(`[data-o=${o}]`), true)
  }

  action(a: Action) {
    const f = ui.focus, o = f?.dataset.o
    if (o === 'asc' && (a === 'left' || a === 'right')) return this.setAsc(this.asc + (a === 'left' ? -1 : 1)), true
    if (o === 'endless' && (a === 'left' || a === 'right')) return this.toggleEndless(), true
    if (a === 'up' && f && this.$('.ss-opts').contains(f) && f === ui.focusables().find((x) => this.$('.ss-opts').contains(x))) {
      ui.setFocus(this.$(`.sc[data-id=${this.st.id}]`))
      return true
    }
    if (a === 'down' && f?.classList.contains('sc')) {
      ui.setFocus(ui.focusables().find((x) => this.$('.ss-opts').contains(x)) ?? null)
      return true
    }
    return false
  }

  private start() {
    const m = memo()
    m.stage = this.st.id
    ;(m.asc ??= {})[this.st.id] = this.asc
    m.endless = this.endless
    save.write()
    audio.sfx('uiSelect')
    game.start({ char: this.char, stage: this.st, asc: this.asc, endless: this.endless })
  }
}
