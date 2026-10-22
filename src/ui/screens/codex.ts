import { l, loc } from '../../core/i18n'
import { audio } from '../../core/audio'
import { css } from '../../core/math'
import { save } from '../../core/save'
import { ENEMIES, PASSIVES, WEAPONS, enemyById, passiveById, weaponById } from '../../game/registry'
import { Screen, svgIcon, ui } from '../ui'
import { HUE_NAME, QMARK, T, deltaList, hueCss, prompts, shapeSvg, weaponDelta } from '../kit'
import type { Action } from '../../core/input'

type Tab = 'weapons' | 'passives' | 'enemies'
const TABS: Tab[] = ['weapons', 'passives', 'enemies']
const seen = (id: string) => save.data.seen.includes(id)

/** Codex: browse met weapons, passives and enemies. Everything not yet encountered stays masked. */
export class CodexScreen extends Screen {
  private tab: Tab = 'weapons'

  constructor() {
    super('codex menu')
    this.render()
    this.el.addEventListener('focusin-nav', (e) => {
      const t = e.target as HTMLElement
      if (t.dataset.ctab) {
        this.tab = t.dataset.ctab as Tab
        this.swap()
      }
    })
  }

  render() {
    this.el.innerHTML = `
      <header class="hdr st">
        <div class="hdr-t"><small>${loc(l('Field Notes', '野外笔记'))}</small><h1>${loc(l('Codex', '图鉴'))}</h1></div>
        <div class="hdr-r cx-tabs">
          ${TABS.map((t) => `<button class="cx-tab ${t === this.tab ? 'on' : ''}" data-nav data-ctab="${t}">${loc(tabName(t))}</button>`).join('')}
        </div>
      </header>
      <div class="cx-body">
        <div class="cx-grid scroll"></div>
        <aside class="cx-detail panel st" style="--i:6"></aside>
      </div>
      ${prompts([['tabL', T.tabs], ['confirm', T.select], ['back', T.back]])}`
    this.$$('[data-ctab]').forEach((b) => b.addEventListener('click', () => {
      if ((b.dataset.ctab as Tab) !== this.tab) {
        this.tab = b.dataset.ctab as Tab
        audio.sfx('uiMove')
        this.swap()
      }
    }))
    this.swap()
  }

  /** switch tab: rebuild grid (+ tabs active state) and focus the first entry */
  private swap() {
    for (const b of this.$$('.cx-tab')) b.classList.toggle('on', b.dataset.ctab === this.tab)
    const grid = this.$('.cx-grid')
    grid.innerHTML = this.grid()
    this.on('.cx-cell', (b) => this.show(b.dataset.id!))
    const first = this.$$('.cx-cell')[0]
    if (first) this.show(first.dataset.id!)
  }

  private grid() {
    const ids = this.tab === 'weapons' ? WEAPONS.map((w) => w.id) : this.tab === 'passives' ? PASSIVES.map((p) => p.id) : ENEMIES.map((e) => e.id)
    if (!ids.length) return `<div class="cx-empty">${loc(l('Nothing here yet.', '尚无记录。'))}</div>`
    return ids.map((id, i) => this.cell(id, i)).join('')
  }

  private cell(id: string, i: number) {
    const known = seen(id)
    let inner = ''
    if (this.tab === 'weapons') {
      const d = weaponById.get(id)!
      inner = known
        ? `${svgIcon(d.icon, hueCss(d.hue))}<span class="cx-n">${loc(d.name)}</span>`
        : `${svgIcon(QMARK, 'var(--dim)')}<span class="cx-n">${loc(T.unknown)}</span>`
    } else if (this.tab === 'passives') {
      const d = passiveById.get(id)!
      inner = known
        ? `${svgIcon(d.icon, hueCss(d.hue))}<span class="cx-n">${loc(d.name)}</span>`
        : `${svgIcon(QMARK, 'var(--dim)')}<span class="cx-n">${loc(T.unknown)}</span>`
    } else {
      const d = enemyById.get(id)!
      inner = known
        ? `${shapeSvg(d.shape, css(d.color), 'shape sm')}<span class="cx-n">${loc(d.name)}</span>`
        : `<span class="cx-q">?</span><span class="cx-n">${loc(T.unknown)}</span>`
    }
    return `<button class="cx-cell st ${known ? '' : 'masked'}" data-nav data-id="${id}" style="--i:${Math.min(i, 14)}">${inner}</button>`
  }

  private show(id: string) {
    const box = this.$('.cx-detail')
    const known = seen(id)
    for (const c of this.$$('.cx-cell')) c.classList.toggle('sel', c.dataset.id === id)
    if (!known) {
      box.innerHTML = `<div class="cx-mask">${svgIcon(QMARK, 'var(--dim)')}<p>${loc(l('Encounter this in the fall to reveal its entry.', '在坠落中遭遇它，以揭晓其条目。'))}</p></div>`
      return
    }
    if (this.tab === 'weapons') {
      const d = weaponById.get(id)!
      box.style.setProperty('--c', hueCss(d.hue))
      box.innerHTML = `
        <div class="cx-dic">${svgIcon(d.icon, hueCss(d.hue))}</div>
        <h2>${loc(d.name)}</h2>
        <div class="cx-hue">${loc(HUE_NAME[d.hue])}</div>
        <p class="cx-desc">${loc(d.desc)}</p>
        <div class="cx-box"><small>${loc(l('Level 1', '等级 1'))}</small>${deltaList(weaponDelta(d, 1))}</div>
        <div class="cx-box"><small>${loc(l('Growth', '成长'))}</small>${d.levels.map((lv) => `<p class="cx-lv">${loc(lv)}</p>`).join('')}</div>`
    } else if (this.tab === 'passives') {
      const d = passiveById.get(id)!
      box.style.setProperty('--c', hueCss(d.hue))
      box.innerHTML = `
        <div class="cx-dic">${svgIcon(d.icon, hueCss(d.hue))}</div>
        <h2>${loc(d.name)}</h2>
        <div class="cx-hue">${loc(HUE_NAME[d.hue])}</div>
        <p class="cx-desc">${loc(d.desc)}</p>`
    } else {
      const d = enemyById.get(id)!
      box.style.setProperty('--c', css(d.color))
      box.innerHTML = `
        <div class="cx-dic">${shapeSvg(d.shape, css(d.color), 'shape')}</div>
        <h2>${loc(d.name)}${d.boss ? ` <em class="cx-boss">${loc(l('Boss', '首领'))}</em>` : ''}</h2>
        <p class="cx-desc">${loc(d.desc)}</p>
        <div class="cx-stats">
          <div><small>${loc(l('HP', '生命'))}</small><b>${Math.round(d.hp)}</b></div>
          <div><small>${loc(l('Damage', '伤害'))}</small><b>${d.dmg}</b></div>
        </div>`
    }
  }

  action(a: Action) {
    if (a === 'tabL' || a === 'tabR') {
      const i = TABS.indexOf(this.tab)
      this.tab = TABS[(i + (a === 'tabL' ? TABS.length - 1 : 1)) % TABS.length]
      audio.sfx('uiMove')
      this.swap()
      ui.autoFocus()
      return true
    }
    return false
  }
}

const tabName = (t: Tab) => (t === 'weapons' ? l('Weapons', '武器') : t === 'passives' ? l('Relics', '遗物') : l('Enemies', '敌人'))

