import { l, loc, type L } from '../../core/i18n'
import { audio } from '../../core/audio'
import { css, fmtNum, fmtTime } from '../../core/math'
import { save } from '../../core/save'
import { ACHIEVEMENTS, CHARACTERS, STAGES, charById, stageById } from '../../game/registry'
import { isCharUnlocked } from '../../game/meta'
import { Screen, ui } from '../ui'
import { T, hueCss, lumens, prompts, shapeSvg, type AnyHue } from '../kit'
import { logoHtml, VERSION } from './title'
import { ConfirmScreen } from './confirm'
import { CharSelectScreen } from './chars'
import { ForgeScreen } from './forge'
import { CodexScreen } from './codex'
import { AchievementsScreen } from './achievements'
import { SettingsScreen } from './settings'
import { CreditsScreen } from './credits'

const ITEMS: [string, L, L, AnyHue][] = [
  ['play', l('Play', '开始游戏'), l('Choose a fragment of light and begin the fall.', '选择一束光，开始坠落。'), 'C'],
  ['forge', l('Prism Forge', '棱镜熔炉'), l('Spend Lumens on permanent upgrades.', '花费流明，锻造永久强化。'), 'Y'],
  ['codex', l('Codex', '图鉴'), l('Every weapon, relic and horror you have met.', '你在坠落中遇见的一切武器、遗物与怪物。'), 'B'],
  ['ach', l('Achievements', '成就'), l('Feats of light — and what they unlock.', '光之功绩，以及它们解锁的奖励。'), 'M'],
  ['settings', l('Settings', '设置'), l('Language, audio, video and controls.', '语言、音频、画面与操作。'), 'G'],
  ['credits', l('Credits', '制作人员'), l('The people and tools behind the light.', '光芒背后的人与工具。'), 'W'],
  ['quit', l('Quit', '退出游戏'), l('Return to the desktop.', '返回桌面。'), 'R'],
]

/** Main menu: navigation hub with lumens balance and a glance at progress. */
export class MainMenu extends Screen {
  constructor() {
    super('main menu')
    this.render()
    this.el.addEventListener('focusin-nav', (e) => {
      const it = ITEMS.find(([id]) => id === (e.target as HTMLElement).dataset.a)
      if (it) this.$('.mm-desc').textContent = loc(it[2])
    })
  }

  enter() {
    audio.music('menu')
  }

  render() {
    const d = save.data, last = d.history[0]
    const lastChar = last && charById.get(last.char), lastStage = last && stageById.get(last.stage)
    const chars = CHARACTERS.filter((c) => isCharUnlocked(c.id)).length
    const cleared = STAGES.filter((s) => d.cleared[s.id] !== undefined).length
    const stat = (v: string, k: L) => `<div><b>${v}</b><span>${loc(k)}</span></div>`
    this.el.innerHTML = `
      <div class="mm-left">
        ${logoHtml()}
        <nav class="mm-list">${ITEMS.map(([id, name, , h], i) => `
          <button class="mi st ${i ? '' : 'default'}" data-nav data-a="${id}" style="--c:${hueCss(h)};--i:${i}" ${id === 'quit' && !window.native ? 'disabled' : ''}>
            <span class="mi-n">0${i + 1}</span><span class="mi-t">${loc(name)}</span>
          </button>`).join('')}
        </nav>
        <div class="mm-desc"></div>
      </div>
      <div class="mm-right">
        <div class="mm-bal panel st" style="--i:2"><small>${loc(l('Lumens', '流明'))}</small>${lumens(fmtNum(d.lumens), 'big')}</div>
        <div class="mm-prog panel st" style="--i:3">
          <h4>${loc(l('Progress', '进度'))}</h4>
          <div class="mm-stats">
            ${stat(`${cleared}/${STAGES.length}`, l('Stages cleared', '已通关'))}
            ${stat(`${chars}/${CHARACTERS.length}`, l('Characters', '角色'))}
            ${stat(`${d.achievements.length}/${ACHIEVEMENTS.length}`, l('Achievements', '成就'))}
            ${stat(fmtNum(d.stats.kills), l('Total kills', '总击杀'))}
          </div>
        </div>
        ${last ? `
        <div class="mm-last panel st ${last.win ? 'win' : 'lose'}" style="--i:4;--c:${lastChar ? css(lastChar.color) : '#fff'}">
          <h4>${loc(l('Last fall', '上一次坠落'))}</h4>
          <div class="mm-last-b">
            ${lastChar ? shapeSvg(lastChar.shape, css(lastChar.color), 'shape sm') : ''}
            <div>
              <b>${lastChar ? loc(lastChar.name) : last.char} · ${lastStage ? loc(lastStage.name) : last.stage}${last.asc ? ` · A${last.asc}` : ''}</b>
              <span>${last.win ? loc(l('Cleared', '通关')) : loc(l('Fell', '陨落'))} · ${fmtTime(last.time)} · ${loc(l('Lv', '等级'))} ${last.level} · ${fmtNum(last.kills)} ${loc(l('kills', '击杀'))}</span>
            </div>
          </div>
        </div>` : ''}
      </div>
      <div class="ver">v${VERSION}</div>
      ${prompts([['confirm', T.select]])}`
    this.on('[data-a]', (b) => this.open(b.dataset.a!))
  }

  private open(id: string) {
    audio.sfx('uiSelect')
    if (id === 'play') ui.push(new CharSelectScreen())
    if (id === 'forge') ui.push(new ForgeScreen())
    if (id === 'codex') ui.push(new CodexScreen())
    if (id === 'ach') ui.push(new AchievementsScreen())
    if (id === 'settings') ui.push(new SettingsScreen())
    if (id === 'credits') ui.push(new CreditsScreen())
    if (id === 'quit') this.quit()
  }

  private quit() {
    ui.push(new ConfirmScreen({ title: l('Quit PRISMFALL?', '退出 PRISMFALL？'), yes: l('Quit', '退出'), danger: true, onYes: () => window.native?.quit() }))
  }

  back() {
    if (window.native) this.quit()
  }
}
