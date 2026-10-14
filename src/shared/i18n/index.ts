// 轻量 i18n 核心：扁平点号键字典 + {占位符} 插值，主进程与渲染层共用同一份实现
import en from './locales/en.json'
import zhCN from './locales/zh-CN.json'
import zhTW from './locales/zh-TW.json'
import ru from './locales/ru.json'
import ja from './locales/ja.json'
import ko from './locales/ko.json'
import fr from './locales/fr.json'
import hi from './locales/hi.json'
import es from './locales/es.json'
import pt from './locales/pt.json'
import pl from './locales/pl.json'
import de from './locales/de.json'
import bo from './locales/bo.json'
import ug from './locales/ug.json'
import ms from './locales/ms.json'
import ar from './locales/ar.json'

/** 支持的语言代码 */
export type LanguageCode =
  | 'en'
  | 'zh-CN'
  | 'zh-TW'
  | 'ru'
  | 'ja'
  | 'ko'
  | 'fr'
  | 'hi'
  | 'es'
  | 'pt'
  | 'pl'
  | 'de'
  | 'bo'
  | 'ug'
  | 'ms'
  | 'ar'

/** 语言偏好：auto 表示跟随系统语言 */
export type LanguagePreference = 'auto' | LanguageCode

export interface LanguageMeta {
  code: LanguageCode
  /** 该语言的本地化名称（以自身文字书写） */
  nativeName: string
  /** 书写方向 */
  dir: 'ltr' | 'rtl'
}

/** 语言清单（顺序与语言选择器展示一致） */
export const LANGUAGES: LanguageMeta[] = [
  { code: 'en', nativeName: 'English', dir: 'ltr' },
  { code: 'zh-CN', nativeName: '简体中文', dir: 'ltr' },
  { code: 'zh-TW', nativeName: '繁體中文', dir: 'ltr' },
  { code: 'ru', nativeName: 'Русский', dir: 'ltr' },
  { code: 'ja', nativeName: '日本語', dir: 'ltr' },
  { code: 'ko', nativeName: '한국어', dir: 'ltr' },
  { code: 'fr', nativeName: 'Français', dir: 'ltr' },
  { code: 'hi', nativeName: 'हिन्दी', dir: 'ltr' },
  { code: 'es', nativeName: 'Español', dir: 'ltr' },
  { code: 'pt', nativeName: 'Português', dir: 'ltr' },
  { code: 'pl', nativeName: 'Polski', dir: 'ltr' },
  { code: 'de', nativeName: 'Deutsch', dir: 'ltr' },
  { code: 'bo', nativeName: 'བོད་ཡིག', dir: 'ltr' },
  { code: 'ug', nativeName: 'ئۇيغۇرچە', dir: 'rtl' },
  { code: 'ms', nativeName: 'Bahasa Melayu', dir: 'ltr' },
  { code: 'ar', nativeName: 'العربية', dir: 'rtl' }
]

/** 所有语言的字典集合 */
export const DICTS: Record<LanguageCode, Record<string, string>> = {
  en,
  'zh-CN': zhCN,
  'zh-TW': zhTW,
  ru,
  ja,
  ko,
  fr,
  hi,
  es,
  pt,
  pl,
  de,
  bo,
  ug,
  ms,
  ar
}

/** 语言代码 -> 书写方向 */
export function isRtl(lang: LanguageCode): boolean {
  return LANGUAGES.find((l) => l.code === lang)?.dir === 'rtl'
}

function normalizeLocale(locale: string): string {
  return (locale || '').trim().toLowerCase().replace(/_/g, '-')
}

/**
 * 解析生效语言：偏好为具体语言时直接使用；为 auto 时按系统语言匹配，匹配不到回退英语。
 * 兼容 zh-Hans / zh-Hant / zh-TW / zh-HK 等变体，以及仅含基语言（如 bo、ug）的场合。
 */
export function resolveLanguage(pref: LanguagePreference | undefined, systemLocale: string): LanguageCode {
  if (pref && pref !== 'auto') {
    if (LANGUAGES.some((l) => l.code === pref)) return pref
  }
  const raw = normalizeLocale(systemLocale)
  if (!raw) return 'en'
  if (raw.startsWith('zh')) {
    if (raw.includes('hant') || raw.includes('tw') || raw.includes('hk') || raw.includes('mo')) return 'zh-TW'
    return 'zh-CN'
  }
  const exact = LANGUAGES.find((l) => normalizeLocale(l.code) === raw)
  if (exact) return exact.code
  const base = raw.split('-')[0]
  const hit = LANGUAGES.find((l) => normalizeLocale(l.code).split('-')[0] === base)
  return hit?.code ?? 'en'
}

const PLACEHOLDER = /\{(\w+)\}/g

/** 取字典中的文案：缺失时回退英语，再缺失时回退键名 */
export function translate(
  lang: LanguageCode,
  key: string,
  params?: Record<string, string | number>
): string {
  const dict = DICTS[lang] ?? DICTS.en
  let text = dict[key] ?? DICTS.en[key] ?? key
  if (params) {
    text = text.replace(PLACEHOLDER, (match, name: string) =>
      params[name] !== undefined ? String(params[name]) : match
    )
  }
  return text
}

/** 字典中是否存在该键（用于决定是否用内置文案覆盖清单数据） */
export function hasTranslation(lang: LanguageCode, key: string): boolean {
  const dict = DICTS[lang] ?? DICTS.en
  return Boolean(dict[key] ?? DICTS.en[key])
}

export type Translator = (key: string, params?: Record<string, string | number>) => string

/** 绑定语言的翻译函数（主进程可直接使用） */
export function createTranslator(lang: LanguageCode): Translator {
  return (key, params) => translate(lang, key, params)
}
