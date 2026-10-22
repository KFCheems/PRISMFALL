import { l, loc, setLang, getLang } from '../../core/i18n'
import { audio } from '../../core/audio'
import { save } from '../../core/save'
import { renderer } from '../../core/gl'
import { Screen, ui } from '../ui'
import { T, glyph, prompts } from '../kit'
import { SURE, confirmTwice } from './confirm'
import type { Action } from '../../core/input'

type RowKind = 'lang' | 'slider' | 'toggle' | 'choice'
interface Row {
  id: string
  kind: RowKind
  name: ReturnType<typeof l>
}

const ROWS: Row[] = [
  { id: 'lang', kind: 'lang', name: l('Language', '语言') },
  { id: 'master', kind: 'slider', name: l('Master volume', '主音量') },
  { id: 'music', kind: 'slider', name: l('Music', '音乐') },
  { id: 'sfx', kind: 'slider', name: l('Effects', '音效') },
  { id: 'shake', kind: 'slider', name: l('Screen shake', '画面震动') },
  { id: 'bloom', kind: 'slider', name: l('Bloom', '泛光') },
  { id: 'renderScale', kind: 'slider', name: l('Render scale', '渲染缩放') },
  { id: 'aim', kind: 'choice', name: l('Aim', '瞄准') },
  { id: 'flashes', kind: 'toggle', name: l('Flashes', '闪光') },
  { id: 'dmgNumbers', kind: 'toggle', name: l('Damage numbers', '伤害数字') },
  { id: 'showFps', kind: 'toggle', name: l('Show FPS', '显示帧率') },
  { id: 'fullscreen', kind: 'toggle', name: l('Fullscreen', '全屏') },
  { id: 'reset', kind: 'lang', name: l('Reset save', '重置存档') },
]

const STEP: Record<string, number> = { master: 0.05, music: 0.05, sfx: 0.05, shake: 0.1, bloom: 0.1, renderScale: 0.1 }
const clamp01 = (v: number) => Math.max(0, Math.min(1, Math.round(v * 100) / 100))

/** Settings: language, audio, video and control prefs — saved on every change via save.write(). */
export class SettingsScreen extends Screen {
  constructor() {
    super('settings menu')
    this.lock = 0.15
    this.render()
  }

  render() {
    this.el.innerHTML = `
      <header class="hdr st">
        <div class="hdr-t"><small>${loc(l('Configure the Fall', '配置坠落'))}</small><h1>${loc(l('Settings', '设置'))}</h1></div>
      </header>
      <div class="set-list">${ROWS.map((r, i) => this.row(r, i)).join('')}</div>
      ${prompts([['left', T.adjust], ['confirm', T.select], ['back', T.back]])}`
    this.$$('[data-s]').forEach((el, i) => {
      const r = ROWS[i]
      el.addEventListener('click', () => this.activate(r))
    })
    this.$$('[data-d]').forEach((el) => el.addEventListener('click', (e) => {
      e.stopPropagation()
      const r = ROWS.find((x) => x.id === el.dataset.row)!
      this.adjust(r, +el.dataset.d!)
    }))
  }

  private row(r: Row, i: number) {
    const s = save.data.settings
    let control = ''
    if (r.id === 'lang') control = `<span class="set-val">${getLang() === 'zh' ? '简体中文' : 'English'}</span>`
    else if (r.id === 'reset') control = `<span class="set-val set-danger">${loc(l('Reset', '重置'))}</span>`
    else if (r.kind === 'slider') {
      const v = (s as unknown as Record<string, number>)[r.id]
      control = `<span class="set-slider"><i data-row="${r.id}" data-d="-1">◂</i><span class="set-track"><b style="width:${Math.round(v * 100)}%"></b></span><i data-row="${r.id}" data-d="1">▸</i><em>${Math.round(v * 100)}%</em></span>`
    } else if (r.kind === 'toggle') {
      const v = (s as unknown as Record<string, boolean>)[r.id]
      control = `<span class="set-tog ${v ? 'on' : ''}"><i></i></span>`
    } else if (r.kind === 'choice') {
      control = `<span class="set-choice">${['auto', 'manual'].map((a) => `<b class="${s.aim === a ? 'on' : ''}">${loc(a === 'auto' ? l('Auto', '自动') : l('Manual', '手动'))}</b>`).join('')}</span>`
    }
    return `<div class="set-row st ${r.id === 'reset' ? 'set-danger-row' : ''}" data-nav data-s="${r.id}" style="--i:${Math.min(i, 12)}">
      <span class="set-n">${loc(r.name)}</span>
      ${control}
      <i class="set-arrow">${glyph('left')}${glyph('right')}</i>
    </div>`
  }

