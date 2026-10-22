import { l, loc } from '../../core/i18n'
import { audio } from '../../core/audio'
import { fmtNum } from '../../core/math'
import { save } from '../../core/save'
import type { ShopDef } from '../../game/types'
import { SHOP } from '../../game/registry'
import { buyShop, refundShop, shopPrice } from '../../game/meta'
import { Screen, svgIcon, ui } from '../ui'
import { LOCK, T, lumens, pips, prompts } from '../kit'
import { ConfirmScreen, SURE, confirmTwice } from './confirm'

// group ids in the order they appear in content/shop.ts (inferred from the source comments)
const GROUPS: [ReturnType<typeof l>, string[]][] = [
  [l('Force', '力量'), ['might', 'vitality', 'armor', 'recovery']],
  [l('Reach & Tempo', '波及与节奏'), ['haste', 'reach', 'velocity', 'persistence', 'swiftness']],
  [l('Fortune', '气运'), ['magnetism', 'fortune', 'insight', 'avarice']],
  [l('Run Tools', '局内工具'), ['reroll', 'skip', 'banish']],
  [l('Prestige', '至臻'), ['second_light', 'multiplicity', 'choice']],
]
const byId = new Map(SHOP.map((d) => [d.id, d]))
const level = (d: ShopDef) => save.data.shop[d.id] ?? 0

/** The Prism Forge: permanent, refundable shop upgrades grouped by theme, bought with Lumens. */
export class ForgeScreen extends Screen {
  constructor() {
    super('forge menu')
    this.lock = 0.15
    this.render()
    this.el.addEventListener('focusin-nav', (e) => {
      const d = byId.get((e.target as HTMLElement).dataset.id ?? '')
      if (d) this.show(d)
    })
  }

  render() {
    this.el.innerHTML = `
      <header class="hdr st">
        <div class="hdr-t"><small>${loc(l('Permanent Upgrades', '永久强化'))}</small><h1>${loc(l('Prism Forge', '棱镜熔炉'))}</h1></div>
        <div class="hdr-r fg-bal">${lumens(fmtNum(save.data.lumens), 'big')}</div>
      </header>
      <div class="fg-body">
        <div class="fg-grid scroll">
          ${GROUPS.map(([name, ids], gi) => this.group(name, ids, gi)).join('')}
        </div>
        <aside class="fg-detail panel st" style="--i:9"></aside>
      </div>
      <div class="fg-foot">
        <button class="btn small" data-nav data-a="refund" ${save.data.forgeSpent > 0 ? '' : 'disabled'}>${loc(l('Refund All', '全部退款'))} · ${lumens(fmtNum(save.data.forgeSpent))}</button>
      </div>
      ${prompts([['confirm', T.select], ['back', T.back]])}`
    // clicking a tile previews it; the buy button in the detail panel commits the purchase
    this.on('.fg-item', (b) => this.show(byId.get(b.dataset.id!)!))
    this.$('[data-a=refund]').addEventListener('click', () => this.refund())
    this.show(byId.get('might')!)
  }

  private group(name: ReturnType<typeof l>, ids: string[], gi: number) {
    const items = ids.map((id) => byId.get(id)!).filter(Boolean)
    return `<section class="fg-group st" style="--i:${gi}">
      <h3 class="fg-gname">${loc(name)}</h3>
      <div class="fg-items">${items.map((d) => this.tile(d)).join('')}</div>
    </section>`
  }

  private tile(d: ShopDef) {
    const lv = level(d), price = shopPrice(d), maxed = lv >= d.max, afford = save.data.lumens >= price
    return `<button class="fg-item st ${maxed ? 'max' : ''} ${!maxed && afford ? 'afford' : ''} ${!maxed && !afford ? 'poor' : ''}"
      data-nav data-id="${d.id}" style="--c:var(--C)">
      <span class="fg-ic">${svgIcon(d.icon, 'var(--C)')}</span>
      <span class="fg-n">${loc(d.name)}</span>
      ${pips(lv, d.max)}
      <span class="fg-cost">${maxed ? LOCK : lumens(fmtNum(price))}</span>
    </button>`
  }

  private show(d: ShopDef) {
    const lv = level(d), price = shopPrice(d), maxed = lv >= d.max, afford = save.data.lumens >= price
    const box = this.$('.fg-detail')
    box.classList.toggle('max', maxed)
    box.innerHTML = `
      <div class="fg-dic">${svgIcon(d.icon, 'var(--C)')}</div>
      <h2>${loc(d.name)}</h2>
      <div class="fg-pips">${pips(lv, d.max)} <small>${lv} / ${d.max}</small></div>
      <p class="fg-desc">${loc(d.desc)}</p>
      <div class="fg-buy">
        ${maxed
          ? `<span class="fg-maxed">${loc(l('Maxed out', '已达上限'))}</span>`
          : afford
            ? `<button class="btn prime" data-buy>${loc(l('Forge', '锻造'))} · ${lumens(fmtNum(price))}</button>`
            : `<button class="btn" disabled>${loc(l('Need {n} more', '还需 {n}'), { n: fmtNum(price - save.data.lumens) })}</button>`}
      </div>`
    box.querySelector('[data-buy]')?.addEventListener('click', () => this.choose(d))
  }

  private choose(d: ShopDef) {
    const price = shopPrice(d), lv = level(d)
    if (lv >= d.max) return audio.sfx('uiDeny')
    if (save.data.lumens < price) return audio.sfx('uiDeny')
    ui.push(new ConfirmScreen({
      title: loc(l('Forge {n}?', '锻造{n}？'), { n: loc(d.name) }),
      body: `${loc(d.desc)}<br>${lumens(fmtNum(price))}`,
      yes: l('Forge', '锻造'),
      onYes: () => {
        if (!buyShop(d)) return
        audio.sfx('purchase')
        this.refresh(d.id)
        ui.toast(`<small>${loc(l('Forged', '已锻造'))}</small><b>${loc(d.name)}</b>`, [0.24, 1, 0.95])
      },
    }))
  }

  private refund() {
    const amt = save.data.forgeSpent
    if (amt <= 0) return audio.sfx('uiDeny')
    confirmTwice(
      {
        title: loc(l('Refund all upgrades?', '退还所有强化？')),
        body: loc(l('Recover {n} Lumens and reset every Forge level.', '返还 {n} 流明，并重置所有熔炉等级。'), { n: fmtNum(amt) }),
        yes: l('Refund', '退款'),
        onYes: () => {
          const total = refundShop()
          audio.sfx('purchase')
          this.refresh('might')
          ui.toast(`<small>${loc(l('Refunded', '已退款'))}</small><b>+${fmtNum(total)}</b>`, [1, 0.82, 0.24])
        },
      },
      { title: loc(l('This clears every Forge purchase.', '这将清空所有熔炉购买。')), body: SURE.en },
    )
  }

  /** rebuild DOM in place after a purchase / refund */
  private refresh(id: string) {
    ui.rerender(this)
    const d = byId.get(id)
    if (d) this.show(d)
  }
}
