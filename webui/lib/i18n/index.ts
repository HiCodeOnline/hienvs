// 站点 i18n：复用客户端的 16 种语言清单与 16 份字典，叠加站点专属键后统一提供翻译。
// 实现与客户端 src/shared/i18n/index.ts 保持一致（扁平点号键 + {占位符} + en 兜底）。
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
import { SITE_KEYS } from './site-keys'

/** 支持的语言代码（与客户端一致） */
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

export interface LanguageMeta {
  code: LanguageCode
  nativeName: string
  dir: 'ltr' | 'rtl'
}

/** 语言清单（顺序与语言选择器展示一致，复制自客户端） */
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

const CLIENT_DICTS: Record<LanguageCode, Record<string, string>> = {
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

/** 客户端字典 + 站点专属键（站点键缺失时回退英语站点键） */
export const DICTS: Record<LanguageCode, Record<string, string>> = Object.fromEntries(
  (Object.keys(CLIENT_DICTS) as LanguageCode[]).map((code) => [
    code,
    { ...CLIENT_DICTS[code], ...(SITE_KEYS[code] ?? SITE_KEYS.en) }
  ])
) as Record<LanguageCode, Record<string, string>>

/** 语言代码 -> 书写方向 */
export function isRtl(lang: LanguageCode): boolean {
  return LANGUAGES.find((l) => l.code === lang)?.dir === 'rtl'
}

function normalizeLocale(locale: string): string {
  return (locale || '').trim().toLowerCase().replace(/_/g, '-')
}

/** 解析生效语言：优先用户偏好，其次按系统语言匹配，匹配不到回退英语 */
export function resolveLanguage(pref: string | undefined, systemLocale: string): LanguageCode {
  if (pref && LANGUAGES.some((l) => l.code === pref)) return pref as LanguageCode
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
export function translate(lang: LanguageCode, key: string, params?: Record<string, string | number>): string {
  const dict = DICTS[lang] ?? DICTS.en
  let text = dict[key] ?? DICTS.en[key] ?? key
  if (params) {
    text = text.replace(PLACEHOLDER, (match, name: string) =>
      params[name] !== undefined ? String(params[name]) : match
    )
  }
  return text
}

export type Translator = (key: string, params?: Record<string, string | number>) => string

/** 地区展示名：站点键缺失时（新增地区）回退到地区自身的 nativeName */
export function regionLabel(t: Translator, region: { code: string; nativeName: string }): string {
  const key = `region.${region.code}`
  const translated = t(key)
  return translated === key ? region.nativeName : translated
}
