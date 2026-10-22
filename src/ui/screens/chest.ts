import { loc } from '../../core/i18n'
import { css } from '../../core/math'
import type { World, ChestReward } from '../../game/world'
import { Screen, ui } from '../ui'

export class ChestScreen extends Screen {
  constructor(readonly w: World, rewards: ChestReward[]) {
    super('chest', `
      <div class="chest-title">${loc({ en: 'PRISM CACHE', zh: '棱镜宝匣' })}</div>
      <div class="rewards">${rewards.map((r, i) => `<div class="reward" style="--c:${css(r.color)};--d:${i * 0.18}s">${r.label}</div>`).join('')}</div>
      <button class="btn default" data-nav>${loc({ en: 'Continue', zh: '继续' })}</button>`)
    this.lock = 0.6
    this.$('button').addEventListener('click', () => this.close())
  }
  private close() {
    ui.pop()
    this.w.modal = false
  }
  back() {
    this.close()
  }
}
