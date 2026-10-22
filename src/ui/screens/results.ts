import { loc } from '../../core/i18n'
import { fmtNum, fmtTime } from '../../core/math'
import type { RunResult } from '../../game/types'
import type { Unlock } from '../../game/meta'
import { game } from '../../game/game'
import { weaponById } from '../../game/registry'
import { Screen, ui } from '../ui'
import { TitleScreen } from './title'

export class ResultsScreen extends Screen {
  constructor(r: RunResult, unlocks: Unlock[]) {
    super('results', `
      <div class="menu-title ${r.win ? 'win' : 'lose'}">${r.win ? loc({ en: 'STAGE CLEARED', zh: '关卡通过' }) : loc({ en: 'LIGHT EXTINGUISHED', zh: '光芒熄灭' })}</div>
      <div class="stats">
        <div><b>${fmtTime(r.time)}</b><span>${loc({ en: 'Survived', zh: '存活' })}</span></div>
        <div><b>${fmtNum(r.kills)}</b><span>${loc({ en: 'Kills', zh: '击杀' })}</span></div>
        <div><b>${r.level}</b><span>${loc({ en: 'Level', zh: '等级' })}</span></div>
        <div><b>+${fmtNum(r.lumens)}</b><span>${loc({ en: 'Lumens', zh: '流明' })}</span></div>
      </div>
      <div class="rs-cols">
        <div class="rs-col">
          <h4>${loc({ en: 'Damage by weapon', zh: '武器伤害' })}</h4>
          <div class="dmg-table">${[...r.weapons]
            .sort((a, b) => b.dmg - a.dmg)
            .map((x) => `<div><span>${loc(weaponById.get(x.id)!.name)} <em>Lv${x.level}</em></span><b>${fmtNum(x.dmg)}</b></div>`)
            .join('')}</div>
        </div>
        ${unlocks.length ? `<div class="rs-col">
          <h4>${loc({ en: 'Unlocked', zh: '已解锁' })}</h4>
          <div class="unlocks">${unlocks.map((u) => `<div class="unlok"><i>✦</i><span>${u.label}</span></div>`).join('')}</div>
        </div>` : ''}
      </div>
      <div class="menu-list row">
        <button class="btn default" data-nav data-a="again">${loc({ en: 'Play Again', zh: '再来一局' })}</button>
        <button class="btn" data-nav data-a="menu">${loc({ en: 'Main Menu', zh: '主菜单' })}</button>
      </div>`)
    this.lock = 0.8
    this.$$('[data-a]').forEach((b) =>
      b.addEventListener('click', () => {
        if (b.dataset.a === 'again') game.restart()
        else {
          game.end()
          ui.reset(new TitleScreen())
        }
      }),
    )
  }
  back() {}
}