  /** confirm/click: cycle toggles & choices, otherwise nudge a slider right (or open reset) */
  private activate(r: Row) {
    const s = save.data.settings
    if (r.kind === 'toggle') return this.toggle(r.id)
    if (r.kind === 'choice') return this.cycleAim()
    if (r.id === 'lang') return this.toggleLang()
    if (r.id === 'reset') return this.reset()
    if (r.kind === 'slider') this.adjust(r, 1)
  }

  private toggle(id: string) {
    const s = save.data.settings as unknown as Record<string, boolean>
    s[id] = !s[id]
    if (id === 'fullscreen') window.native?.setFullscreen(s[id])
    audio.sfx('uiSelect')
    this.commit(rerenderAll)
  }

  private cycleAim() {
    const s = save.data.settings
    s.aim = s.aim === 'auto' ? 'manual' : 'auto'
    audio.sfx('uiSelect')
    this.commit(rerenderAll)
  }

  private toggleLang() {
    const next = getLang() === 'zh' ? 'en' : 'zh'
    setLang(next)
    save.data.settings.lang = next
    audio.sfx('uiSelect')
    save.write()
    ui.relang()
  }

  private adjust(r: Row, dir: number) {
    const s = save.data.settings as unknown as Record<string, number>
    if (!(r.id in STEP)) return
    const step = STEP[r.id] ?? 0.1
    const lo = r.id === 'renderScale' ? 0.5 : 0
    s[r.id] = Math.max(lo, clamp01((s[r.id] ?? 0) + step * dir))
    audio.sfx('uiMove')
    if (r.id === 'renderScale') renderer.renderScale = s[r.id]
    if (r.id === 'bloom') renderer.post.bloom = s[r.id] * 1.5
    // volume sliders take effect immediately so the player can hear what they are setting
    if (r.id === 'master' || r.id === 'music' || r.id === 'sfx') audio.volumes(save.data.settings.master, save.data.settings.music, save.data.settings.sfx)
    this.commit(rerenderAll)
  }

  private reset() {
    confirmTwice(
      { title: loc(l('Reset all progress?', '重置所有进度？')), body: loc(l('Every unlock, Lumen and stat will be erased. Settings are kept.', '所有解锁、流明与统计都将清空。设置将被保留。')), yes: l('Reset', '重置'), onYes: () => {
        save.reset()
        audio.sfx('purchase')
        ui.toast(`<small>${loc(l('Save reset', '存档已重置'))}</small>`, [1, 0.3, 0.36])
        ui.rerender(this)
      } },
      { title: loc(l('This cannot be undone.', '此操作无法撤销。')), body: SURE.en },
    )
  }

  /** write the save once, then rebuild the list so every value is fresh */
  private commit(refresh: boolean) {
    save.write()
    if (refresh) ui.rerender(this)
  }

  action(a: Action) {
    const f = ui.focus
    const r = ROWS.find((x) => x.id === f?.dataset.s)
    if (r && (a === 'left' || a === 'right')) {
      if (r.kind === 'slider') return this.adjust(r, a === 'left' ? -1 : 1), true
      if (r.kind === 'toggle' || r.kind === 'choice') return a === 'right' ? (this.activate(r), true) : false
      if (r.id === 'lang') return this.toggleLang(), true
    }
    return false
  }
}

const rerenderAll = true
