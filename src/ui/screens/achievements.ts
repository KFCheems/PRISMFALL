import { l, loc } from '../../core/i18n'
import { save } from '../../core/save'
import { ACHIEVEMENTS } from '../../game/registry'
import { Screen } from '../ui'
import { LOCK, T, achDone, achProgress, prompts, rewardText } from '../kit'
import type { Ach } from '../kit'

/** how many achievements are unlocked vs total */
const count = (list: Ach[]) => list.filter((a) => achDone(a.id)).length

/** Achievement list: locked / unlocked rows with hidden secrecy, progress bars and rewards. */
export class AchievementsScreen extends Screen {
  constructor() {
    super('ach menu')
    this.render()
  }

  render() {
    const all = ACHIEVEMENTS as Ach[], got = count(all)
    this.el.innerHTML = `
      <header class="hdr st">
        <div class="hdr-t"><small>${loc(l('Feats of Light', '光之功绩'))}</small><h1>${loc(l('Achievements', '成就'))}</h1></div>
        <div class="hdr-r ach-count"><b>${got}</b><small>/ ${all.length}</small></div>
      </header>
      <div class="ach-list scroll">${all.map((a, i) => this.row(a, i)).join('')}</div>
      ${prompts([['confirm', T.select], ['back', T.back]])}`
  }

  private row(a: Ach, i: number) {
    const done = achDone(a.id)
    const secret = !!a.hidden && !done
    const prog = achProgress(a)
    const name = secret ? '???' : loc(a.name)
    const desc = secret ? loc(l('A hidden feat. Keep playing to reveal it.', '一个隐藏的功绩。继续游玩以揭晓。')) : loc(a.desc)
    const reward = done ? '' : rewardText(a)
    const bar = prog && !secret
      ? `<div class="ach-bar"><span style="width:${Math.min(100, Math.round((prog[0] / Math.max(1, prog[1])) * 100))}%"></span><em>${Math.min(prog[0], prog[1])} / ${prog[1]}</em></div>`
      : ''
    return `<div class="ach-row st ${done ? 'done' : 'locked'} ${secret ? 'secret' : ''}" data-nav data-id="${a.id}" style="--i:${Math.min(i, 12)}">
      <span class="ach-badge">${done ? '✓' : secret ? '?' : LOCK}</span>
      <div class="ach-body">
        <b class="ach-name">${name}</b>
        <p class="ach-desc">${desc}</p>
        ${bar}
        ${reward ? `<span class="ach-reward">${'✦'} ${reward}</span>` : ''}
      </div>
    </div>`
  }
}
