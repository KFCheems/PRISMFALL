import { l, loc } from '../../core/i18n'
import { Screen } from '../ui'
import { prompts, T } from '../kit'
import { VERSION } from './title'

interface Row {
  role: ReturnType<typeof l>
  body: ReturnType<typeof l>
}

const ROWS: Row[] = [
  { role: l('Design', '设计'), body: l('A neon roguelite about bending light and surviving the fall.', '一款关于折射光芒、在坠落中求生的霓虹肉鸽游戏。') },
  { role: l('Code', '程序'), body: l('Everything you see and hear, written from scratch.', '你所见所闻，皆从零写就。') },
  { role: l('Art direction', '美术指导'), body: l('SDF shapes, prismatic bloom and a spectrum of neon.', 'SDF 图形、棱镜泛光与一整个霓虹光谱。') },
  { role: l('Audio', '音频'), body: l('WebAudio synthesis — no sample files, every sound generated live.', 'WebAudio 合成——没有采样文件，所有声音实时生成。') },
  { role: l('Engine', '引擎'), body: l('Custom WebGL2 renderer with a hand-rolled particle system.', '自研 WebGL2 渲染器与手工实现的粒子系统。') },
  { role: l('Tools', '工具'), body: l('Vite · Electron · steamworks.js', 'Vite · Electron · steamworks.js') },
]

/** Credits: a quiet, scrollable page of the people and tools behind PRISMFALL. */
export class CreditsScreen extends Screen {
  constructor() {
    super('credits menu')
    this.render()
  }

  render() {
    this.el.innerHTML = `
      <header class="hdr st">
        <div class="hdr-t"><small>${loc(l('The Light Behind', '光之幕后'))}</small><h1>${loc(l('Credits', '制作人员'))}</h1></div>
        <div class="hdr-r cr-ver">v${VERSION}</div>
      </header>
      <div class="cr-body scroll">
        <div class="cr-logo st" style="--i:1">PRISMFALL</div>
        <div class="cr-rows">
          ${ROWS.map((r, i) => `<div class="cr-row st" style="--i:${i + 2}"><small>${loc(r.role)}</small><p>${loc(r.body)}</p></div>`).join('')}
        </div>
        <div class="cr-thanks st" style="--i:${ROWS.length + 2}">
          <p>${loc(l('Thank you for playing. Bend light. Mix color. Survive the fall.', '感谢游玩。折射光芒，调和色彩，在坠落中幸存。'))}</p>
          <small>${loc(l('Built with love, late at night, under a prism.', '以热爱铸就，深夜里，棱镜之下。'))}</small>
        </div>
      </div>
      ${prompts([['back', T.back]])}`
  }
}
