import { l, loc } from '../../core/i18n'
import { audio } from '../../core/audio'
import { css } from '../../core/math'
import { save } from '../../core/save'
import type { CharacterDef } from '../../game/types'
import { CHARACTERS, charById, weaponById } from '../../game/registry'
import { buyChar, isCharUnlocked } from '../../game/meta'
import { Screen, svgIcon, ui } from '../ui'
import { HUE_NAME, LOCK, T, achById, charChips, hueCss, lumens, memo, prompts, shapeSvg } from '../kit'
import { ConfirmScreen } from './confirm'
import { StageSelectScreen } from './stages'

/** big animated character portrait */
export const portrait = (c: CharacterDef, cls = '') =>
  `<div class="portrait ${cls}" style="--c:${css(c.color)}"><span class="halo"></span><span class="halo h2"></span>${shapeSvg(c.shape, css(c.color), 'shape')}<span class="orbs"><i></i><i></i><i></i></span></div>`

/** Character select: portrait grid + detail panel with trait, stats, starting weapon and unlock state. */
export class CharSelectScreen extends Screen {
  private cur: CharacterDef

  constructor() {
    super('chars menu')
    this.cur = charById.get(memo().char ?? '') ?? CHARACTERS[0]
    this.render()
    this.el.addEventListener('focusin-nav', (e) => {
      const c = charById.get((e.target as HTMLElement).dataset.id ?? '')
      if (c && c !== this.cur) this.show(c)
    })
  }

  render() {
    this.el.innerHTML = `
      <header class="hdr st">
        <div class="hdr-t"><small>01 / 02</small><h1>${loc(l('Choose Your Light', '选择你的光'))}</h1></div>
        <div class="hdr-r">${lumens(save.data.lumens, 'big')}</div>
      </header>
      <div class="cs-body">
        <div class="cs-grid">${CHARACTERS.map((c, i) => this.tile(c, i)).join('')}</div>
        <div class="cs-detail panel st" style="--i:3"></div>
      </div>
      ${prompts([['confirm', T.select], ['back', T.back]])}`
    this.on('.ct', (b) => this.choose(charById.get(b.dataset.id!)!))
    this.show(this.cur)
  }

  private tile(c: CharacterDef, i: number) {
    const open = isCharUnlocked(c.id)
    return `<button class="ct st ${open ? '' : 'locked'} ${c === this.cur ? 'default' : ''}" data-nav data-id="${c.id}" style="--c:${css(c.color)};--i:${i}">
      ${shapeSvg(c.shape, css(c.color), 'shape')}
      <span class="ct-n">${loc(c.name)}</span>
      ${open ? '' : c.cost ? `<span class="ct-lock">${lumens(c.cost)}</span>` : `<span class="ct-lock">${LOCK}</span>`}
    </button>`
  }

  private show(c: CharacterDef) {
    this.cur = c
    const open = isCharUnlocked(c.id), wd = weaponById.get(c.weapon), ach = c.unlock ? achById(c.unlock) : undefined
    const afford = !!c.cost && save.data.lumens >= c.cost
    const cta = open
      ? `<button class="btn prime cta" data-cta>${loc(l('Select', '选择'))}</button>`
      : c.cost
        ? `<button class="btn cta ${afford ? 'buy' : ''}" data-cta ${afford ? '' : 'disabled'}>${loc(l('Unlock', '解锁'))} ${lumens(c.cost)}</button>
           ${afford ? '' : `<p class="cs-need">${loc(l('Need {n} more Lumens', '还需 {n} 流明'), { n: c.cost - save.data.lumens })}</p>`}`
        : `<div class="cs-req">${LOCK}<div><small>${loc(l('Achievement required', '需要成就'))}</small><b>${ach ? loc(ach.name) : c.unlock}</b>${ach ? `<span>${loc(ach.desc)}</span>` : ''}</div></div>`
    const d = this.$('.cs-detail')
    d.className = `cs-detail panel ${open ? '' : 'locked'}`
    d.style.setProperty('--c', css(c.color))
    d.innerHTML = `
      ${portrait(c, 'big')}
      <div class="cs-info">
        <h2>${loc(c.name)}</h2>
        <div class="cs-title">${loc(c.title)}</div>
        <p class="cs-desc">${loc(c.desc)}</p>
        <div class="cs-box"><small>${loc(l('Trait', '特性'))}</small><p>${loc(c.trait)}</p><div class="chips">${charChips(c.mods)}</div></div>
        ${wd ? `<div class="cs-box cs-wpn" style="--h:${hueCss(wd.hue)}">
          <div class="cs-wi">${svgIcon(wd.icon, hueCss(wd.hue))}</div>
          <div><small>${loc(l('Starting weapon', '初始武器'))} · <em>${loc(HUE_NAME[wd.hue])}</em></small><b>${loc(wd.name)}</b><p>${loc(wd.desc)}</p></div>
        </div>` : ''}
        <div class="cs-cta">${cta}</div>
      </div>`
    d.querySelector('[data-cta]')?.addEventListener('click', () => this.choose(c))
  }

  private choose(c: CharacterDef) {
    if (isCharUnlocked(c.id)) {
      audio.sfx('uiSelect')
      memo().char = c.id
      save.write()
      return ui.push(new StageSelectScreen(c))
    }
    if (!c.cost || save.data.lumens < c.cost) {
      audio.sfx('uiDeny')
      this.$('.cs-cta')?.animate([{ transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'none' }], { duration: 220 })
      return
    }
    audio.sfx('uiSelect')
    ui.push(new ConfirmScreen({
      title: loc(l('Unlock {n}?', '解锁{n}？'), { n: loc(c.name) }),
      body: `${loc(c.name)} — ${loc(c.title)}<br>${lumens(c.cost)}`,
      yes: l('Unlock', '解锁'),
      onYes: () => {
        if (!buyChar(c.id)) return
        audio.sfx('purchase')
        memo().char = c.id
        ui.rerender(this)
        ui.toast(`<small>${loc(l('Character unlocked', '角色已解锁'))}</small><b>${loc(c.name)}</b>`, c.color)
      },
    }))
  }
}
