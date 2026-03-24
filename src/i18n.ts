import ja from './locales/ja.json'
import en from './locales/en.json'

type Lang = 'ja' | 'en'
type Strings = Record<string, string>

const locales: Record<Lang, Strings> = { ja, en }
let currentLang: Lang = 'en'

export function setLang(lang: Lang): void {
  currentLang = lang
}

export function getLang(): Lang {
  return currentLang
}

export function t(key: string): string {
  return locales[currentLang][key] ?? key
}
