import { l, loc, type L } from '../../core/i18n'
import { audio } from '../../core/audio'
import { Screen, ui } from '../ui'
import { T, prompts } from '../kit'

export interface ConfirmOpts {
  title: L | string
  body?: string
  yes?: L | string
  no?: L | string
  /** destructive: red styling, focus starts on "cancel" */
  danger?: boolean
  onYes(): void
}

/** Small modal yes/no dialog drawn over the current screen. */
export class ConfirmScreen extends Screen {
  overlay = true

  constructor(readonly o: ConfirmOpts) {
    super('dialog')
    this.lock = 0.2
    this.render()
  }

  render() {
    const o = this.o
    this.el.innerHTML = `
      <div class="dlg panel ${o.danger ? 'danger' : ''}">
        <h2>${loc(o.title)}</h2>
        ${o.body ? `<p>${o.body}</p>` : ''}
        <div class="dlg-row">
          <button class="btn ${o.danger ? '' : 'default'} ${o.danger ? 'warn' : 'prime'}" data-nav data-a="yes">${loc(o.yes ?? T.confirm)}</button>
          <button class="btn ${o.danger ? 'default' : ''}" data-nav data-a="no">${loc(o.no ?? T.cancel)}</button>
        </div>
        ${prompts([['confirm', T.select], ['back', T.cancel]])}
      </div>`
    this.on('[data-a=yes]', () => {
      audio.sfx('uiSelect')
      ui.pop()
      o.onYes()
    })
    this.on('[data-a=no]', () => this.back())
  }
}

/** shorthand for a two-step destructive confirmation */
export const confirmTwice = (first: ConfirmOpts, second: Omit<ConfirmOpts, 'onYes'>) =>
  ui.push(new ConfirmScreen({ ...first, onYes: () => ui.push(new ConfirmScreen({ ...second, danger: true, onYes: first.onYes })) }))

export const SURE = l('Are you absolutely sure?', '真的确定吗？')
