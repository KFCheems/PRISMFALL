import { loc } from '../../core/i18n'
import { audio } from '../../core/audio'
import type { World } from '../../game/world'
import { game } from '../../game/game'
import { Screen, ui } from '../ui'

export class PauseScreen extends Screen {
  constructor(readonly w: World) {
    super('pause', `
      <div class="menu-title">${loc({ en: 'PAUSED', zh: '暂停' })}</div>
      <div class="menu-list">
        <button class="btn default" data-nav data-a="resume">${loc({ en: 'Resume', zh: '继续' })}</button>
        <button class="btn" data-nav data-a="restart">${loc({ en: 'Restart', zh: '重新开始' })}</button>
        <button class="btn" data-nav data-a="quit">${loc({ en: 'Abandon Run', zh: '放弃本局' })}</button>
      </div>`)
    this.$$('[data-a]').forEach((b) =>
      b.addEventListener('click', () => {
        audio.sfx('uiSelect')
        const a = b.dataset.a
        if (a === 'resume') ui.pop()
        if (a === 'restart') game.restart()
        if (a === 'quit') {
          ui.pop()
          w.abandon()
        }
      }),
    )
  }
}
