import { loc } from '../../core/i18n'
import { audio } from '../../core/audio'
import { css } from '../../core/math'
import type { Action } from '../../core/input'
import { COLOR } from '../../game/types'
import { applyChoice, rollChoices, type Choice } from '../../game/upgrades'
import type { World } from '../../game/world'
import { Screen, svgIcon, ui } from '../ui'

export class LevelUpScreen extends Screen {
  private choices: Choice[] = []

  constructor(readonly w: World) {
    super('levelup')
    this.lock = 0.45
  }

  enter() {
    audio.sfx('levelUp')
    this.roll()
  }

  private roll() {
    this.choices = rollChoices(this.w)
    const p = this.w.p
    this.el.innerHTML = `
      <div class="lu-title">${loc({ en: 'LEVEL UP', zh: '升级' })} <span>LV ${p.level - p.pending + 1}</span></div>
      <div class="cards">${this.choices
        .map((c, i) => {
          const col = css(COLOR[c.hue])
          return `<button class="card ${c.kind}" data-nav data-i="${i}" style="--c:${col}">
            <div class="card-icon">${svgIcon(c.icon, col)}</div>
            <div class="card-body">
              <div class="card-name">${c.name}</div>
              <div class="card-tag">${c.kind === 'fusion' ? loc({ en: 'FUSION', zh: '融合' }) : c.isNew ? loc({ en: 'NEW', zh: '新' }) : c.level ? `LV ${c.level}` : ''}</div>
              <div class="card-desc">${c.desc}</div>
            </div>
          </button>`
        })
        .join('')}</div>
      <div class="lu-actions">
        <button class="btn small" data-nav data-act="reroll" ${p.rerolls > 0 ? '' : 'disabled'}>${loc({ en: 'Reroll', zh: '重抽' })} (${p.rerolls}) <kbd>R</kbd></button>
        <button class="btn small" data-nav data-act="skip" ${p.skips > 0 ? '' : 'disabled'}>${loc({ en: 'Skip', zh: '跳过' })} (${p.skips}) <kbd>F</kbd></button>
      </div>`
    this.$$('.card').forEach((b) => b.addEventListener('click', () => this.pick(this.choices[+b.dataset.i!])))
    this.$$('[data-act]').forEach((b) => b.addEventListener('click', () => this.action(b.dataset.act as Action)))
    ui.focus = null
    ui.autoFocus()
  }

  private pick(c: Choice) {
    applyChoice(this.w, c)
    audio.sfx(c.kind === 'fusion' ? 'fusion' : 'uiSelect')
    this.done()
  }

  private done() {
    const p = this.w.p
    p.pending--
    if (p.pending > 0) {
      this.lock = 0.25
      this.roll()
      return
    }
    ui.pop()
    this.w.modal = false
  }

  action(a: Action) {
    const p = this.w.p
    if (a === 'reroll' && p.rerolls > 0) {
      p.rerolls--
      audio.sfx('uiSelect')
      this.roll()
      return true
    }
    if (a === 'skip' && p.skips > 0) {
      p.skips--
      audio.sfx('uiBack')
      this.done()
      return true
    }
    return a === 'back'
  }

  back() {}
}
