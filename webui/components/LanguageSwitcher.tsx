'use client'

import { LANGUAGES } from '@/lib/i18n'
import { Dropdown } from './Dropdown'
import { useI18n } from './providers'

/** 站点界面语言切换（持久化到 localStorage，仅影响文案，不改变地区数据） */
export function LanguageSwitcher() {
  const { lang, setLang, t } = useI18n()
  const current = LANGUAGES.find((l) => l.code === lang)

  return (
    <Dropdown
      label={t('site.language')}
      width="w-52"
      button={
        <>
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="9" />
            <path strokeLinecap="round" d="M3 12h18M12 3c2.5 2.5 2.5 15.5 0 18M12 3c-2.5 2.5-2.5 15.5 0 18" />
          </svg>
          <span className="hidden max-w-24 truncate sm:block">{current?.nativeName ?? lang}</span>
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 opacity-60" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
          </svg>
        </>
      }
      items={LANGUAGES.map((l) => ({
        key: l.code,
        label: l.nativeName,
        hint: l.code,
        active: l.code === lang,
        onSelect: () => setLang(l.code)
      }))}
    />
  )
}
