export type Lang = 'en' | 'zh'
/** A localized string. Every player-facing text in content defs uses this. */
export interface L {
  en: string
  zh: string
}

let lang: Lang = navigator.language?.toLowerCase().startsWith('zh') ? 'zh' : 'en'
const listeners: (() => void)[] = []

export const getLang = () => lang
export function setLang(l: Lang) {
  lang = l
  document.documentElement.lang = l === 'zh' ? 'zh-CN' : 'en'
  listeners.forEach((f) => f())
}
export const onLang = (f: () => void) => listeners.push(f)

/** resolve a localized string, optionally formatting {placeholders} */
export function loc(l: L | string, vars?: Record<string, string | number>) {
  const s = typeof l === 'string' ? l : (l[lang] ?? l.en)
  return vars ? s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? '')) : s
}

export const l = (en: string, zh: string): L => ({ en, zh })
